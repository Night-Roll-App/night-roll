# Night Roll — Technical Reference

The complete map of the player (`index.html`) for anyone (especially future
Claude sessions) continuing work. User-facing feature list also lives in the
in-app help sheet (File ▾ → Help; its body is `help/help.html`, fetched on
first open — see "Help sheet body" below). History: git log tells the build
story.

Live: https://night-roll-app.github.io/night-roll/ (GitHub Pages, main
branch, root). index.html + css/app.css + ES modules under src/ +
`vendor/vexflow.js`, served as-is. No build step — git push is deployment
(~1 min propagation; iPad may need a hard reload).

Tests: `npm test` (tools/run-tests.mjs: every vm test file, one at a time,
zero deps, Node's built-in runner). `python3 -m http.server 8000` hosts
the app at localhost:8000 (fetch needs http, so file:// won't work).
`tests/harness.mjs` loads src/ as real ES modules in a vm with a stub DOM
(docs/split-plan.md §3). Covers the
pure logic: MIDI parse, rollnotes parse/serialize round-trip, key math,
chord namer, duration decomposition, tempo maps, edit persistence. Run them
before committing player changes; add cases when touching that logic.
Shipping a feature means THREE writes: the code, its help-sheet entry,
and a keyword in the help drift-guard test ("help sheet covers every
shipped feature") — the guard fails the suite when help silently lags
the app, which happened to the key dial (2026-08-15 audit).
(2026-07-31 review verdict, second-opinioned: keep single-file until ~4–5k
lines — splitting adds Pages cache-skew risk for no payoff at this size.)

## Feature inventory

**Views:** piano roll (canvas) and engraved score (VexFlow → per-measure
cached canvases), toggled in the header, persisted. On song load the roll
auto-fits the whole song and its pitch range to the screen (fitView). Both share one
time-linear x-axis, the bar ruler, sections, markers, cursor, playhead,
subtitles, and gestures (Tracks shares the same ruler band too — `drawRuler`
is one function for all three views). Pinch zooms per axis (horizontal = time; vertical
= pitch rows, roll only). Roll zoom-out clamps to the song's own extents
(2026-08-07, Josh's spec): per-axis floors (pxqFloor/rowHFloor) flush to
the chop-trimmed bars and sounding pitch range, no padding — once time
fits, pinch-out only reveals pitch; once everything fits, it stops, and
the view snaps flush. fitView lands on the same floors, so the load view
IS the zoom-out limit. Score extras: intro column (clef/key/time) left
of bar 1; signatures redraw at key changes with cancellation naturals;
rests break beams; playhead/cursor interpolate notehead-to-notehead
(scoreTickToX), hopping glyphs only at key changes; zoom-out floor
computed from the densest measure (scoreModel.pxqMin — relaxes when dense
tracks are muted).

**Playhead strip (2026-10-03).** A band directly under the ruler, right
above the notes, in all three views — drawn by `drawPlayheadStripBand`
(called from `drawRuler`, so Roll/Tracks/Score all get it for free):
background a touch lighter than the roll (`--grid-soft`), bar lines strong,
beat lines faint, same tick math as the roll's own grid. Height plumbing:
`BASE_RULER_H`/`LANE_H`/`AUDIO_STRIP_H` sum into `S.STRIP_Y` (the OLD
meaning of `RULER_H` — ruler + section/chord/analysis rows + the audio
strip, no playhead strip; still the right boundary for bandEdge's grab zone
and lassoAnno's "reached into the ruler" check), then `S.RULER_H =
S.STRIP_Y + STRIP_H` — so every existing "offset the note area by
RULER_H" call site (hit-testing, drawing, clampView, tracksLaneH, score's
content top) keeps working unchanged; it just offsets a little further
down now. The strip's own moving playhead mark (`drawStripPlayhead`,
`stripPlayheadX`) is drawn AFTER `drawRuler` in `drawFull` and again in
`playbackFrame`'s per-frame overlay — never baked into the scene cache,
same discipline as each view's own cursor line, because `drawRuler`'s
opaque strip background would otherwise paint right over it. Gestures:
TAP moves `playCursor` to a beat-snapped tick (`seekOrMoveCursor`, shared
with the ruler's own tap-to-seek) WITHOUT touching `rangeSel` at all — no
park, no clear, no re-arm, byte-identical before/after (Josh, 2026-10-03:
"if I could click that spot under the ruler I wouldn't have that problem"
— tapping the ruler itself still parks an armed cycle, unchanged). DRAG
scrubs continuously via the existing `scrubTo`. `S.drag.stripCursor` is
the drag flag (alongside `.ruler`/`.rangeEdge`/`.bandEdge`), included in
the auto-follow suppression (`handMidGesture`) so a strip drag doesn't get
yanked out from under a finger either. Tests: `tests/gestures.test.mjs`'s
four "playhead strip" cases (tap/drag, armed/parked cycle).

**Playhead tag (2026-10-04).** The playhead's handle IS the strip's mark:
`drawStripPlayhead(x, color)` draws one rounded tag (`TAG_W` = 18 px wide,
`STRIP_H − 4` tall, `TAG_R` corners, bottom flush with `S.RULER_H` so the
view's 1.5 px line through the notes grows out of it; `--accent` at rest,
`--gold` rolling; a faint dark outline; clipped to the right of `RULER_W`).
The Logic-sized triangle that used to hang below the ruler in Roll, Tracks
and Score is gone — it covered the first row of notes (Josh, 2026-10-04:
"I don't like that it's not in that little strip, it's below the strip").
The cycle stays in the number band above (`BASE_RULER_H`), so the two never
overlap. Hit zone: `cursorHandleHit` is the strip band (`y ∈ [STRIP_Y,
RULER_H)`, `|dx| ≤ TAG_HIT` = 14 → a 29 px finger target) around
`stripPlayheadX()` — so it works in every mode AND while playing (the strip
already scrubbed mid-play; one rule for both). In `pointerdown` a press on
the playhead (the tag, or its line through the notes at rest in select
mode — `cursorHit`) sets `S.drag.onCursor` and rides the SAME
`S.drag.stripCursor` path (the old separate `S.drag.cursor` is folded in);
the one difference is on release: unmoved + `onCursor` leaves the cursor
exactly where it is (a plain strip tap would snap it to the nearest 8th).
Mid-play, `stripPlayheadX` follows `S.playCursor` while a strip/tag drag is
in progress (`S.drag.moved`), so the tag tracks the finger while the audio
keeps rolling; release calls `seekOrMoveCursor(S.playCursor, {fromHere})`
and playback picks up from there. `playbackFrame` now takes its x from
`stripPlayheadX()` too; its dirty-rect restore (±13 px around `phLastX`,
28 px wide) must keep covering `TAG_W` + outline — widen both together.
Tests: `tests/gestures.test.mjs` "the playhead's handle is a tag …" (path
points of `drawStripPlayhead` all inside the strip band, nothing drawn in
`(RULER_H, RULER_H + 16]`, Roll and Tracks), "a press on the tag is a
grab …" and "the tag drags while PLAYING too …".

**Go to bar + slide the cycle (DAW F5, 2026-10-04 — docs/daw-inventory.md
§4 #7).** The LCD's bar segment (`#lcdbarseg`, `tappable` like tempo/meter/
key) opens `#barjumpsheet`: `openBarJump()` pre-fills the current bar
(`curTick()`), shows "of N" (`askBarsCount()`), focuses + selects the field
so the number pad replaces the digits; `barJumpGo()` (Go, or Return in the
field) clamps to 1..N, closes, and calls `seekOrMoveCursor((bar−1)·barTicks,
{fromHere, noCountIn})` — the strip tap's options, so a rolling song restarts
there without a count-in and `rangeSel` is never touched; an empty field
keeps the sheet open (status line). Both live in src/input/gestures.js
(wired at the end of `initGestures1`); bars are linear `barTicks()` like
`updateLCD` itself. Cycle: `rangeEdge` now has a third value, `"mid"` — a
press inside the amber band more than 12 px from BOTH ends (ends keep
priority). `S.drag.range0` holds the span as grabbed; the slide engages only
past `RULER_RANGE_SLOP` (24 px, the ruler tap's own wobble allowance) and
sets `S.drag.rangeMoved`; from then `a = rulerSnapTick(range0.a + dx/ppt)`,
`b = a + len` — `rulerSnapTick` is `rulerSnapX`'s tick-side twin (16ths,
bar-magnetic within 14 screen px, clamped at 0), so the span snaps by its
START and never changes length; `off` clears (sliding re-arms, like
stretching). `endPointer`: an unmoved/under-slop "mid" press goes to
`tap(spos)` (park / re-arm, unchanged); a slid cycle while playing takes the
existing rangeEdge reschedule branch (`handMidGesture` already covers
`rangeEdge`, so auto-follow stays off during the slide). Tests:
tests/gestures.test.mjs "dragging the cycle's MIDDLE …" and "Go to bar …".

**Note menu — touch and hold (DAW F2, 2026-10-04 — docs/daw-inventory.md
§4 #4).** The second stage of the existing hold-to-grab: once a note is
GRABBED (`S.drag.noteEdit` — the 160 ms `HOLD_MS` dwell, or an instant
mouse / Pencil-instant / already-selected grab), `armNoteMenu(d)` starts a
`NOTE_MENU_MS` (600 ms) timer on the drag; it fires only while `S.drag` is
still that drag, un-`moved` (the 8 px mark) and not already open — a drag
cancels the timer the moment `moved` flips, a lift before it is today's tap.
`openNoteMenu(d)` shows `#notemenu` (index.html, `#voicemenu`'s CSS family,
z 62) at the finger — `d.x/d.y`, clamped inside `songRegionRight()` and the
viewport — pre-sets the velocity row from the first held note, calls
`updateEditButtons()` (its `set()` lists now include the `nm*` ids, so the
menu's disabled states are the row's) and marks `d.menuOpened`: from then
`pointermove` ignores the finger and `endPointer` clears both timers and
returns with no commit and no `tap()`. Items (wired in `initGestures1`, one
block): nmCut/nmCopy/nmPaste/nmDelete/nmSplit/nmQuant `.click()` the edit
row's button (`cutbtn`…`quantbtn` — same guards, messages, undo entries),
nmDup is ⌘D's `duplicateSelection()`, nmUndo/nmRedo are `editUndoPop`/
`editRedoPop`; the `#nmvel` range writes `#velslider.value` and re-dispatches
`input`/`change` on it, so the live preview and the one-undo-on-release are
the slider's own (`initNoteEditor5`). Dismissal: a document-level capture
`pointerdown` outside the menu closes it and, when the target is the canvas,
`stopPropagation()`s + `preventDefault()`s so the dismissing tap never
seeks, deselects or starts a gesture; any item closes it first. Clip grabs
(`kind` `clip*`) never arm it. **Three-finger undo/redo is not implemented
on purpose:** WebKit delivers iPadOS's system undo gestures only to
editable content (`beforeinput` with `historyUndo`/`historyRedo` on a
contenteditable/input), never to a canvas page, and a two-finger double-tap
collides with the pinch/pan grammar — Undo/Redo live in this menu, the edit
row, Edit ▾ and ⌘Z. `NOTE_MENU_MS` is the constant to tune by Josh's report
(the "way too damn hard" history). Tests: tests/gestures.test.mjs "note
menu (DAW F2) …" (timing to the ms, lift-first, move-first, Delete+Undo
share the row's undo entry, velocity one-undo, Duplicate, tap-away swallow,
Pencil never).

**Playback:** WebAudio. Pulse/pulse/triangle voices by track index; drum
tracks (name match or channel 10) get a synthesized kit. Per-track gain
nodes make mute/solo instant mid-playback. Songs loop at the final bar
(`songEndTick`) or per a "loop:" directive. Rewind ⏮. Speed slider
(25–200%, applies on release, snap-back button when off 100%) scales
tickToSec/secToTick via playRate; persists across songs. Persistent
AudioContext warmed on first touch, declick ramps, notes straddling the
cursor play their remainder (chase). Manual scroll during playback
suspends auto-follow until the playhead re-enters the view.

**Tracks:** chips mute (= fully hide, roll and score) and solo. Score model
rebuilds on toggle. Second tap on the selected chip opens the voice &
color menu, now grouped by family (Josh 2026-08-15: flat list got too
long): NES / waves, then SAMPLED instruments (his call after the synth
patches sounded "just okay") — 36 FluidR3_GM instruments across Keys &
mallets, Guitar & bass, Strings, Winds, Brass, Organ & choir, as
per-note MP3s in vendor/soundfonts/*.json (MIT, see LICENSE.md there;
~2MB per instrument, ~85MB total in the repo — web sessions should
clone with `--filter=blob:limit=1m` to skip them). The menu opens in
the current voice's family; ‹ backs out to the family list. Lazy per song: nothing
fetches at page load; a track using voice=sf-* fetches its instrument
once (browser-cached) and decodes ONLY the pitches the song actually
plays (a full 88-key decode would cost ~60MB RAM per instrument on the
iPad). finalizeNotes warms the pitch set AT SONG LOAD through an
OfflineAudioContext (`sfDecodeCtx`: no device, no gesture needed — the
AudioContext itself still waits for first touch), and `play()` waits up
to 1.5 s (`sfWaitForSong`, "loading violin…") for anything still
pending; only past that does an undecoded note fall back to a quiet
triangle for the pass (Josh, 2026-09-23: Threnody's violin used to
"kick in" a beat after Play, because the fetch began at that tap). The
2026-08-15 synth patches (voice=piano/pluck/strings/organ/bell) still
play for annotations that saved them but left the menu. Color via one
full-width `<input type=color>` picker
(swatch shortcuts removed same day per Josh — any hex, stored in the
track: directive as color=#rrggbb; `autoTrackColors` fills in the rest).
Default track colors (2026-10-02, replacing the 2026-09-30 fixed
+150° TRACK_COLORS walk — Josh: "orange, blue, PINK" at only 60° from
orange, and "there has to be some sort of algorithm that always picks
the furthest color away from all the colors you currently have in a
set") are a real greedy max-min: `TRACK_COLOR_CANDIDATES` is 24 hues
15° apart at one fixed saturation/lightness (`AUTO_COLOR_S`/`_L`),
hard-filtered to a lightness band and WCAG contrast >= 3 against the
roll's own surfaces (`ROLL_SURFACE_COLORS` — --bg and the pitch-row
shading drawFull paints, --grid-soft/--grid; no light theme to repeat
this for). `autoTrackColors(song.tracks)` assigns in track order:
S starts as the hue of every EXPLICIT color= in the song (any index,
Josh's own picks are always avoided), then each unset track takes the
candidate maximizing its minimum circular hue distance to everything
in S so far (ties prefer 30°/orange, then the lowest hue), memoized
per song (cache key = explicit colors + track count) so it's stable —
a track's auto color depends only on the tracks before it, never moves
when a later track is added. First three: orange(30°), blue(210°),
green(120°); FF4's 7-track set holds >= 45° between every pair, not
just neighbors. `trackColor(ti)` returns the explicit color or this
set's, wrapping mod the song's actual track count. `TRACK_COLORS`
survives as a plain categorical palette (sectionColors' band colors) —
the same candidates, walked in the order an all-auto track list would
get them. The chips hug their content: ▾ sits beside the last
chip, and the transport/LCD cluster stays pinned to the top row when
chips wrap (2026-08-15 iPad fixes). `darkreader-lock` meta keeps the
Dark Reader extension from repainting swatches gray.

**Local MIDI imports** (2026-08-15, Josh lost one to a song switch):
a picked MIDI becomes a device-local draft under `local/<name>.mid` —
reopens from Open → drafts ("local /" prefix), stays editable
(saveDraft allows local/ alongside compositions; note `ch` is preserved
so drums survive), never syncs (dirtySongs excludes local/), never
commits; Save As forks it into a real composition. The file input has
NO accept filter: iOS grays out extensions it doesn't recognize (.nsf
was unpickable) — the byte-sniff is the real gatekeeper.

**Metronome** (2026-08-14, ⏱ in the header): standalone, feature-rich —
meter 1–12 over 2/4/8/16 (bpm counts the DENOMINATOR beat, matching the
app's counting; compound meters default accents on each group of 3),
per-beat accent cells (tap: accent → normal → silent), subdivisions in
2/3/4, tempo slider + tap tempo, lookahead-scheduled NES square blips.
Plays through its own gain node straight to the destination, so the
song transport's master fade can't silence it — it clicks OVER a
playing song, which doubles as a crude meter audition. Settings persist
(ff1roll-met).

**Inspection:** tap note → pitch (spelled per active key), bar, beat in
1e&a counting, duration, velocity, track. Lasso mode (footer toggle):
drag-select across notes in any view (roll, score, fall); pitch list
shown; chord name behind a "Chord?" reveal (templates: triads, 6, 7s,
9s, sus, dim7, power-dyad "5"; slash inversions; missing-5th tolerance).
Lasso selection is EDITABLE (2026-08-07, for targets a rectangle can't
separate — undersea/underwater's interleaved pedal): each new box UNIONS
into the selection, tapping a note toggles it in/out (all three views
hit-test their own geometry: hitNote / scoreLassoTap / fallHitNote),
tapping empty space clears. Touch-first by design — no modifier keys on
iPad. Chord challenge (2026-08-07): tap a chord band in the ruler and
the same footer button reads "Challenge?" — opens a dialog built from
chordEvidence(): each label tone with its role (root/3rd/5th/7th...)
and whether it sounds (gold) or is missing (red), extras under an
"evidence, not verdict" heading (blue — pedals and passing tones land
there by design), per-channel note lists, and the namer's read of the
full stack, with a Copy button. Request-only, labeled bands only.

**Pitch-class finder** (2026-08-07, "find:" dropdown in the footer —
the sweep's most repeated operation, mode-hunting single degrees): pick
a pitch class and every occurrence highlights across all audible
channels while everything else dims to 15% — so zero hits reads as a
confident zero, which mode rulings depend on. Works in roll (accent
stroke), score (accent notehead boxes), and fall. Matches by pitch
CLASS (find Bb catches the capture's A#); options respell per the
governing key and carry the scale degree when one is set; the info
strip reports count + channels. Selector options rebuild on focus so
spellings track the current key.

**Instrument panel** (2026-08-07, 🎹 in the footer): a piano-keyboard /
guitar-fretboard strip above the footer, so Josh can think with the
instrument instead of purely symbolically. Lasso'd pitches light gold on
both instruments; sounding notes light live during playback in their
track's color (same palette as the roll/fall notes); every key
and fret is tappable (plays through master, so track mutes never silence
it — square voice on piano, triangle on guitar). Labels are the pitch
name spelled per the governing key plus the scale degree when a `key:`
directive governs the cursor (degrees never shown for undeclared keys —
key discovery stays the analyst's job). Guitar: standard tuning EADGBE, high-e on top
(tab convention), 24 frets, inlay dots, a lit pitch appears at every
playable position; a pitch off the neck octave-folds in (gtrFold),
drawn with a dashed ring + tiny ▴/▾ toward its true octave — seeing it
in the wrong octave beats not seeing it (Josh, 2026-08-07). Open state, tab, and Fall persist in localStorage.

**On-screen keyboard** (2026-10-04, docs/daw-inventory.md §1a — Josh:
"you can scroll it left and right … ours would play every note on the
piano if you try to scroll on it"; "it looks like a real keyboard rather
than ours just has the notes laid out"). Geometry lives in
`src/ui/piano.js`, DOM-free: the whole 88-key piano (A0–C8) at a FIXED
white-key width (`pianoKeyW`: 44 CSS px, 36 under 480 px wide — a FLOOR: once
the panel holds all 52 whites at that size, ≥ 2288 px, the keys stretch to
`W / 52` so the piano fills it; DAW F1, 2026-10-04; `pianoMaxScroll` is then
0, so ‹ › and swipes are no-ops), black
keys at real offsets (`PIANO_BLACK_OFF`: C♯/D♯ lean apart, F♯/A♯ lean
out, G♯ centred; 58% wide, 62% tall), and a scroll offset measured in
white keys (`pianoClampScroll`, `pianoScrollTo`, `pianoScrollCentering`,
`pianoVisibleRange`/`pianoRangeLabel` for the "C3 – E5" readout,
`pianoOffscreen` for the edge chevrons). app.js wraps it: `instScrollNow()`
resolves `S.instScroll` (null = home = the song's lowest octave, the old
`instRange()` start), `instGeom(W, H)` is the geometry every caller
(drawPiano, pianoHit, the Fall view) uses, and `instSetScroll()` is the
ONE writer — it clamps, stores `ff1roll-inst-scroll-piano`, redraws, and
refuses everything while `S.instLock` is on (so no gesture branch knows
about the lock; the ‹ › buttons are also disabled). Gestures
(`instPointerDown/Move/Up`, `S.instPtrs` per finger): a tap on an edge
chevron scrolls to its key; two fingers travelling sideways past
`INST_PAN_SLOP` become a `pan2` scroll in either mode — the chord they
started lets go (`instLetGo`: recNoteOff, flash cleared, sustained voices
released) and both fingers are `dead` until lifted; one finger in Play
mode is the old glissando untouched (Record depends on it); one finger in
Scroll mode (`S.instMode`, `ff1roll-inst-mode`) pans silently past the
slop and otherwise plays its key on release. Sustain (`S.instSustain`,
`ff1roll-inst-sustain`): `instPlay` parks the voice in `S.instHeld` with a
7 s exponential decay instead of the 0.5 s blip; restriking replaces it;
`instSetSustain(false)`, closing the panel, or `instReleaseAll()` fade
them out over 80 ms. Recording never sees it — recNoteOff still fires at
the finger's release. Look: `drawPiano` paints a dark rail, gradient
whites with rounded bottoms and a shadow lip, two-tone black keys with a
top highlight, C labels only when idle; lit colours, labels and rings are
unchanged; `instGrad` falls back to flat fills where the 2d context has
no gradients (the vm harness). The bar (`applyInstBar`): #instmodeseg
Play|Scroll, ‹ #instrange ›, #instlock (🔓/🔒 via setControl), #instsustain
— the piano-only ones hide on the Guitar tab. No auto-follow during
playback (kept simple on purpose; the chevrons cover it).

**Fall view** (2026-08-07, ▼ Fall in the panel's tab bar — which sits
BELOW the keys so nothing blocks the landing): Synthesia-style — the
main canvas becomes a vertical drop and notes fall down into the panel's
piano keys, landing on the accent "now" edge the moment they sound (the
keys light via the same live-pitch set). Time maps through seconds
(tickToSec), so tempo maps and the speed slider stay truthful; ~4.5 s of
music fills the drop (FALL_WINDOW). Bar lines ride with numbers, chord
changes ride gold lines with their symbol, black-key lanes are banded,
lasso'd notes keep their gold stroke. Piano-only: enabling Fall forces
the piano tab open; picking Guitar (or closing the panel) returns to
whichever of roll/score was active. Pan/pinch/cursor gestures are
disabled while falling — the view rides the playhead, or sits at the
cursor when stopped — but lasso mode works (finalizeLasso has a fall
branch hit-testing key columns × seconds), so boxed notes light the
keys below.

**Annotations:** see format below. + Note editor is type-first (Text note /
Section / Chord / Key change / Time signature / Loop point) with bar/beat
dropdowns and a 🎤 Speak dictation button (Web Speech API; hidden where
unsupported). Chord type gets a chip widget (root · ♭♮♯ · quality · /bass)
composing into an editable symbol box, plus an optional attached-note text
(✱ on the band). A ruler drag before + Note defaults the type to whichever
of section/chord was saved from a drag last (chord-entry runs stay in chord
mode). ☰ Notes lists everything grouped by type (Key / Meter / Sections /
Chords / Loop / Chop / Text notes; each group's + pre-picks that type),
rows open the editor, Delete works on synced notes too (permanent on Sync).
Chop (2026-08-06, Josh's import-fixup tool): a `chop:` directive
non-destructively trims the displayed song from either end — see the
format spec; implementation is a raw-notes snapshot (`song.rawNotes`)
that applyChop() carves the visible tracks from, so roll, score,
playback, and loop-at-end all follow for free.
Gold ruler flags; subtitle strip follows playback, with a ⊙ toggle that
highlights the active note's span (ambient range tints removed — on a
fully-annotated song they covered everything). The strip is a
constant-height slot (2026-08-07): present for the whole song whenever
the song has text notes, blank between them, long notes scroll inside —
per-note toggling reflowed the layout and made the instrument panel
bounce.

**Meter:** neutral 4/4 grid until a `timesig:` directive declares the
real meter (set via the editor's Time signature type — numerator/
denominator pickers, never free text). Same philosophy as keys: the
rhythmic grouping is the analyst's finding, so the app won't pre-commit
it. Changing meter over existing annotations demands a second Save tap
and converts every anchor (incl. loop directives) to preserve musical
position. cave (2/4) and menu (6/8) carry grandfathered declarations.
**The counted beat is the denominator note** (2026-08-06): X/4 counts
quarters, X/8 counts eighths, X/2 counts halves — so 6/8 bars run
beats 1–6, the way compound meter is actually counted. The roll grid
draws one line per beat, with a medium line every 3 beats in compound
meters (6/8, 9/8, 12/8) marking the big pulses. Anchors, beat
dropdowns, loop targets, and the info strip all use this unit; meter
changes convert anchors across unit changes through absolute time.

**Keys:** display defaults to C until a `key:` annotation exists — key
discovery is Josh's job, by design. Picker reworked 2026-08-07 (Josh's
handoff design, after the old signature-paired list wrote a silent wrong
`key: D`): FIRST dropdown = tonic pitch class only (enharmonic pairs
labeled "G♯/A♭"; keyNameFor picks the spelling landing on a real
signature — G♯m over A♭m, D♭ over C♯), SECOND = mode (major/minor +
church modes). Tonic-without-mode is a first-class PARTIAL: "mode?"
stores `key: G#/Ab?` — round-trips, shows in the ☰ KEY group and the
dropdown label ("tonic stored, NOT applied") — but creates no keyRegion:
no signature, no respelling, nothing downstream until the mode lands.
"Set Gm @ bar N" writes full directives at the cursor's bar.
**◯5 Circle of fifths** (footer button): live canvas chart — majors /
relative minors / vii° rings, signature counts, the movable degree
window (IV·I·V / ii·vi·iii / vii°), gold rim on the song's governing
key. Two independent motions (Josh, 2026-08-07): the WHEEL spins —
drag it anywhere (fractional while dragging, snaps to wedges on
release) or step it with ⟲ ⟳ — putting any key at 12 o'clock; the
degree WINDOW moves separately by tapping a wedge. Opens with the
song's key on top and windowed. Detail block gives the window key's
accidentals, scale, all seven triads, and IV/V neighbors.
Ranged keys revert automatically. The dropdown label reports the recorded
names: "key: not set (C)" vs "key: Gm ✓". Minor names map to the relative
major's signature for engraving (keyNameToSf). MIDI files carry true key signatures (via
tools/fix_keysigs.py) but the app deliberately ignores them for display.

**Compositions** (2026-08-15, File in the header — Josh's rulings from
the 08-14 handoff): New builds a blank 3-voice NES song (name/tempo/
meter dialog; the chosen meter is written as HIS timesig directive) at
`albums/compositions/nightroll/<slug>.mid` — his scratch space; promotion
to compositions/ proper happens via Claude Code on request. A
composition is the standard .mid + .rollnotes pair: writeMidi() (in-page
format-1 SMF writer, round-trip tested against parseMidi) produces the
.mid; File→Save PUTs both via the GitHub API. **writeMidi is a
synchronous hand port of tools/nsf/midi-write.mjs's `writeSongMidi`**
(2026-09-30, open-items.md "FORMATS AUDIT" #1-2, branch
shared-midi-writer) — the ONE writer's logic, kept in two places because
writeMidi runs inside plain click handlers and the vm test harness
(tests/harness.mjs), neither of which can `import()` (no
`importModuleDynamically` in the harness's vm context, and no build step
to bundle the module in). Both emit CC10 pan (`tr.midiPan`), CC70 duty
(`n.duty`), aftertouch decay (`n.ve`), per-note channel (`n.ch`, else the
track's own — drums stay on channel 10, 15 melodic channels cycle for the
rest so 16+ tracks never collide with drums), a key signature ONLY when
the song already declared one (never invented — Learning mode is the
law), and track names as proper VLQ-length UTF-8 (not the old one-byte
length + &255 mask, which corrupted >127-byte or non-Latin-1 names).
tests/night-roll.test.mjs ("writeMidi / writeSongMidi agree byte-for-byte"
+ round-trip tests) pins the two ports together; touching one without the
other reintroduces the drift the audit found — commitImports silently
dropping pan/duty/aftertouch/channel from every published capture. It
still does NOT carry generic CCs, program changes, or multiple meters —
see "Chip captures are locked" below. **Chip captures are
locked** — Save refuses anything outside nightroll/ (regenerable
pipeline output; a stray thumb must not corrupt the corpus) — but
File→Save As forks ANY song into nightroll/ with rollnotes inherited
verbatim plus provenance recording where it came from (drift is Josh's to
own, no app warnings — ruled) — a `"forked from <path>"` note through
2026-09-30; P4 (2026-10-01, docs/annotations-v2.md) moved that into the v2
file's `origin.from` header instead (see "Stored origin" above); old files
still carry (and this app still reads) the note. Cross-device freshness (2026-08-16): every repo write stamps the
rollnotes with 'saved' (epoch ms; v2 calls the same field `stamp`); drafts remember the stamp they're
based on plus a dirty flag. Load compares — newer repo + clean draft
switches to the repo silently; newer repo + dirty draft asks (keep
draft / take newer save); otherwise the draft wins as before. Offline
or unstamped repo = draft wins. Unsaved work auto-drafts to localStorage
(ff1roll-draft-<path>, full song JSON) on every edit; drafts win over
repo fetches on load and are listed under "Night Roll drafts" in the
picker. Pencil upgrades: dotted durations (8·, 4·, whole), p/mf/f
velocity segment, ⟲ single-stack undo; compositions get a ＋ track chip
(empty NES voice). The app maintains albums/manifest.json itself
(2026-08-15): Save inserts the song's catalog entry via the API and
refreshes the dropdown; File→Move to… relocates a composition between
Night Roll Sketches and My Compositions — PUT at the new path, DELETE
the old, manifest updated, every per-song localStorage key renamed
(tokenless fallback: draft-only local move). nightroll/ is its own
album via a nested album.json; build_manifest.mjs now scans one level
of subdirectories for album.json, so offline rebuilds agree with what
the app writes. The editable/locked line (isComposition, 08-15
tightening): nightroll/ is always editable; a song elsewhere under
compositions/ is editable only with a local draft on THIS device or a
provenance note at the top of the rollnotes — "forked from <path>"
(written by Save As) or "moved from <path>" (written by Move when it
leaves nightroll/, 2026-09-07) through 2026-09-30; P4 writes `origin.from`/
`origin.movedFrom` in the v2 header instead (hasProvenanceNote/originOf
read either). The note (or header) is what survives devices and git; a
draft is one machine's. Josh's Logic exports under compositions/
have neither and stay locked (writeMidi would strip their CCs/programs).
**Promoting a sketch by hand (git mv) MUST add the "moved from" note (or
origin.movedFrom) too** — Threnody was promoted by rename on 2026-09-07 and came up locked
on the machine that wrote it. **Score-side entry SHIPPED same day** (the promised
follow-up): Pencil/Erase work in score view — the tapped stave picks the
track, the vertical position picks the diatonic step (calibrated at
runtime from VexFlow's own getYForLine, no magic constants; ledger lines
±4), the key signature supplies accidentals with a key/♮/♯/♭ override
segment, and x snaps to the pencil-duration grid through scoreXToTick
(coarse mid-measure on near-empty bars — its linear-within-measure
interpolation has few anchors there). Empty tracks keep staves on
compositions (clef guessed from the voice name) so a blank song is
enterable; erase hit-tests the engraved notehead boxes.

**Data locations** (2026-08-17, Josh's architecture, advisor-reviewed):
the app is CONFIGURED with where its data lives — `ff1roll-cfg` in
localStorage, edited via Sync → "Data locations ▾". Three rows: songs
(.mid/album.json/manifest), analysis (.rollnotes + docs), NSF. Each has
a read BASE URL ("" = this origin/relative — the default, i.e. today's
fused behavior; or any raw.githubusercontent.com/owner/repo/branch or
local server) and an owner/repo write target for the Contents API.
Helpers: `cfg()/songsURL()/analysisURL()/nsfURL()/repoApi(which)`;
every write failure names its repo, and 404 is reported as
"token can't see <repo>" (fine-grained tokens make unlisted repos look
nonexistent). The Sync sheet opens without a loaded song so a broken
config can always be fixed; loadNotes warns instead of rendering
silently empty when this device previously synced annotations for a
path the analysis location now lacks. NSFs read raw-first from the
PUBLIC Night-Roll-App/nsf-archive (Josh's considered call, 2026-08-17 —
reversing the earlier never-publish stance; chip audio is tokenless
everywhere), API+token fallback for private forks. The PHYSICAL split
into ost-songs/ost-analysis is designed and deferred until a second
analyst exists — see the plan in open-items; the mirror-tree layout
(rollnotes at identical relative paths) makes it a pure git move.

**Sync / Save & Commit sheet:** serializes the full current rollnotes
state and commits it to this repo via the GitHub Contents API
(fine-grained token, stored in browser localStorage, never in the repo).
**ONE publish function per song (2026-09-30, docs/provenance-plan.md P2,
Josh's ruling: "Publish all must behave exactly like publishing the open
song"):** `publishSong(key, h, report)` is now the only place that writes
a `.rollnotes.json` (and, for his own songs, a `.mid`) for Publish — both
the footer/File → Publish button (`ghsave`) and Publish all
(`publishAllJobStart`) call it, for every song, whether it's the open one
or not. It replaced three separate flows (`commitCompositionNow` for the
open song, `publishDraftSong` for another edited one, an inline
annotations-only branch) that had drifted apart — see "Bugs found" in
docs/provenance-plan.md for what that drift broke.
  - `hisMusic` (internal): `isComposition()`/`isCompositionKey(key)` — his
    own folder, with a local draft. Only his songs get a `.mid` write;
    captures/starters/analysis songs publish annotations only, same as
    before, and the .mid is untouched even when a tempo: note changed.
  - `doc` is read back from the draft via `draftRead(key)` — for the OPEN
    song, `saveDraft(false)` runs FIRST so it's reading the same shape
    either way; this is what makes the two paths byte-identical.
  - The tempo map is baked fresh every call via `bakeTempos(base, notes,
    ppq)` (a pure function, also used by `finalizeNotes` for playback) —
    never accumulated, so removing a tempo: note removes its baked event
    on the next publish. `musicSig` now includes the tempo map, so a
    tempo-only edit republishes the .mid (it used to be ignored — see
    "Bugs found"); the .mid write itself is gated on a SEPARATE `midSig`
    field in the draft (the legacy `pubSig`, used by the "edited since
    last save" UI elsewhere, deliberately stays un-baked — see musicSig's
    own comment for why the two must not be conflated).
  - Annotations come from `annotationsFor(key)` — the repo file plus this
    device's local additions, MINUS tombstones (the same merge
    `loadNotes` does for the open song, factored out so it works for a
    key that isn't open). `markPublished(key, stamp, content, opts)`
    clears that key's tombstones, resets `added` flags, and updates
    `pubSig`/`midSig`/`savedStamp` on its draft — for the open song and
    any other, alike; `markCurrentSongSynced` is now a thin wrapper
    over it.
  - Recordings (`uploadAudioClipsFor`) and the iPad Files mirror
    (`filesMirrorFor`) now run for every song publishSong touches, not
    just the open one. The README (`writeSongsReadme`) moved OUT of
    publishSong entirely — the job that calls it (ghsave's handler,
    `publishAllJobStart`) writes it once at the end, not once per song.
  - `isCompositionKey` mirrors `isComposition` for a closed song. The
    pending list's Open button stays as a convenience; "open it to
    commit" is gone.

**Origins, RULES, "Make it mine", meter baking (2026-09-30,
docs/provenance-plan.md P1, Josh's rulings Q4/Q6/Q9):** `originOf(key)` is
the ONE place that classifies a song — `composition` (made in Night
Roll) · `copy` (Save As/Move; a "forked from"/"moved from" note — Q8:
still a plain annotation today, not a stored field, until it moves into
a v2 header) · `import` (a MIDI file brought in; its own labels kept in
`source`) · `capture` (game pipeline, FF1 included) · `starter` (bundled
pieces) — built from what already exists (`isCaptureKey`, `bundledPath`,
`ownFolderPath`, a draft's `source` field, a "forked from" note in the
open song's rollnotes or the `ff1roll-notes-<key>` local stash), since
nothing is stored yet (P1; **P4 now stores it — see "Stored origin (P4)"
above: the open song's `rollnotesOrigin.kind`, when present, is checked
FIRST and wins outright, before any of this P1 derivation runs**).
`RULES[origin]` is a table of `{editNotes,
bakeTempo, bakeMeter, writesMid}`; `rulesFor(key)` looks it up.
`canEditMusic(key)` — `!key` (songKey === null) or a `local/` key is
always editable; otherwise a local draft AND `rulesFor(key).editNotes`
— is the ONE "is this mine to edit" test every such check now calls;
`editableSong()` is `canEditMusic(songKey)` plus the link-mode/
compare-repo guards. Before P1 there were **three copies of that test**
that disagreed on those two guards — `updateEditBtnVis`'s own `editable`
and `askContext`'s `own` were missing them (editableSong() had them) —
now all three call `editableSong()`. `bakesTempo`/the new `bakesMeter`
route through `rulesFor` too (unchanged domain: `local/` or his own
folder, with a draft — captures/starters were never in that domain by
construction). Annotations are a separate door, never gated on
editability (Learning mode's law) — a capture refuses note/track edits
but still takes any annotation.

Captures and starters STAY locked (Josh took the plan's addendum, not
his own "your copy is yours" alternative): the edit affordance they get
instead is **"✎ Edit"** (renamed from "✎ Make it mine" the same day,
DAW review item — `#makeitminebtn`, id unchanged) — a header button
beside "✎ Edit locally" (shown when `!editableSong()` and the origin is
capture/starter). It opens the "Edit a copy" sheet — `openSaveForm`'s
third mode, `"editcopy"`, reusing the Save As/Save form (`#filesaveasform`):
name defaults to the song's own display title (editable), folder
defaults to `my-covers/` or the last folder used (`fillFolderSelect`'s
`prefer` param — guaranteed an option even with nothing saved there
yet), same folder picker Save As has. Confirm (`✎ Edit`'s `#fsgo`,
"Copy & Edit") calls `makeItMine(name, folder)`, which calls the same
`forkCurrentSong(title, folder)` Save As uses — `forkClashTitle` still
numbers a name clash ("Overworld" → "Overworld 2") by checking both the
published catalog and this device's drafts in that folder, whether the
typed name is the default title or something else. `makeItMine()` with
no arguments keeps its original one-tap default (last folder used, or
`my-covers/` the first time) for anything still calling it directly.
The capture/starter itself is never touched. Bug found building this:
`forkCurrentSong` called `saveDraft()` at the end, but `saveDraft`'s own
`isComposition()` gate requires a draft to ALREADY exist — a brand-new
own-folder key has none yet, so the very first fork silently wrote
nothing; fixed with an explicit `draftWrite(key, draftDoc(false))` first
(the same bootstrap `editHereNow` already needed for "✎ Edit locally").
This affects every Save As, not just ✎ Edit.

Meter baking (Q9 — "a declared meter bakes wherever tempo bakes"):
`publishSong`'s doc build adds `timesigs: bakeMeter(base, notes)` when
`bakesMeter(key)`, `base` being the draft's own `[num, den]` as a
one-event list (today's model allows only one `timesig:` annotation per
song — declaring a new one re-bars). `bakeMeter` mirrors `bakeTempos`
exactly: pure, baked fresh from the SAME base every publish, never
accumulated — no declaration returns the base unchanged ("written back
verbatim," Q6, for an import's own label), one declared returns one
event at its tick. `musicSig` now includes `d.timesigs` (undefined where
nothing bakes one), so a meter-only edit republishes the .mid, the same
fix tempo's baking got. `writeMidi`/`writeSongMidi`'s `s.source` branch
(an import's own verbatim 0x58/0x59 history) already ignored
`s.timesig`/`s.timesigs` — it now checks `s.timesigs` FIRST and falls
back to `s.source.timesigs` only when absent, so a declared meter
overrides an import's own label the same way a `tempo:` note already
overrides an import's own tempo map (that part of `s.source` was never
verbatim to begin with); the non-source branch already read
`s.timesigs` (pre-existing parity infrastructure, apparently built for
something else — unused everywhere until now).
Rebuilt 2026-09-25 (Josh: "there should be song sections"):
`pendingSongs()` is the union of `dirtySongs()` (unsynced annotation
stashes), drafts whose `dirty` is set (`draftDirtyState`: "edited" since
a save, "never" saved), and `ff1roll-ask-*` logs with unsaved messages —
same `local/` and import exclusions as `dirtySongs`, open song first.
`renderSyncPending` draws one `.psong` block per song (accent bar on the
open one; every other song's title row carries an **Open** button —
`openDraft(key)` then `openSyncSheet()` — since music and chat commit
from the open song): a ♪ music line, a ✎ count then one row per
annotation with its ✕ (`discardPending`: drops that never-synced note
from this device), a ✦ chat count. 12px in `--text`; the whole sheet scrolls (the old 38vh
inner scroller is gone). The primary reads "⇪ Commit song" ("⇪ Save
song" in folder mode) in both modes; the status line under the buttons
is EMPTY until it has progress, a result, or a missing prerequisite to
report (no song / local file / no token) — Josh dropped the
what-ships include-line the same day ("the buttons are clear").
"Commit all (N)"
shows only when N > 1 and still ships ANNOTATIONS only (one PUT per
file; per-song ✓/✗ status; meter for foreign songs comes from a
localStorage stash written on load) — music and chat commit from the
open song, and the sweep now passes `{keepDraft: true}` to
`markCurrentSongSynced` so an edited composition's ● stays lit when only
its notes went up (it used to go dark with the .mid unpushed). The Sync
button counts `pendingSongs()`. Copy/Download fallbacks. Local unsynced
additions persist in localStorage keyed by song path.

**Sheets close one way, visibly (Josh, 2026-09-25: "all of our dialogs
should have an X button, on the top right").** Every `.overlay` sheet
gets the pinned `.sheetx` ✕ prepended at runtime; `.sheet .sheetx + h2`
pulls the title up onto the ✕'s row (the ✕ is 40px tall with a −16px
bottom margin plus the 10px gap, hence `margin-top: -34px`). The
per-sheet "Close" buttons that predated the ✕ are gone (17 of them,
including a duplicate `#chclose` id that had left the Challenge sheet's
Close without a listener). Cancel/Done buttons that pair with an action
stay. The `SHEET_TOP` observer now also calls `micStop()` when a closing
sheet contains the live 🎤 — the Message-Claude Close used to do that and
✕/Esc/backdrop never did.

**Import** (2026-08-15, File → Import…, replaces Load MIDI): one file
picker, byte-sniffed — MIDI in any wrapper (.mid/.midi/.smf/.kar,
RIFF-wrapped .rmi; MThd found anywhere) loads directly as a local file;
an NSF (NESM magic) opens the capture panel instead. NSF capture runs
the browser through the SAME pipeline that dumped the FF1 album —
tools/nsf/{nsf,notes,midi-write}.mjs dynamically imported off Pages, so
there is exactly one 6502/APU/loop-detect/tempo-fit code path — per
track: run N seconds (panel field, default 75; the detector needs
intro + 2 full passes in frame, so on "no loop" the window auto-doubles
up to 300s before conceding — 2026-08-16, after MM2's ~35s stage loops
made half the tracks read "no loop" at 75), reconstruct, loop-detect +
trim to intro + one pass — or, when no loop is found, the no-loop TAIL
trim (2026-09-29, Josh: Zelda (NES) tracks 5-7 are jingles under a bar
but held their last note out to the 300s ceiling — 1 beat of music,
then a re-attack at lower volume sitting there while the driver
rewrote the SAME register values every frame). `trimSustainedTail` +
`lastRegisterChangeFrame` (tools/nsf/notes.mjs, shared unmodified by
GBS) find the last frame at which any APU write actually carried a
DIFFERENT value than the last one logged at that address — pitch,
volume/envelope and enable/mute are pure functions of register
VALUES, so an identical rewrite changes nothing audible, chip-agnostic
and generic (no per-game table: it reads the same {frame, addr, value}
log every capture engine already produces, NSF's $4000+ or GBS's
$FF10+). Past that frame plus a ~1s ring-out, the capture's events and
`secs` are both cut — the chip-audio render (`chipRender`/`renderApu`)
re-emulates to the SAME (now short) `secs`, so the notes and the
console's own audio always agree on where the song ends. Conservative
by construction (a genuinely differing write anywhere — a real
envelope step, a vibrato nudge, a channel disabled — keeps the window
live, so it can only under-trim): a real ~4-bar fanfare with its own
long dead tail (Zelda track 6) keeps its ~7.4s of music and only loses
the padding; a looping song never reaches this branch at all (the
loop's own trim runs instead).

Ghost notes (2026-09-29, same Zelda ear report, tracks 5-7): the LAST
real register change found above is often the driver "releasing" the
final note — dropping its volume (pulse v7 -> v4) — via a write that
ALSO happens to touch the period-hi/length-counter register, which
`reconstruct()` treats as a note boundary regardless of pitch. The
result: the same pitch splits at that frame into a real note and a
same-pitch "ghost" continuation at the lower volume, which then rode
the old trim's ring-out as an audible (if quiet) second note nobody
struck. `trimSustainedTail` now also drops any event that starts at or
after the trim's own frame F and continues the SAME pitch as the note
immediately before it on that channel — the ghost — and lets the note
it continues end at F, its own conclusion (no extra ring). An event
with a DIFFERENT pitch at/after F is a true final note (a real
last-frame attack) and keeps the short ring-out as before. Still
register-level and chip-agnostic (pitch/channel comparisons only, no
per-game table): GBS shares the same function unmodified — grid-fit
bpm (4/4 seed 120 — meter/tempo stay re-derivable by annotation like
any capture), makeMidi → parseMidi → stored as a LOCAL draft under
`albums/imports/<album-slug>/track-NN.mid`, with a hardware `loop:`
directive stashed as a local note when the loop returns past 1.1.
Nothing touches the repo at capture time (Josh's ruling: audition
first). Flow: Capture all (~10 s for a 23-track NSF) → open each from
the panel or Open → drafts, where every import album is its own folder
(2026-08-16: tap in for the track list; ⇪ per track commits that song
alone to its album, "⇪ Commit album" pushes the whole folder; ✕ on the
folder row two-taps the entire album's drafts away; the folder
disappears as its last draft commits or dies). Re-capture and re-import
OVERWRITE existing drafts for the same album/track (with their stale
loop notes) — the name-collision guard only fires between two rows of
the same import session → recognize a
tune and type its real name in the panel row (the draft renames in
place; the typed title — punctuation intact — becomes the dropdown
title at commit, via an album.json `songs` override when the filename
can't spell it) → ✕ the duds →
Commit import (File menu item with live count, or the panel button)
pushes every surviving import draft in one pass: .mid (writeMidi of the
draft), loop rollnotes (stamped), album.json (self-created so
build_manifest.mjs stays honest), manifest entries — then retires the
local drafts; the album appears in Open like any other. Uncommitted
captures are excluded from the Sync badge (their notes ride Commit, not
Sync — a sidecar without its .mid would be an orphan). Expansion-chip
NSFs (VRC6/FDS/…) capture 2A03 channels only; silent SFX slots report
"silent" and store nothing.

**Game Boy import (2026-09-27; Josh from bed via the bridge: the Zophar
Final Fantasy Legend rips, "push it to master and I'll test").** A
second chip behind the same panel. `CHIPS` is the descriptor table
(`nsf`, `gbs`: magic sniff, vault extension, channel names, module files,
parse/run pickers); `chipKindOf(bytes)` routes Import, `chipModules(kind)`
dynamically imports `tools/gbs/{gbs,notes,apu-render}.mjs` the same way
(`nsfModules()` = `chipModules("nsf")`), `openChipImport(kind, …)` and
`captureChipTrack(kind, M, …)` are the old NSF functions with the run
picked by descriptor — everything after `reconstruct` is shared because
the GB reconstructor emits the NSF event shape and the GB `makeMidi`
bakes in `{pulse1, pulse2, wave, noise}` (wave = the GB's sample
channel; noise → drums by LFSR shift). `nsfSess.chip` names the live
session's chip; the IndexedDB record gains `chip`; album.json keeps the
`nsf:` key with `vault: "<slug>.gbs"` and `chip: "gbs"`; the archive
upload uses the chip's extension (`*.gbs` gitignored like `*.nsf`). A
timer-mode GBS shows its PLAY rate in the panel status (same seconds,
longer emulation). m3u: Zophar's GBS rips ship ONE .m3u per track
(`DMG-SAJ.gbs::GBS,1,Main Theme - Nobuo Uematsu - …,01:28,,10`), so
`parseM3u` accepts `::GBS,` and the picker merges every picked playlist
in natural file-name order (a single NSF playlist is unchanged). The
real FFL1 rip (downloaded to test after Josh's iPad showed every row
with the same name, 2026-09-27) settled three things: the files are
Latin-1 (© is the single byte 0xA9 — `decodeM3u` tries strict UTF-8,
then windows-1252; a plain decode made U+FFFD and broke a copyright
heuristic); GBS lines are "Title - Artist - Game - ©1989-12-15 Square"
(NSF: "Game - Artist - Title") so the `::GBS,` marker means title
first; and GBS track numbers are 0-BASED (0–16 for 17 subsongs, out
of album order), so the marker also adds 1 to reach the app's rows —
keyed on the marker, not on "a 0 is present", so one picked per-track
file still lands on the right subsong. Running the real rip also found
an SM83 bug: JR e read PC before the operand fetch and landed a byte
short (tools/gbs/cpu-sm83.mjs; test "SM83: unconditional JR lands past
its own operand"). Verified with the real files in Chrome: 17 rows,
album order, Main Theme captured. The
file picker accepts `.gbs`; the File menu says "Import… (.mid / .nsf /
.gbs)". Tests: "GBS import: the Game Boy chip goes through the same
capture path" (synthetic GBS from `tools/gbs/make-test-gbs.mjs`, no ROM
data), the m3u test's GBS line. Offline twin: `node tools/gbs/dump.mjs`.

**Audio context rebuild only inside a tap (2026-09-27).** Josh, after
importing on the iPad (Game Boy, then Chrono Trigger): the imported song
played with a moving cursor and no sound, and every song after it was
silent until a relaunch — "the same exact bug we had with Game Boy". Not
the chip path (the SNES import had no renderer yet) and not scheduling
(Chrome: 1575 events scheduled, no exception). Import's file picker
interrupts the AudioContext; the `visibilitychange` handler then ran
`resumeAudio` with a dead clock, and its last resort closed and REBUILT
the context outside a user gesture — on iOS such a context runs its
clock (the cursor moves) but never reaches the speaker, and resume()
has nothing left to do. Now: `resumeAudio` resumes twice and, with a
dead clock, rebuilds only when `gestureActive()`
(`navigator.userActivation.isActive`; true where the API is missing);
outside a gesture it says "audio asleep — tap ▶ again" and play() (a
tap) does the rebuild via `rebuildAudio(why)`, which also resets
`metGain` and `organWave` — nodes the old rebuild left bound to the
closed context. Unverifiable on the Mac (Chrome has no interruption
path); the gating itself is exercised in Chrome with a faked dead clock.

**Chip audio and the AudioContext (2026-09-27, the second silence).** A
committed Chrono Trigger song silenced everything again with no picker
involved. `chipRender` runs at song load and called `ensureAudio`; iOS had
closed the context under the render's memory (eight voices × 3 min ×
48 kHz ≈ 300 MB twice over), and the rebuild ran outside a tap. Now the
render never touches the context: it produces `chip.pcm` (Float32 per
voice at `CHIPS[kind].renderRate` — 32 kHz for the SNES — or the live
rate), silent voices keep nothing, and `chipBuffers()` builds
AudioBuffers inside play()'s tap on the live context (rebuilt if the
context changed; `chipActive`/`chipHas` read either form). A render whose
song is no longer open throws "stale render" at its next progress tick;
`updateChipBtn` frees the previous song's pcm/buffers first. `ensureAudio`
rebuilds a closed context only inside a gesture, the visibility handler
only resumes, `resumeAudio` reads `gestureActive()` before its awaits,
and "audio asleep"/"engine closed" write the state to the ⚠ log.
Queued: a Worker for the render.

**Big drafts (2026-09-27; Josh imported Chrono Trigger's 92 songs on the
iPad: "quota has been exceeded", and the album "vanished" — it was under
Open → drafts → the folder).** localStorage holds ~5 MB per site and 92
captured SNES songs are 6 MB of note JSON (measured: 67 KB a track). An
import's (`albums/imports/**`) or local MIDI's (`local/**`) draft is now
a STUB in localStorage — flags, title, ppq, meter, tempos, `tracksRef: 1`
— with its `tracks` in IndexedDB store "drafts" (db version 4) under the
same key; his own compositions stay whole in localStorage (small,
synchronous, proven). `draftWrite(key, doc)` is the one writer (sync for
the caller; the IDB put rides `_idbQueue`), `draftRead(key)` the reader
that needs notes (`openDraft` is async now; `loadSongInner` fetches the
notes when the stub says so; `commitImports` reads whole drafts);
everything that only reads flags keeps reading the stub. ✕ (row and
album), Revert, rename (import and composition) call
`idbDraftDelete/Move` so the store stays in step; an old inline draft
still reads. `saveDraft` no longer throws out of an edit when storage is
full: one ⚠ line per song and an info strip, and the edit is honestly
reported as NOT saved. Test: "big drafts: …" (fakes indexedDB in the vm).

**Super Nintendo import (2026-09-27; Josh from bed with the Chrono
Trigger zip: "can he just get the Super Nintendo stuff merged so I can
test it here").** The third chip behind the same panel, and the first
PER-FILE one: an SNES set is one .spc per track (`CHIPS.spc.perFile`),
so the picker takes every .spc picked, `openChipImport(kind, …, files)`
parses them all, `chipTrackOrder` sorts by `parseTrackName` (disc,
track, part; 99/999 "unlisted" last; unparsable names after), the first
file's game/artist name the album, each row's title is the tag's
(`spc.name`, xid6 over the 32-byte header) and its tagged length sizes
the capture like an m3u length. `rows[n].parsed` is that row's file;
`captureChipTrack` receives it in place of the one parsed NSF. The SPC
runner already reconstructs (`reconstruct(capture)` → events with
voice0–7 channels, volumes 0–127, 2 ms ticks), so
`CHIPS.spc.run` returns `events` too and rebins them to 10 ms frames
(the NES loop/tempo stages were tuned for ~60 fps; 2 ms ticks gave them
150 000 frames per 300 s); `captureChipTrack` uses `res.events` when
present; `midiOpts` = `{volMax: 127}`; drums are excluded from the snap
gate like noise. `CHIPS.spc.tagged`: the tag's seconds ARE the length
(intro + one pass), so the capture runs that long, the loop scan is
skipped and the 300 s no-loop retry never fires — measured on the real
Frog's Theme: scan 5.6 s in node (40 s+ in Chrome) for a null result.
Console audio for a per-file set (groundwork 2026-09-27, renderer in
progress): each captured row stores ITS file in the IndexedDB record's
track entry (`tracks[base].bytes`, 64 KB an .spc; `rec.bytes` stays
null), `chipSource` returns that entry's bytes with `n: 1`, album.json
gets `nsf: {vault: "<slug>/", chip: "spc", perFile: true, tracks}`
(`chipVaultMeta`) and Publish uploads one archive file per track
(`<slug>/<base>.spc`, only the missing ones); `chipVaultFile` names a
track's file for the vault fallback. `CHIPS.spc.files` lists
`?spc/apu-render` as OPTIONAL (a failed import is an empty module), so
the app keeps working until tools/spc/apu-render.mjs exists;
`chipRender` returns false without `M.renderApu`, and a chip's `render`
hook adapts the renderer's signature (the SPC one takes the capture). No renderer yet: `nsfSess.bytes` is null, nothing goes
to IndexedDB or the archive, synth voices carry the songs, the panel
status says so, and the "no NSF on this device" warning now needs an
album.json that actually names a console file (`chipAlbumHasSource`).
Verified in Chrome with the real Chrono Trigger set: 92 rows in order
with tag titles, Frog's Theme captured. Test: "SPC import: a Super
Nintendo set…" (synthetic SPC; `chipTrackOrder` on real file names).

**NON voices aren't automatically drums (2026-10-01).** A voice with the
hardware NOISE generator on used to become a GM drum unconditionally —
wrong for FF4 "Main Theme (Ocean)" voice 6, a ~4 s near-silent "ocean
wash" swell that set NON once at init and played like any other
instrument, not a kit hit. `tools/spc/notes.mjs`'s `reconstruct()` now
classifies each NON voice AFTER every onset/duration for it is known
(`classifyNoiseVoices`), the same way `tools/kit-guess.mjs` reads a
sequence chip's drum channel: `DRUM_MIN_HITS` (8) and
`DRUM_MAX_MEDIAN_DUR_SEC` (0.5) — both named, both documented in
`tools/spc/INTEGRATION.md` §6. A voice under either threshold keeps its
`voiceN` track (never folded into the merged "drums" MIDI track/channel
9) and its noise-clock-derived pitch unchanged — only the GM `drum` flag
is cleared. `drumHit` (index.html, AUDIO ENGINE) also stopped assuming
every drum note is a short hit: a captured duration ≥ `DRUM_LONG_SEC`
(1 s) now sustains a decay-shaped noise burst over the real length
(capped at `DRUM_SUSTAIN_CAP_SEC`, 8 s) instead of collapsing to the
fixed 45 ms tick — real short hits are unchanged. Tests:
`tests/spc.test.mjs` ("NON voice classification: …") and
`tests/night-roll.test.mjs` ("drumHit: a long captured duration…").

**Genesis import (2026-09-27; Josh: "is it gonna download games to test
it with?" — built and verified against the real Sonic 1 set the agents
downloaded).** The fourth chip, second per-file one. `CHIPS.vgm`:
`magic(bytes, name)` — "Vgm " or gzip 1F 8B when the NAME ends .vgm/.vgz
(`chipKindOf` takes the name now; the picker passes it); `parseAsync`
(inflate via DecompressionStream, then `parseVGM`; GD3 track/game/author
become name/game/artist, header samples become `tags.seconds`) — the
per-file loop in `openChipImport` awaits it; `perFile` + `tagged`
(header states total and loop samples, so no scan and no retry). A VGM
is a register log, not a program: `run` calls `reconstruct` directly,
rebins the 44100 Hz sample frames to 10 ms (k = 441), maps `vel/velEnd`
to `vol/volEnd` (volMax 127), keeps `drum` on noise/DAC hits (→ the
"drums" track), and returns `loopFrame` from the header; `captureChipTrack`
turns a stated loop into the same `loop:` annotation the detector would
(`statedLoop`). No renderer, no chip audio: synth voices; nothing here
touches the AudioContext. Verified in Chrome: 19 rows with GD3 titles,
Green Hill Zone captured in 99 ms at exactly 150 bpm, 8 tracks
(fm1–fm5, psg1–2, drums), `loop: 10.2` at bar 34. Test: "VGM import: …"
(synthetic VGM through captureChipTrack; the .vgz sniff by name).

**PlayStation import (2026-09-27; verified on the real Final Fantasy VII
set).** The fifth chip and the first SEQUENCE one: a PSF is a program
image, and the reader yields notes in ticks with a tempo map and meter,
so `CHIPS.psf` has a `capture` of its own and never enters the
frame/loop-scan/tempo-fit path. A set is many `.minipsf` plus ONE
`.psflib` named by every mini's `_lib` tag — `libFile(name)` keeps the
lib out of the rows and in `nsfSess.libs` (by lowercase name);
`parseAsync(bytes, name)` reads the tags (title/game/artist/length) and
keeps the bytes; the panel status names a missing lib; a capture
without it fails with the lib's name in the row. `capture`: inflate the
chain with DecompressionStream("deflate") (`loadPSFChain` with the
session's libs as `readLib`), `assembleRam` (2 MiB, assemble → scan →
drop), `scanMagic` → SEQ/VAB path (`parseSEQ`/`parseVAB`/`seqNotes`)
else `scanAKAO` → prefer the sequence inside the mini's own range →
`akaoNotes`; the PSX `makeMidi(result)` writes the file (conductor
with the tempo map and meters, a track per voice, drums split to
channel 10); bpm = the first tempo, seconds from the tempo map, the
sequence's loop → `loop:` annotation in the sequence's meter; the
reader's warnings go to the row's tooltip, the console and a "· N
notes" suffix. `keepBytes: false` (no renderer, nothing stored or
uploaded); `parseMidi(buf, {trust: true})` for imports (and for
`albums/imports/**` on load) turns off the corrupt-file guards that cut
FF7's 41-bar rests. Verified in Chrome: 90 rows with tag titles,
Prelude 2836 notes / 13 tracks / `loop: 17.2.25`, Tifa 536 notes, Main
Theme 2238 notes with 11 tempo points and `loop: 19.1`, ~1.1 s each.
Test: "PSF import: …" (synthetic minipsf + lib; the missing-lib error;
the trust flag on a 41-bar rest).

**Nintendo 64 import (2026-09-27; verified on the real Super Mario 64
set).** The sixth chip, the second sequence one. A USF set is many
`.miniusf` (a save-state word or two each) plus ONE `.usflib` carrying
the game's sparse ROM and RDRAM; `CHIPS.usf` sniffs PSF version 0x21,
`libFile` keeps the lib beside the rows, `parseAsync` reads the tags
(title/game/artist/length). `capture`: `loadUSF([mini, ...libs])` (the
lib objects persist across captures, so their parse is cached on them),
`gameOfSet` → manifest (abi, sequence-id rule), `locateEAD` (tables in
ROM for SM64, in RDRAM for OoT/MM), `miniSequenceId` from the save
state, the sequence bytes from ROM pages or the RDRAM cache with a
presence mask, `parseSequence` (stop at the loop jump, 600 s cap),
`toMidi` (a track per channel, `inst N`/`drums` names, the tempo map);
bpm = the first tempo, seconds from the interpreter, the loop jump →
`loop:` annotation in 48-tick beats (4/4 assumed — the format carries no
meter); truncation, self-modification, io-port reads and ignored
sound-shaping ops become the row's tooltip notes. `keepBytes: false`, no
renderer. Verified in Chrome: 38 rows with tag titles, Title Theme 4008
notes / 13 tracks / 6 tempo points / `loop: 5.1`, Main Theme 1419 notes
at 113 bpm, Dire Dire Docks 390 notes, ~150 ms each. Test: "USF import:
…" (sniff, lib file, capture presence); the real-set run is the browser
check and tests/n64-real.test.mjs with N64_USF_DIR.
Percussion (same day, evening): `toMidi` puts every drum on MIDI
channel 9 — the player's kit channel — with GM keys guessed from rhythm
by `tools/kit-guess.mjs` (shared with the PS1 path: backbeats → snare,
downbeats → kick, busiest → hats, the rest toms/crash); a drum index
names a slot in a bank the rip does not carry, and the old 35 + index
offset played toms and cymbals for every hit (Title Theme's 1459 hits:
"a disaster"). An instrument that only ever plays one pitch, 12+ times,
is a percussion sample and joins the kit as `ch N inst I kit`; a
melodic N64 channel 9 takes the first free MIDI channel instead.
`res.kitGuess` + a "kit guessed from rhythm" warning reach the row.
Test: "MIDI percussion: …" in tests/n64.test.mjs.
Chip audio (same evening): `CHIPS.usf` has parse/run/render like the
PS1 — `run` rebuilds the set from the mini + the lib (the lib's NAME is
the game's identity, so libs travel by name), `sequenceOfSet`
(tools/n64/capture.mjs — one resolver for the capture, the app render
and the worker) finds and parses the sequence, `renderN64`
(tools/n64/render.mjs) plays it through the game's own bank:
`tools/n64/bank.mjs` reads ctl/tbl (instruments with key regions,
drums, envelopes, samples), `tools/n64/vadpcm.mjs` decodes VADPCM
(bit-exact against the bank's stored loop states), the ADSR follows the
decomp (240 updates/s, 16.16), pitch = 2^((semitone−39)/12) × tuning.
`renderRate` 32000, `keepBytes` so the mini per track and the lib
persist (idb + archive) exactly as PS1's. Verified on the real set:
melody/bass within a few cents of the written pitch; Title Theme inst 3
sounds an octave BELOW its written key and inst 4 an octave ABOVE (the
bank's tuning fixes sample rate, not root — INTEGRATION.md §4/§9); the
renderer plays what the console plays, the roll keeps the written key.
Not rendered: vibrato, portamento, pitch bends, reverb, pan, synth
waveforms (inst ≥ 0x80, warned), volume changes inside a note; OoT/MM
banks are another layout. Tests: tests/n64-bank.test.mjs (synthetic),
tests/n64-real.test.mjs with N64_USF_DIR (bank facts, every sample
decodes, 10 s renders named like the MIDI, the pitch check);
scratch/n64-render.mjs writes WAVs, scratch/usf-app-render.mjs runs the
app's own chip path in the vm.
The sequence variation (same night, against a real USF player —
`scratch/usf2wav`, lazyusf2, recipe in scratch/lazyusf2/build-mac.sh;
INTEGRATION.md §9.7): a sequence can branch on the player's
`seqVariation` (bit 7 of the id the game asks for); the parser
defaulted it to −1, so Title Theme played its ritardando-intro table
and Dire, Dire Docks captured only the two "surface" channels (390
notes) instead of the eight written (1963) — the missing six are the
sustained pads Josh heard on YouTube and not in the app. `parseSequence`
now takes `variation` (default 0, the plain id); `sequenceOfSet` passes
the mini's bit 7 and indexes the table by `id & 0x7F`. Policy: a
capture carries EVERY channel the sequence writes — the game's
per-area ducking (Dire Dire Docks' a/b/c minis mute channel sets by
where Mario is) is game state, not composition, so the three minis now
capture the same full arrangement. Also settled there: the note
envelope and the clock match the decomp (the emulator itself runs ~5%
slow when pulled as fast as its audio drains); the early-decay reading
was other voices in the band.
Rare's driver (2026-09-28, GoldenEye 007): when `locateEAD` finds no
Nintendo tables, `sequenceOfSet` falls back to `tools/n64/rare.mjs`
(`res.driver = "rare"`): the song table sits in the save state's RAM
(63 × {rom, unpacked, packed}, found by shape — every song starts
with the 1172 magic, two bytes then raw DEFLATE, inflated by a plain
RFC 1951 decoder), the mini's track is the one RAM word it overrides
(USF_GAMES names the address for the known lib; the override rule is
the fallback), the bank is the SDK's ALBankFile found by header, and
the song is the SDK's compressed MIDI (16 track offsets, division 384,
running status, tempo/loop metas, FE replay blocks). `renderN64`
dispatches to `renderRare`: keyBase/detune pitch, key maps, VADPCM or
raw-16 waves, volume ramps as the envelope, dry mono. Verified against
the real player: all 58 songs identified, isolated notes within a
cent, onset fit 0.4–0.64. Open: the roll shows the written key (two
programs sound an octave away), a ranged-keymap drum kit reads as
melody, pan/reverb/vibrato, level 9–14 dB hot. Tests:
tests/n64-rare.test.mjs (synthetic) + the guarded GE tests in
tests/n64-real.test.mjs; INTEGRATION.md §10.

**Chip render in a Worker (2026-09-27, afternoon).** The console render
ran on the page's thread in 35 ms slices: the first Play after opening a
song stuttered over it, the Fall view starved the scheduler, and on the
iPad a long render could take the audio session down. `chipRender` now
hands the work to `tools/chip-worker.mjs`, a module worker that imports
the same chip modules (relative to tools/, with the page's `?v` buster),
parses, emulates and renders per chip (`RUNNERS`: nsf/gbs/spc), drops
silent voices, and posts `{pcm, sampleRate, leadSec}` back as
transferables, with `progress` messages feeding `chip.progress`. One
worker at a time (`chipWorker`); a song change terminates it within
250 ms ("stale render stopped"); a worker failure logs and falls back to
the inline path once, and an environment without module workers
(`chipWorkerAvailable.broken`) stays inline. `chipPublish` is the one
place a finished render (worker or inline) becomes `chip.pcm`. Verified
in Chrome: Overworld (NES, 3 voices) and Frog's Theme (SNES, 8 voices)
render in the worker with the page idle; the vm keeps the inline path
(no Worker there). Not verified on the iPad yet.

**Render memory, measured (2026-09-30, docs/streamed-render-plan.md step
0).** FFX "Challenge" (PS2, 30 tracks stereo 48 kHz) reproduced on the iPad
as 1.88 GB and killed the WKWebView content process; the stopgap budget
(`planChipRender`/`CHIP_BUDGET_APP`/`CHIP_BUDGET_WEB`, above `chipRender`)
only shrinks what's KEPT, not the worker's PEAK — `renderSpu`/`renderN64`
hand back a stereo pair per group regardless, so a mono downmix copy briefly
coexists with its stereo original. Both render paths now tally this
(`tallyChipRender`, tools/chip-worker.mjs; the inline fallback in
`chipRender`, index.html, mirrors it) and `chipPublish` logs one line per
render: `"<title>: console audio held X MB (render peak Y MB, N tracks,
R kHz, mono|stereo|mixed)"` — `chip.pan`'s "estimated N0" suffix appears only
if `chipEstimateTracks`/`chipEstimateTracksW`'s pre-render group count
(now via the SAME `channelGroups` the renderer itself calls, not a plain
distinct-channel count — that undercounted a channel emitting both a
melodic AND a kit group) ever disagrees with what actually rendered.
`tools/chip-bench.mjs <kind> <file> [lib...] [--seconds N]` runs the same
RUNNERS pipeline in plain Node for one song and prints parse/render seconds,
a sampled `process.memoryUsage().arrayBuffers` peak, and the same tally —
for a small synthetic fixture only (tools/nsf/make-test-nsf.mjs and kin), or
a short `--seconds` window; never a real set (Josh's CPU is his instrument).
Building it surfaced a real Node-only hang: `tools/nsf/apu-render.mjs` and
`tools/nsf/notes.mjs` each kept a local `microYield` whose `MessageChannel`
port was never ref/unref'd (fine in a browser, forever in Node once a render
yielded) — both now import the already-fixed `microYield` from
`tools/nsf/nsf.mjs` instead of carrying their own copy.

**Streamed PS1/PS2 render (2026-09-30, docs/streamed-render-plan.md step
1c).** `tools/psx/spu-render.mjs`'s `createSpuStream(result, opts)` ->
`{sampleRate, seconds, frames, tracks, render(nFrames), seek(frame),
snapshot(), restore(s)}`; `renderSpu()` is now exactly "stream the whole
thing in one pass" — same signature and output, every caller unaffected.
This chip has NO cross-note state (the file's own header already said the
render is dry: no reverb, and there's no voice-stealing model either), so
streaming is just a per-chunk active-voice list: each note+layer becomes a
"job" (its samples, ADSR record, pan, gain-ramp/pitch-slide breakpoints,
i0/iOff — everything fixed before any sample is produced) plus a "voice"
(its live Envelope, pos, ri/si cursors, step, vol); jobs activate in
`g.notes` order (tick-ascending) with a note's layers contiguous, and the
active list only ever appends/filters in that order so float summation
order — and so rounding — matches the old whole-buffer render exactly,
bit-for-bit, at any chunk size. `seek(frame)` skips fast-forwarding any
note whose release could not possibly still be sounding by `frame`: per
ADSR record, simulate `Envelope.release()` from the loudest possible level
(0x7FFF, capped at the stream's own length) once and cache it — a real
voice releases at or below whatever level it actually reached, so this
bound is always safe. Perf: calling a shared per-sample function (returning
the sample value or `null`) cost ~2x the old renderer on a synthetic
8-channel/60-note fixture — a `number | null` return kept V8 from unboxing
the float math; `render()`'s hot loop now hoists a voice's job fields and
mutable state into plain locals once per chunk (matching the old code's own
style) instead of calling that function per sample, which brought it back
under the plan's 1.2x ceiling (measured ≈ 0.98-1.16x depending on chunk
size). `seek()`'s fast-forward still uses the small shared per-sample
function since it isn't the hot path. Test: tests/psx-stream.test.mjs — a
frozen copy of the pre-streaming `renderSpu()` as the oracle, over an
INSTR.DAT/table fixture (overlapping notes, a long linear release landing
across a 4095-sample chunk boundary, a pitch slide, a gain ramp, two
channels) and a VAB fixture (two tones layered per note, two channels):
chunked/random-chunk renders, `renderSpu()` itself, `restore(snapshot(k))`,
and `seek(k)` all equal the oracle's whole-song output bit-exactly.

**Chip worker stream protocol (2026-09-30, docs/streamed-render-plan.md
step 2).** tools/chip-worker.mjs now answers a SECOND message shape beside
the whole-render one (unchanged): `{stream:{id, kind, files, shared, own,
v, bytes, libs, secs, rate, chunkFrames, overlap}}` parses/runs the song
exactly like the whole path, then calls the kind's own `R.stream` hook
(today only `RUNNERS.psf`/`psf2`, both just `M.createSpuStream` — step 1c)
and replies `{ready:{id, tracks, seconds, sampleRate, frames, leadSec}}`,
or `{stream:{id, error:"no stream for <kind>"}}` for any other kind (NES/
GB/SNES/N64 have no stream API yet) so the page falls back to whole-render.
`{want:{id, gen, from, to}}` answers chunk indices one at a time; chunk k
is raw frames `[kC, (k+1)C+O)` — a sequential idx reuses the previous
chunk's kept O-frame tail (prepended to just the new C frames) instead of
re-rendering the overlap, any other idx reseeks. Chunk k's last O frames
fade out linearly (`1 - q/O`), chunk k+1's first O frames (the same
absolute samples) fade in (`q/O`) — the two sum to exactly 1, so overlap-
adding adjacent chunks reproduces the untouched continuous render.
Replies `{chunk:{id, gen, idx, frames, tracks:{name: Float32Array |
{l,r}}}}` (transferables; a track silent in that window is omitted),
yielding to the event loop between chunks and re-checking `gen` so
`{seek:{id, gen, idx}}` cancels an in-flight `want` for an older gen
without starving a `previewOne` tap queued mid-want. `{idle:{id}}` replies
`{silent:{id, names}}`: tracks that have never produced an audible sample
in any chunk rendered so far. Everything (`createStreamState`,
`handleStream`, `handleWant`, `handleSeek`, `handleIdle`, `RUNNERS`) is
exported so tests drive the protocol with no real Worker and no real
module loading (a fake chip's `files`/`shared`/`own` can be empty — `loadM`
just returns `{}`). Not yet wired to the page (step 3) or to any chip
besides PS1/PS2. Tests: tests/chip-worker.test.mjs (a fake deterministic
per-track signal: overlap-add == continuous within 1e-6, out-of-order
`want` == sequential bit-exact, silent-track omission, stale-gen
cancellation, preview-not-starved, fallback error for non-stream kinds;
plus one test running the REAL `createSpuStream` through the full protocol
over tests/psx-stream.test.mjs's AKAO/table fixture, overlap-add matching
`renderSpu`'s own output within 1e-6).

**Aeon Battle crash + recovery (2026-09-30, before step 3 — Josh's iPad, open-
items.md "2026-09-30 21:40").** FFX "Aeon Battle" (PS2) crashed the app (out
of memory); after the reload, EVERY console song failed "couldn't load
module tools/ps2/psf2.mjs: Importing a module script failed" ×3 until a full
app restart. Two separate bugs, both fixed without touching step 3's own
work (which was in progress on the same day):
- **The crash itself**: the memory budget (`planChipRender`) only ever
  checked KEPT bytes, but step 0 had already proven the worker's PEAK on the
  mono plan is ~3x kept for a kind with no stream hook — `R.render` hands
  back the WHOLE stereo pair for every group in one non-streamed call, and a
  mono downmix copy is then made while that stereo original is STILL
  referenced. For a kind that DOES have a stream hook (psf/psf2 — the kinds
  that actually crashed), `renderStreamed` (tools/chip-worker.mjs) /
  `chipRenderStreamed` (index.html's inline fallback, kept in step) now
  render into the FINAL kept buffers chunk by chunk (1s chunks) instead of
  calling `R.render` once: peak ≈ kept + one chunk. A plan.mono decision
  still needs to see a track's WHOLE pan history, so there are two passes
  over the stream only when mono is needed (chipStaticPan's own windowed
  sampling run per chunk instead of over a whole-track buffer this never
  allocates — a chunk whose own window already shows movement marks the
  track stereo outright, the same safe direction as the original check);
  either pass reuses ONE stream object (`seek(0)` between them) since psf/
  psf2 have no per-frame emulation step to redo. `planChipRender` grew a
  `canStream` flag (true for psf/psf2, both call sites: the worker's bottom
  `self.onmessage` and index.html's `chipRender`) — a kind WITHOUT a stream
  hook still gets the OLD (3x-honest) admission check for its mono step, so
  a "mono fits" verdict there now actually respects the real budget instead
  of only the kept-bytes estimate; `bytes` itself still reports the kept
  estimate either way. Tests: tests/chip-worker.test.mjs — `renderStreamed`
  on `RUNNERS.fakestream`'s own deterministic signal (a genuinely constant
  per-track pan, one permanently-silent track) keeps peak within 10% of
  kept; `planChipRender` on Aeon-Battle-sized numbers (32 tracks, ~280s)
  always reaches a verdict that respects a 600 MB budget, canStream true or
  false, never a false "fits".
- **The recovery**: after a crash the content process can still be
  recovering, so the FIRST import after it fails even for a kind never
  involved — a transient failure that shouldn't need a restart to clear.
  `loadM` (tools/chip-worker.mjs, now used by BOTH the worker's whole-render
  handler and `handleStream` — the whole-render handler no longer carries
  its own duplicate loader) and `chipModules` (index.html) each retry the
  WHOLE set once, inline, with a fresh cache-buster (never the identical
  failed URL), logging `err.name`/`err.message`/the module path/
  `performance.memory` (when present) before retrying; neither ever caches a
  failed import either way, so a second failure still gets a clean retry
  next time. `chipRenderInWorker` already fell back to the inline path on
  ANY worker failure (one existing behavior this didn't need to change).
  Tests: tests/chip-worker.test.mjs and tests/night-roll.test.mjs — an
  `importFn` test seam (no real file can be made to fail once then succeed)
  confirms one retry with a fresh buster on a first failure, the retried
  result is used and cached, and two failures in a row still throws
  (naming the path) without caching the failure.

**Stream mode: the page scheduler (2026-09-30, docs/streamed-render-plan.md
step 3 — default OFF).** Step 2's chip-worker.mjs protocol wired into the
page, behind a switch: with it off, chipRender/chipPublish/chipPcmToBuffers/
chipStart/planChipRender (the whole-render path) are not called any
differently than before this step and `chip.stream` stays null forever —
every existing iPad-audio behavior is untouched. Settings → Other → **Chip
stream** (beside Debug log): off/auto/on, `ff1roll-chipstream`, overridden
per-tab by `?chipstream=on|off` (`PERF_FLAGS`, the same hand-rolled
`location.search` reader `?dpr`/`?scene` already use — works in the vm test
sandbox, which has no real `location`). "Auto" behaves like "off" until a
later step defines it (stream only where the whole render would downgrade
or refuse). The page never hardcodes which chip kinds qualify (CLAUDE.md:
no per-kind table in a capture engine) — `chipRenderAuto` (chip.renderPromise's
entry point, replacing a bare `chipRender()` call) tries `chipStreamOpen()`
first when the switch is on, and falls back to the existing `chipRender()`
on ANY failure (a `{stream:{error}}` reply, a worker that won't start, a
song that changed underneath it) — today that fallback is the only path for
every kind but psf/psf2, since the worker is the one place that knows which
kinds have a stream hook.

`chipStreamOpen` opens (or reuses) `chipWorker`, posts `{stream:{…}}`, and
resolves once `{ready}` arrives AND the first window is cached — the
chunks covering the play-from position + 1, so a brand-new render never
makes the very first ▶ wait on the network/worker for its first sound, same
contract `chipRender`'s own promise already had. `chipSegments(fromSec,
loopSeg, playRate, lead, albumEndAbs, playT0)` is the pure tape-time mapping
this all runs on — generalizing chipStart's own "tape time = chip.lead +
songSec × playRate" (the identity a single native-looping AudioBufferSourceNode
already relies on at a constant `playbackRate`) from one big loopable buffer
to a RUN of small per-chunk buffers: segment 0 plays the current pass's
remainder (a resume mid-loop chases its own tail, same as the note
scheduler), every segment after repeats the WHOLE loop body — a hard splice
at the wrap, no crossfade between passes, same as `src.loop` today — and
album end truncates. `chip.stream = {key, gen, rate, chunkFrames, overlap,
tracks, seconds, frames, leadSec, silent:Set, cache:Map(idx->{buffers,bytes,
pinned}), pinnedIdx:Set, scheduled:Set, waiters:Map, bytes, peakBytes, live,
srcs}`. `chipActive()`/`chipHas()` read it alongside `chip.pcm`/`chip.buffers`
(`chipHas` in stream mode: listed in `chip.stream.tracks` and not in
`chip.stream.silent` — the idle sweep's own report); the synth guard in
`scheduleNote` (the `!n._preview && chipActive() && …` line) reads
`chip.stream.live` instead of `chip.srcs.length` when in stream mode — same
"no real source yet, let the synth carry it" contract either way.

`play()`'s existing ~60ms pump calls `chipStreamPump(audio.currentTime)`
FIRST, every tick, whenever `chip.stream` is this song's live session (gated
internally on `playing`/the open song, so a stray tick after `stop()` is
harmless): it asks `chipSegments` for the segments up to a horizon (~7s
visible, ~12s `document.hidden` — the OS throttles timers in a hidden tab,
same reasoning as the note scheduler's own lookahead), requests any needed
chunk indices not yet cached (`{want}`, contiguous runs batched into one
message), and for every cached chunk inside the tick's own scheduling
window schedules an `AudioBufferSourceNode` — `src -> [chip.pan panner, if
any] -> trackGain(ti)`, the EXACT wiring `chipStart` already uses — at
`when = segment.when + max(0, chunkTapeStart - segment.tapeFrom) / playRate`,
`offset`/`duration` trimmed to the segment's own span (a mid-chunk resume,
or a hard splice at a loop wrap/album end never bleeds into the next
segment). Overlap-add between adjacent chunks' baked fades (step 2) needs no
special handling here — both chunks are simply scheduled at their own
natural tape alignment and the Web Audio graph sums them. Evicts cached
chunks behind the playhead (one chunk of slack for the overlap tail still
sounding) to keep memory bounded over an arbitrarily long play, and keeps
the chunks covering `[loopSeg.start, loopSeg.start + 2s]` PINNED (requested
ahead of need, never evicted) so a loop wrap never waits on the worker.
`chipStreamStart(fromSec)` replaces `chipStart(fromSec)` in stream mode:
no new render — the existing cache is kept (a replay from elsewhere can
reuse it) — just stops the old sources, bumps `gen` (cancelling any
in-flight `{want}`/`{idle}` for the position being left; a `{seek}` message
keeps the worker's own sequential-reuse bookkeeping honest too), and pumps
once synchronously for the first window. `chipStopSrcs` (stop()'s existing
call site, unchanged) now also stops `chip.stream.srcs` and clears
`chip.stream.live` — keeping the cache, per the plan's own words.

Tests: tests/night-roll.test.mjs — `chipSegments`'s own boundary math
(a chunk-boundary crossing, loop wrap + the next pass starting back-to-back,
album-end truncation, count-in's `playT0` shift, 50% speed, `chip.lead`
offset, degenerate inputs); `chipStreamIdxForTapeSec` (a seek to 90s is
chunk 45, 2s chunks); the synth guard reading `chip.stream.live` and a
silent-track report re-enabling synth for that one track; and a full
protocol exercise with a synchronous FAKE worker — switch off posts no
`{stream}` message at all, a `{stream:{error}}` falls back to the whole
render, a successful open's sources connect through `trackGain(ti)`, the
cache stays bounded (< 30 chunks held) over a simulated 200s play, and a
seek to 90s posts its `{seek}`/first `{want}` at chunk 45. The vm's fake
AudioContext (tests/harness.mjs, mirrored in tests/e2e/helpers.mjs) gained
a `playbackRate` param on its buffer-source node — `chipStart` itself had
never been exercised end-to-end through the harness before (existing chip
tests stub `chip.buffers`/`chip.srcs` directly), so this is the first thing
to need it.

Not yet covered here (flagged for Josh before flipping the switch for real):
the actual overlap-add math (step 2's own tests already cover that chunk
shape in isolation; nothing here re-verifies it survives real scheduling
jitter) and the `{idle}` sweep's re-check cadence (today: once, right after
the first window lands — a track that goes silent only much later in a
long song won't be caught until a later step adds a periodic recheck).

**"auto" (2026-10-01, docs/streamed-render-plan.md step 5 — default still
OFF).** "auto" streams a song ONLY where the whole-render path would itself
have to downgrade (mono, or a lower sample rate) or refuse — `planChipRender`'s
own verdict for THAT song, with the honest `canStream:true` peak estimate
(the Aeon Battle crash fix, above). `tools/chip-worker.mjs`'s `handleStream`
already parses/runs the song to open a stream session regardless of mode, so
it computes the hypothetical whole-render plan there for free
(`chipEstimateTracksW` + `planChipRender`, the exact numbers the plain
whole-render handler itself uses) whenever the `{stream:{…}}` request
carries a `budget`, returning it as `{ready:{…, plan}}` — omitted (`null`)
when no `budget` is given, so an ordinary "on"-mode open is untouched.
`chipStreamOpen(auto)` (index.html) sends that budget only when `auto` is
true; once `{ready}` answers, `chipAutoShouldStream(plan, nativeRate)` —
`!!plan && (plan.refuse || plan.mono || plan.rate !== nativeRate)` — decides
whether to KEEP the session it just opened (stream) or terminate that
worker and return `false`, the exact same shape as any other "fall back to
`chipRender()`" exit — a song that already fits plays the unchanged whole
render, byte for byte, same as "off". One `logDebug` line either way
(`chipAutoReason`): "Challenge: streaming — whole render would drop to 24
kHz mono", or "small: whole — whole render fits as-is". A kind with no
stream hook at all (today: everything but psf/psf2) never reaches this
decision — the worker's pre-existing `{stream:{error:"no stream for
<kind>"}}` reply (the same fallback "on" mode already relies on) sends it
straight to the whole path, logged by the existing error branch; the page
still never hardcodes which kinds qualify.

Tests: tests/chip-worker.test.mjs — `{ready}.plan` present and matching
`planChipRender` exactly when a `budget` is given, `null` without one (a
fixed 30-channel fake chip stands in for an FFX-Challenge-sized song without
actually rendering 30 tracks' worth of PCM). tests/night-roll.test.mjs — a
FAKE worker exercising `chipRenderAuto` end to end: a big psf2 plan that
would downgrade keeps the stream session; a small one discards it for the
whole render; a kind with no stream hook goes straight to whole; each path
logs its one line. The DEFAULT stays "off" either way — Josh hasn't
A/B-listened to stream mode for real yet (his weekend list has it); this
step only changes what "auto" itself does once someone picks it.

**Chip audio** (2026-08-17, `chip` button in the transport during an
import session): the captured APU register log rendered through a
pure-JS 2A03 DSP (tools/nsf/apu-render.mjs — duty sequencers, hardware
envelope units, length/sweep/linear counters, noise LFSR, Nesdev
output curves, console RC filters). This is the console's own voice:
a 33ms arpeggio run is one pulse wave changing period, not N oscillator
attacks — built after oscillator-per-note rendering could not do MM2's
fast sections justice. Renders ~400x realtime, per-channel buffers so
mute/solo gains still work; loop points honored via buffer looping;
speed slider acts tape-style (pitch follows). Re-capturing invalidates
the render. All async yields (emulation, loop scan, render) use
MessageChannel, not setTimeout — background tabs throttle setTimeout
to ~1/sec.

Chip audio is per chip since 2026-09-27: `chipSource()` returns `chip`
(live session → IndexedDB record → album.json `nsf.chip` → the vault
extension), `chipRender` parses/runs through `CHIPS[kind]` and builds one
buffer per name in `CHIPS[kind].channels` — a Game Boy song gets
pulse1/pulse2/wave/noise buffers matched to its tracks by name exactly
like the NES four; missing channels are skipped.
Chip audio is the DEFAULT wherever a source resolves (Josh: "a million
times better... always use this if possible"; the chip button is the
opt-out, preference in ff1roll-chip). Source chain, honoring the
*.nsf gitignore (ROM music never enters the public repo): live import
session → this device's IndexedDB cache → **Night-Roll-App/nsf-archive**,
Josh's PRIVATE repo, fetched via the GitHub API with the same token
Sync uses, then cached. album.json carries only metadata: `nsf:
{vault: "<file>.nsf", tracks: {<base>: {n, secs}}}` — Commit import
writes it and uploads the album's NSF to the archive; FF1's album.json
maps all 19 tracks to ff1.nsf, so the whole analysis album plays with
the console's own voice on any device with the token.

**A rip with more than one chip file** (2026-10-04,
docs/plans/2026-10-04-multi-file-chip-sets.md — Zophar's GB Tetris ships
DMG-TRA-0.gbs v1.0 and DMG-TRA-1.gbs v1.1, one of 18 playlist lines naming
the second): `openPickedFiles` hands EVERY chip file of the first one's
kind to `openChipImport`, in name order. The first is the album's
`nsf.vault` as always; each other file is archived beside it as
`<console>/<slug>.<file slug><ext>` (`chipExtraVault` —
"game-boy/tetris.dmg-tra-1.gbs": a dot, so it can never be another album's
slug; the whole name, so `instrumentsFolder` stays unique), and a track
captured from it carries that path as `nsf.tracks[base].vault`.
`chipSource` reads it: fetches that file and caches the bytes in the
track's own entry of the album's device record (like a per-file track,
but with its real slot, never 1). Session rows stay keyed by one number:
id = `offset(file) + slot`, the first file's offset 0 (`impRowId`), so a
one-file import is unchanged; a non-first file's rows carry `parsed`,
`bytes`, `slot`, `srcName`, `vault`. `parseM3u` keeps each line's file
(`{file, n, title, len}`): a line applies to the file it names; a line
naming a file that was NOT picked is skipped and named in the status
whenever the playlist names any picked file (picking one file of a
two-file pack no longer lets the sibling's line overwrite a slot); a
playlist naming none of the picked files applies to the first as before.
No playlist: each file lists its own slots (`<file base> track-NN` for the
non-first ones). A playlist matched to an album LATER (`applyM3uToAlbum`'s
`m3uTrackKeys`/`m3uTrackFor`; tools/album-order.mjs mirrors them): a line
naming a non-first file matches the track whose vault carries that file's
slug (`chipVaultFileSlug`), any other line a track with no vault — the
same n lives once per file. Archive uploads (`commitImports`,
tools/import-set.mjs) go through one list at the paths the readers fetch;
until 2026-10-04 the in-app publish PUT files at the archive root
(`slug + ext`) while every reader had fetched `<console>/…` since the
2026-09-29 reorganization. Tests: tests/multi-file-chip.test.mjs,
tests/import-set.test.mjs "two chip files", tests/album-order.test.mjs
"two-file rip", tests/m3u-real.test.mjs (Tetris rows 02/03).

**Robustness:** MIDI parser finds tracks by MTrk magic scan (the original
ff1battle had corrupt length headers — since rebuilt clean, guard kept),
honors end-of-track, clamps note durations to 8
bars, truncates a track at any internal silence > 32 bars (real tacets max
24 in this catalog). ff1ship.mid was truncated at the source
(thefinalfantasy.net serves a 512-byte file); replaced 2026-07-31 with
vgmusic.com's ff1ship2.mid — same transcription, 5 tracks incl. drums.

## .rollnotes format (the spec)

Sidecar file next to each .mid: `<song>.rollnotes.json`. **JSON since
2026-08-15** (version 1; renamed from bare `.rollnotes` same day — the
extension says what the content is) — the file is a direct serialization of the
app's in-memory note objects, one note per line so git diffs stay
line-per-change:

```json
{ "version": 1, "song": "menu", "notes": [
  {"at":[1,1],"type":"timesig","timesig":"6/8"},
  {"at":[1,1],"type":"key","key":"Bb"},
  {"at":[2,1],"type":"key","key":"A#/Bb?"},
  {"at":[1,1],"to":[4,6],"type":"section","label":"A — home"},
  {"at":[5,3],"to":[5,4],"type":"chord","chord":"G7/B","note":"no 5th"},
  {"at":[3,1],"type":"tempo","bpm":90},
  {"at":[1,1],"type":"track","track":"pulse1","voice":"sine","color":"#0aa2c0"},
  {"at":[2,1],"type":"chop","chop":"start"},
  {"at":[25,1],"type":"loop","loop":"2.1"},
  {"at":[6,2.5],"text":"Plain prose observation."}
] }
```

**v2 (P3 reader 2026-10-01, P4 writer 2026-10-01, docs/annotations-v2.md +
its JSON Schema):** same shape plus a header — `format:
"night-roll-annotations"`, `version: 2`, optional `origin` ({kind:
composition|copy|import|capture|starter, from?, movedFrom?, at?} —
structured form of the `"forked from <path>"`/`"moved from <path>"` notes
below), `stamp` (v1's `saved`, renamed so a v2 reader can't confuse the
two). `notes` is byte-identical to v1's — same per-entry schema, same
deriver. **The reader (every device) accepts v1 and v2 transparently; the
writer is v2 as of P4** — `serializeNotesList`/`serializeRollnotes`/
`serializeRollnotesStamped` (index.html) now take an `origin` to put in the
header and always emit `format`/`version: 2`; every path that writes a
`.rollnotes.json` goes through it (`publishSong`, `commitImports`, the
iPad Files mirror, Copy/Download). A v1 file upgrades to v2 the next time
the app PUBLISHES that song (natural migration, notes unchanged) — reading
one and never publishing writes nothing; **P5** is the one-time batch
migration of every file that's never republished on its own (Josh's
ruling: a format conversion, not editing his songs). A file whose
`version` is higher than this app understands (or whose `format` it
doesn't recognize) opens READ-ONLY: `rollnotesReadOnly`/
`rollnotesLockReason` (index.html, set in `loadNotes`) carry the ⚠
"written by a newer Night Roll" state for the open song, and
`annotationsFor` — the one function every publish/Move reads through
before writing — throws on it, so Publish/Publish all/Move refuse with
that message; as of P4 every MANUAL annotation edit path refuses the same
way before it ever lands in `rollnotes`/localStorage — the note editor's
Save/Delete, the chord/section/key dialogs (all one editor, `#nsave`/
`#ndelete`), lasso paste (`pasteAnnotations`), the chord tool
(`insertChordAt`), and Analyze → Adopt (`adoptChordBand`/
`adoptAllChords`) — closing the gap P3 flagged (only the ✦ Ask tool and
Publish/Move refused before). Tools: `tools/query-lib.mjs`'s `loadSong`
surfaces `rollnotesVersion`/`rollnotesReadOnly`/`rollnotesOrigin` on its
`doc` for the same reason; `tools/import-set.mjs` runs the in-app
`commitImports` through the vm harness, so it gets the v2 writer for free.

**Stored origin (P4):** `origin.kind`/`from`/`movedFrom` are now set where
they're KNOWN, not derived from a note — `forkCurrentSong` (Save As/✎ Edit
a copy/"Make it mine") sets `{kind: "copy", from: <source path>, at}`;
`moveComposition` sets `movedFrom` (keeping whatever `kind` the song
already had) the first time a song leaves nightroll/; `createComposition`
sets `{kind: "composition", at}`; `commitImports` sets `{kind: "import",
at}`. None of these write a `"forked from"`/`"moved from"` NOTE into
`rollnotes` any more (Q8) — a song not yet published stashes its pending
origin in `localStorage["ff1roll-origin-" + key]` (`setOrigin`/
`pendingOrigin`, carried by `renameLocalKeys` like every other per-song
key); `publishSong` writes whatever's ALREADY on the file on disk
(`annotationsFor(key).origin`, preserved through `subtractTombstones` now)
if there is one, else that pending stash (`originFor(key, notes)`) — so a
song's origin is set once and rides forward unchanged through every later
publish. `originOf(key)` now checks the OPEN song's stored
`rollnotesOrigin.kind` FIRST, before any of the old path/draft/note
sniffing — a v2 file's header settles it outright. The legacy
`"forked from <path>"`/`"moved from <path>"` note text (and
`hasProvenanceNote`'s fallback scan for it) still reads forever, for every
file P4 doesn't touch until it next publishes.

**Analysis-sheet entries (S1, 2026-10-05, docs/plans/2026-10-05-analysis-
sheet.md §3a):** `{"at":[1,1],"type":"analysis","item":"summary.what",
"done":true,"note":"<his answer>"}` — one per sheet prompt that has a tick
or an answer; legacy text `analysis: summary.what done=1` + the answer as
attached lines. Anchored at 1.1 because a note needs an anchor; never
drawn (no flag, no subtitle, no flag tap — `isUndrawnAnno`), never moved
by Insert/Delete bars, chop shifts or a meter change, skipped by
`hasNotes`. One entry per `item`: `putStudyEntry(item, {done, text})`
(src/model/rollnotes.js) is the write path — it retires the old entry
(tombstone if published), drops an unticked empty one instead of writing
it, and saves the local store; `mergeLocalAdditions` matches these by
item + body, not by text line; `dedupedNotesWithIndex` keeps the last per
item. Code uses the `study` stem (`n.study = {item, done}`,
`studyDirText`, `studyFromText`, `studyEntryFor`) — `analysis*` names in
src/ are the Normal-only estimate layer. **Forward compatibility (same
day):** the reader keeps a field it does not know (`n.extra`, written
back by `noteToJSON`) and a whole type it does not know (`n.opaque`,
written back verbatim) — a stale build publishing never strips either
(docs/annotations-v2.md "Forward compatibility").

Source fields only: `at`/`to` are [bar, beat] (beats may be fractional;
`to` beat omitted = end of bar), `type` + its value field(s), free
`text` (or `note` attached to a chord). Derived data (ticks, band
depths, region ends, key sf) is computed at load, never stored. The
semantics of every type are exactly the legacy directives below — both
formats reduce to the same raw shape and run through the same
derivation code, and the format-identity test (text → object → JSON →
object, deepEqual) enforces that they can never disagree. The legacy
TEXT format below parses forever (loading sniffs the first character);
any Sync rewrites a song as JSON.

### Legacy text grammar (still parsed, no longer written)

```
[3.1]              ← anchor: bar 3, beat 1 (beats may be fractional: 2.5)
Free text until the next [anchor]. This is a regular note.

[7.1 - 8.4]        ← range: bars 7–8 inclusive (end beat inclusive)
Range note. Tints its span; active for the subtitle across it.

[1.1 - 4.4]
section: A — G home   ← "section:" prefix = arrangement band in the ruler.
                        Nesting inferred by range containment; same label
                        = same color.

[5.1 - 5.2]
chord: Gm          ← "chord:" prefix = chord band. Renders and nests exactly
                     like a section band (containment = depth; same label =
                     same color) but is a distinct type: grouped separately
                     in the ☰ Notes list, entered via the chord widget.
                     Symbol standard = the lasso chord namer's vocabulary:
                     bare root = major (C), m = minor (Gm), then 7/maj7/m7/
                     m7b5/dim/dim7/aug/6/m6/sus4/sus2/5/9/m9/maj9/add9/7b9,
                     slash bass as /E, "(no 5th)" allowed as qualifier.

[5.3 - 5.4]
chord: G7/B        ← lines after the symbol = attached note (shows as ✱ on
no 5th — bass has it   the band, previewed in the ☰ list, kept on round-trip).

[9.1]
key: Bb            ← "key:" prefix = key directive. Open-ended: applies
                     until the next open key directive.

[2.1 - 4.4]
key: Db            ← ranged key: applies bars 2–4, then the surrounding
                     key resumes (score draws cancellation naturals).

[1.1]
timesig: 6/8       ← meter directive. Until one exists the app runs on a
                     neutral 4/4 ruler — the MIDI's meter meta drives
                     nothing visible (meter is analysis, like keys).
                     Declaring one re-bars the song; the editor converts
                     existing anchors through absolute time (two-tap
                     warning) so annotations keep their musical positions.
                     One per song. Beats in anchors count the DENOMINATOR
                     note: under 6/8, [1.4] = the fourth eighth, and the
                     first half-bar chord is [1.1 - 1.3].

[3.1]
tempo: 90          ← tempo directive, TWO meanings by song kind (Josh's
                     ruling, 2026-08-15): on an app-created song it
                     AUTHORS — the tempo map rebuilds from the song's
                     base plus every directive, and playback/LCD/Save
                     follow. On an analyzed song it is an OBSERVATION —
                     records that the music changes tempo here and
                     leaves playback untouched (capture timing is
                     measured fact).

[1.1]
track: pulse1 voice=sine color=#0aa2c0
                   ← track directive (2026-08-15): per-track VOICE (auto NES /
                     pulse 50·25·12.5% / triangle / sine / saw) and COLOR
                     override, set from the chip's voice-&-color menu (tap
                     the selected chip again). A synced annotation like any
                     other — song truth, not device preference. Playback
                     only; the .mid is never touched. Tracks matched by
                     name (or trN index). Removing it reverts to defaults.

[3.1]
chop: start        ← non-destructive trim, RAW capture coordinates (the one
                     annotation type that is): hides everything before raw
                     3.1 and renumbers — raw 3.1 becomes displayed 1.1.
                     At most one per song; "chop: end" likewise hides
                     everything at/after its anchor. All OTHER annotations
                     live in displayed coordinates; adding/removing a start
                     chop shifts them through absolute time (two-tap
                     warning), so chords stay glued to their music. The
                     hidden material is gone entirely (no ghost); the .mid
                     is untouched — delete the directive to restore.
                     Editor prefills the cut from the cursor; ☰ list shows
                     chop anchors with a "raw" tag.

[25.1]
loop: 2.1          ← "loop:" prefix = loop directive. The anchor is the
                     jump point: when playback reaches bar 25 beat 1 it
                     returns to the target (here bar 2, skipping ship's
                     pickup-intro bar). An anchor at/before the target
                     means the jump fires at song end. One per song.
```

- `#` lines are comments — **dropped on round-trip** (the app rewrites the
  whole file on Sync). Never store important info in comments.
- Key names: C G D A E B F# C# F Bb Eb Ab Db Gb Cb, plus minor as "Em",
  "Bbm" (minor maps to its relative major's signature).
- Every FF song is a chip capture (2026-08-02, extracted from the NSF via
  tools/nsf/), trimmed to intro + one loop pass at the frame-exact repeat
  point — see albums/final-fantasy-i/CUTS.md for the verified cut/loop table. Songs whose
  loop returns past a once-only intro carry a measured `loop:` directive
  in their rollnotes (battle, gameover, overworld, ship, victory).

## Module map (src/ — docs/split-plan.md)

index.html is markup only — its CSS is `css/app.css` (one `<link
rel="stylesheet">` in `<head>`, before `ts-boot`; docs/split-plan.md §4 step
16 moved the former `<style>` block there verbatim; sw.js precaches it and
serves css/ network-first like src/, tools/package.mjs copies css/ and
refuses to ship if a linked stylesheet is missing; tests grep it through
tests/harness.mjs `appCss()`, and `appSource()` includes it); the app itself
is plain browser ES modules under src/, entry src/main.js, no build step.
**The split is finished
(docs/split-plan.md steps 0a–14, docs/split-phase2-plan.md steps 0–13,
2026-10-04): src/app.js no longer exists.** Every module below is a real
module at its layer (tools/split/check.mjs LAYERS); `src/main.js` is wiring
only — `installHooks()` (src/wire.js, the one place a lower layer's upcall
port binds to its higher-layer body), the 66 `init<Module><N>()` calls in
the one-file app's original top-level order, `boot()` (src/session/boot.js),
the gated devtools mirror — and tests/boot-order.test.mjs holds that order
statement by statement. check.mjs rule 8 keeps index.html's modulepreload
list, sw.js's APP_MODULES, and src/devtools.js's mirrored imports all equal
to the real src/ listing. The entries below were written step by step as
code left app.js; **every "stays in app.js" / "did NOT move" / "blocked"
clause in them is history** — the step that finally moved each name is in
docs/split-phase2-plan.md's write-ups, and the file a name lives in today
is whatever `grep -rn "^export .* NAME"` says. The "Code map" section right
below is the old one-file section map, kept for the vocabulary; the
sections are these modules now.

- `main.js` — entry, wiring only (phase 2 step 13, 2026-10-04): `installHooks();` first (every hooks.js port throws `hook X not installed` before it), then the 66 `init*()` calls in the original top-level order — `initBase1`, `initBoot1`, `initMode1`, `initPerf1`, `initRoll1`, `initBase2`, `initChrome2` … `initSw1`, `initSheets9` — then `boot()`, then (if `window.__NR_EXPOSE`) `exposeGlobals()`. Adding a new piece of boot-time wiring means a new `export function init<Module><N>()` in its module and one call here at the right spot; nothing else in src/ may run at module-evaluation time (check.mjs rule 4). The order is the contract: tests/boot-order.test.mjs compares main.js's expanded statement sequence against tests/split-fixtures/boot-order.txt (re-snapshot with `node tools/split/boot-order.mjs --write` only when a boot-order change is intended).
- `edition.js` — `export const EDITION = "web"`; tools/package.mjs rewrites this one line to `"app"` for the store build (index.html itself is now copied byte-for-byte, no transform).
- `state.js` — `export const S`: every piece of mutable app state (step 1, promote-state.mjs, 2026-10-02 — ~257 former top-level `let`/`var` names in app.js). No imports, so it evaluates first; every `S` field exists before any app code runs, which removes the boot-path TDZ class of bug for state by construction (see "Project conventions" below — the old per-site TDZ note is retired as a live risk, kept here for history).
- `app.js` — **deleted** (phase 2 step 13, 2026-10-04). It was the whole pre-split app (step 0b's cutover, 2026-10-02, verbatim from the old inline `<script>`), shrank step by step as real modules were carved out of it (15,054 lines after phase 1; 5,865 after phase 2 step 10; zero declarations after step 11; 66 init stubs after step 12), and its stub list became main.js. Its generated `__nrExpose$` e2e footer and the tools that wrote it (tools/split/e2e-footer.mjs, regen-e2e-footer.mjs, cutover.mjs) went with it; devtools.js mirrors real exports only.
- `devtools.js` — `exposeGlobals()`: window accessors for every module's exports (GET-only — an ES module's exported binding can't be assigned by an importer) and for every `S` field (GET+SET, step 1 — `song = …`/`mode = …` in a `page.evaluate()` write `S.song`/`S.mode`), so Playwright's bare-name reads and assignments keep working (module bindings aren't window properties); tools/split/check-e2e-globals.mjs proves statically that every bare name tests/e2e/ evaluates is covered. A new module needs its `import * as` line here (rule 8). Gated by `window.__NR_EXPOSE`; never touches production otherwise.
- `ui/icons.js` — the Material `ICON` table + `iconSvg(name, cls)` (step 2, 2026-10-02), moved out of app.js verbatim. Layer 0 (declared early, boot-path TDZ rule): `renderViewMenu` and other boot-time renderers call `iconSvg()` before the rest of the script has run.
- `ui/controls.js` — the control registry (step 2, 2026-10-02 — see "Controls registry" below): `CONTROLS` (id → {icon, glyph, cls, label, prefix, aria}) and `setControl(id, patch)`, the only place that writes a registered control's innerHTML/aria-label. `setPlayBtn`/`setVolBtn` moved here as thin wrappers.
- `midi/parse.js` — `parseMidi` (format-1/0 SMF reader: tempo map, timesig/keysig, phase-2 raw-leftover capture for foreign files) + `tickToSec`/`secToTick` (step 3, 2026-10-03), moved out of app.js verbatim. Imports `S` for `S.playRate` (tick/sec conversion's practice-tempo multiplier) — layer 0, same tier as state.js, so this is a same-layer import, not a downward one.
- `midi/write.js` — `writeMidi` (step 3, 2026-10-03): the hand-port SMF writer (format-1, meta track + one track per voice); self-contained, no imports. Paired with `tools/nsf/midi-write.mjs`'s `writeSongMidi` — the "writeMidi / writeSongMidi agree byte-for-byte" test pins the two together.
- `theory/chords.js` — pitch spelling + chord naming/parsing (step 4, 2026-10-03): `spellPc`/`pitchName`/`nameChord` (+ `CHORD_TEMPLATES`), `chordSym` (+ `CHORD_FLAT`), `parseNumeral`/`splitProgression` (+ `NUM_DEG`/`MAJ_STEP`/`MIN_STEP`), `chordQualParse`/`chordQualCompose` (+ `CHORD_BASES`/`CHORD_EXTS`), `parseChordSym` — plus the spelling-table helpers `spellFor`/`keySpelling`/`SHARP_SPELL`/`spellMemo`/`SF_MAJOR`/`LETTERS`/`LETTER_PC` these needed to come along (unlisted by the plan but unavoidable: `spellPc` calls `spellFor` on every non-null `sf`). Self-contained, no S or DOM dependency except where noted. One behavior-preserving edit was needed: `spellPc`'s old `sf === undefined` fallback called `sfShownAt()` (a Learning/Normal-mode-gating function staying in app.js — moving it would have put a theory-layer module above a `LEGACY_CONTAINER` import, which check.mjs rule 5 forbids); the one call site that relied on the default (the ruler pitch-class label) now resolves `sfShownAt(S.playCursor)` itself and passes it in, so `spellPc` never needs the default branch. See docs/split-plan.md "Deviations (4)".
- `theory/key.js` — the pure half of key-estimate/file-declared-key checking (step 4, 2026-10-03): `pearsonCorr`, `fileKeyAt`, `checkMeterVsFile`, plus the spelling-table helpers `keyNameFor`/`trueSf`/`TONIC_SPELL`/`FIFTHS_POS`/`MODE_FIFTHS` `fileKeyAt` needed, plus (step 5, 2026-10-03) `keyNameToSf` (+ `MODE_OFFSET`/`LETTER_SF`/`MODE_SF_OFFSET`) — the name→signed-fifths counterpart of `keyNameFor`, pulled out of app.js's annotation parser (`deriveNoteTypes`'s `key:` directive) because it's pure theory, not annotation-model logic, and belongs beside its sibling. Imports `S` (layer 0, same tier). **`estimateKey` and `checkKeyVsFile` still did NOT move** (step 5 was asked to retry this once `trackIsDrums`/`barTicks` left app.js — see below — but it turns out they can never land here): `theory/` is layer 0, the lowest layer, and `estimateKey`/`checkKeyVsFile` need `trackIsDrums`/`barTicks`, which are genuinely model-layer (layer 2) concepts wherever they live. Layer 0 may only import layer 0, by construction, forever — moving `trackIsDrums`/`barTicks` out of `app.js` and into `model/` (which step 5 did) does not change this; it only swaps which layer blocks the import (`LEGACY_CONTAINER` for `model`, both impossible for a layer-0 importer). Both functions still live in app.js, bare-name reachable exactly as before (every Learning-mode spy test — "estimateKey is never called in Learning" — still passes; nothing about the gating moved). See docs/split-plan.md "Deviations (5)" and open-items.md's corrected QUEUED entry (the earlier one assumed this would resolve itself once step 5 landed; it doesn't). **Step 10 (2026-10-03) added `tonicPcOfName`/`modeOfName`** (unlisted by any step's table — pure key-name parsers, `"G#m"`/`"D dorian"` → pc/mode, the inverse direction of `keyNameFor`): `gen/bassist.js`'s `bsInferTimeline`/`bsChordTimeline` need them for the minor-key harmonic-minor candidate and the "N.C." pedal-tone reading, and both were still bare in app.js blocking that move for no reason of their own (zero dependencies beyond `LETTER_PC`, already here). Relocating them (not moving `bsInferTimeline` into theory — the usual direction) is the same "unblock the real target by moving ITS unclaimed pure dependency" correction steps 4/5/9 each made. See docs/split-plan.md "Deviations (10)".
- `theory/facts/{common,pattern,form,melody,rhythm,bass,voices,format}.js` — the music-theory FACTS toolkit (2026-10-04, docs/theory-toolkit.md; not part of the split, a new subsystem). Layer 0 and genuinely pure: no `S`, no DOM, the only import is `keySpelling` from `theory/chords.js`, so the tests import the modules directly in plain Node. Every function takes a `doc` (`{ppq, barTicks, beatTicks, tracks:[{name, notes:[{t,d,p,v}]}], rollnotes?}` — what tools/query-lib.mjs `loadSong()` returns; the in-app adapter is sketched in the doc's §3.0, not written) and returns JSON-able facts: `findPattern`/`factsPatternFromSpan` (an interval(+rhythm) figure at any transposition, over every monophonic line — a polyphonic track as rank voices), `formFacts` (bar/half-bar exact/transposed/rhythm-only repeats, phrases A A′ B…, sequences), `melodyFacts`, `rhythmFacts` (+ harmonic rhythm = how often HIS chord bands change, spans only), `bassFacts`, `voiceFacts` (parallel 5ths/8ves by interval class, crossings, overlaps, leaps), `formatFacts`. Facts only, by construction and by test (tests/theory.test.mjs sweeps text and JSON on Overworld and the Bach starter for key/chord/numeral/meter/verdict words); label letters skip i/v/x. **Not wired into the app** — `tools/theory.mjs` is its only caller; §3 of the doc names the integration points (✦ Ask tools first).
- `theory/harmony/{roman,cadence,nct,modulation}.js` — the VERDICT toolkit (docs/theory-harmony.md, 2026-10-04): roman numerals (`hmRomanNumeral`/`hmRomanNumerals`, `hmChromaticSummary`), cadences (`hmCadences`), non-chord tones (`hmNonChordTones`), modulation pivots (`hmModulations`), all read FROM a declared `key:` region and the user's own chord bands — never a key estimate or a chord name from the notes (Learning mode is the law). Pure layer 0 (imports only `theory/chords.js` — the key-name helpers `tonicPcOfName`/`modeOfName`/`MODE_OFFSET` live there now, so nothing here reaches state.js through key.js; `hm`-prefixed names per rule 6); plain-data inputs built by `hmKeyRegionsFromNotes`/`hmBandsFromNotes` from a resolved rollnotes list, so `S.rollnotes` and `tools/query-lib.mjs`'s `doc.rollnotes` feed the same code. **Not wired into the app**: their only importer is `devtools.js`'s mirror (reachable, so `package.mjs` ships them and rule 8 holds); no Ask tool offers them in either mode (`tests/theory-harmony.test.mjs` "not wired"). The integration points and the Normal-only gate they must ship with are in docs/theory-harmony.md. CLI: `tools/harmony.mjs`.
- `model/grid.js` — pencil/snap/grid math (step 5, 2026-10-03): `pencilTicks`, `isTripletDur`, `songHas32nds`, `moveSnapTicks`, `gridAnchorTick`, `snapTickAbs`, `pencilCellAt`, `gridCellStart`, `effTs`, `beatsPerBarEff`, `beatTicks`, `beatsPerBarDisp`, `secDepthCap`, plus `trackIsDrums` (a song/track-model predicate the plan didn't explicitly place, but `songHas32nds` needs it and it's pure S-only — may move again to a future `model/song.js` for conceptual fit; it does NOT unblock `theory/key.js`, see above). `setSecDepth`/`cycleSecDepth` did NOT move — both call `finalizeNotes`/`setInfo`/`clampView`/`draw`/`renderViewMenu`, all still in app.js (render/UI layers, later steps). Imports `barTicks` from `model/rollnotes.js` (same layer).
- `model/rollnotes.js` — the annotation model (step 5, 2026-10-03): `parseRollnotes`/`parseRollnotesJSON`/`jsonToRawNote`/`deriveNoteTypes` (the v1/v2 reader + directive deriver), `noteToJSON`/`trackDirText`/`audioDirText` (the writer's per-entry schema), `serializeNotesList`/`serializeRollnotes`/`serializeRollnotesStamped`/`dedupedNotesWithIndex` (the writer), `resolveNote` (bar.beat → tick), `barTicks`, `applyChop`, `notesBase`/`baseName`/`notesStoreKey`, plus `ROLLNOTES_FORMAT`/`ROLLNOTES_MAX_VERSION`/`ROLLNOTES_LOCK_MSG`, and (2026-10-04) `visibleNotes()`/`annoShown(n)` — the one choke point that hides ✦ AI-tagged annotations in Learning mode (see "✦ Annotate this song…", "Learning hides what Normal wrote"). **`finalizeNotes` did NOT move** despite being named in the plan's table — it's the orchestrator that re-applies declared meter, chop, tempo baking, track directives, section/chord lane layout, and Analyze-layer rows, calling a dozen render/audio/UI functions (`renderTrackbar`, `updateTrackGains`, `sfPreloadForSong`, `gamePreloadForSong`, `fitView`, `applyAudioDirs`, `updateSongMeta`, `keyLabelState`, `bakesTempo`, …) that are all still in app.js (steps 7, 8, 9, 11 territory); moving it would be a rule-5 violation (model, layer 2, importing app.js, layer 5) that a verbatim move can't fix. Still callable bare-name from app.js exactly as before. Imports `beatsPerBarEff`/`beatTicks`/`beatsPerBarDisp` from `model/grid.js` and `keyNameToSf` from `theory/key.js` (both same-layer-or-lower).
- `model/edits.js` — the SAFETY-reviewed slice of the local-song edit store (step 5, 2026-10-03): `editsKey`, `isLocalDraft`, `overlayNoteSig`, `updateClearBtn` — each one verified free of any call into not-yet-split code. **`loadEdits`, `saveEdits`, `foldOldOverlay`, `retireOldOverlay`, `updateEditBtnVis` did NOT move** — this is the exact code that lost Josh's notes on 2026-10-02 (CLAUDE.md), so each candidate was checked individually rather than moved as a block: `saveEdits` needs `isComposition()` (→ `ownFolderPath`/`isCaptureKey`/`albumMetaCache`, provenance+audio-layer, not yet split), `scheduleAnalysisRecompute` (gen/, not yet split), `saveDraft`/`computeSongEnd`/`updateSongMeta` (model/song.js + model/versions.js, step 9); `retireOldOverlay` needs `draftRead` (model/versions.js, step 9); `updateEditBtnVis` needs `updateChipBtn` (audio/chip.js, step 8), `editableSong`/`ownFolderPath`/`originOf` (provenance, step 9 — `LINK_SONGS` itself moved to platform/base.js in step 6 and no longer blocks anything here). Every one of these is a straight rule-5 violation (model, layer 2, importing app.js, layer 5) today. Moving the blocked functions anyway would mean dragging large unrelated provenance/audio/versions code out ahead of its own planned step — exactly the scope creep CLAUDE.md's "no one-time hacks" principle warns against in spirit — or duplicating logic, which the plan forbids outright. All five stay in app.js, bare-name reachable, bodies untouched; every vm test covering this code (the "local song: …" suite in tests/night-roll.test.mjs, 2026-10-02 regression coverage) passes unchanged. Queued for whichever step(s) land platform/provenance (6), audio/chip (8), and model/song+versions (9).
- `model/catalog.js` — pure `S.CATALOG` lookups (step 5, 2026-10-03): `groupOf`, `catalogHas`, `publishedPaths`, `folderOf`, `albumFolders`, `segTitle`, `folderTitle`, `titleCaseSlug`, `FOLDER_NAMES`. **`initCatalog` and `folderScanAlbums` both landed here in step 9 (2026-10-03), resolving two separate permanent-looking blocks from steps 5/6/8 at once.** `folderOnly`/`songsURL` were real platform/* imports since step 6, but `folderScanAlbums` itself did NOT move in step 6 despite this entry once saying so — step 6's own Deviations correctly listed it as blocked (by `albumTitleFor`, "still app.js" at the time; this entry's older text was wrong about that). Step 9 moved `albumMetaCache`/`albumMetaFor` OUT of `audio/chip.js` (layer 3) and INTO `model/provenance.js` (layer 2) — a correction to step 8's own placement, made because `isCaptureKey`/`ownFolderPath` needed them there — which cleared `initCatalog`'s `albumMetaFor` blocker at the same stroke `model/provenance.js` landed `albumTitleFor`, clearing `folderScanAlbums`'s blocker too. `folderScanAlbums` itself moved into `model/catalog.js` (NOT `platform/folder.js`, its step-6-table destination): landing it in platform (layer 1) would need an upward import of `albumTitleFor` (layer 2) the instant it moved — catalog.js, already `initCatalog`'s home, is the only legal layer-2-or-lower destination once `albumTitleFor` sits in provenance.js. Both functions import `folderOnly`/`fsRoot`/`fsReadJSON` (platform/folder.js) and `albumMetaFor`/`albumTitleFor` (model/provenance.js) back, bodies unchanged. See docs/split-plan.md "Deviations (9)" and open-items.md's corrected entry — the earlier ones assumed this was permanent; it wasn't, once `audio/chip.js`'s own placement was reconsidered.
- `platform/base.js` — song links and the perf flags (step 6, 2026-10-03): `setDocTitle`, `linkSongsBase`/`LINK_SONGS`/`linkRepoLabel` (the `?songs=` shared-repo link), `rememberLastSong`, the "recent songs" device list's pure half (`RECENT_KEY`/`RECENT_MAX`/`recentSongs`/`saveRecentSongsRaw`/`clearRecentSongs` — NOT `rememberRecentSong`/`recentSongsForMenu`/`recentAlbumFor`, which call `catalogHas`/`groupOf`/`folderOf`/`folderTitle`/`isUnsaved`/`songTitleOf`, model-layer (2) and still-unsplit app.js names a layer-1 module can never import; those three stay in app.js), `MOVED_DIRS`/`movedPath` (the "just folders" reorg table), `songPathFromURL`/`songShareURL`/`albumParamFromURL`, `PERF_FLAGS`/`PERF_NOSCENE`. Self-contained (globals + `S.APP_BASE` only); `S.APP_BASE` itself stayed in state.js, untouched, since step 1. The top-level `<base>` tag insertion, the boot-time `setDocTitle` call, and the `?dpr=`/PERF_FLAGS override block stayed as top-level side effects in app.js (not declarations — `move.mjs --names` only selects declared names; §2.2's init-wrapping only applies when a step's `--range` sweeps them up, which this step didn't need to do), now reading these names back from platform/base.js.
- `platform/mode.js` — the movable slice of Learning/Normal mode (step 6, 2026-10-03): `hasExistingNightRollPrefs`, `appMode`, `setAppMode`, `analysisAvailable` (Normal-mode-only gate for Analyze, free of everything but `appMode`). **`applyMode` did NOT move** — it calls `finalizeNotes` (model/rollnotes.js, layer 2), `updateSubtitle`, `draw` (render, layer 3), all still-or-newly in a higher layer than platform (1); a layer-0-is-to-layer-2 story identical to `estimateKey`'s in step 4. **`sfShownAt` (the key-spelling gate named explicitly for this step) still did NOT move** — unchanged finding from step 4 (docs/split-plan.md "Deviations (4)"): it calls `estimateKey`, which is still bare in app.js and can never be below platform's own layer-0 tier either. **The top-level `S.APP_MODE = (() => …)()` IIFE and the boot-time `document.body.dataset.mode = …` block also stayed in app.js** (non-declaration top-level statements, same reasoning as platform/base.js above) — they now call `hasExistingNightRollPrefs` via an import instead of a same-file reference; the mode value and its persistence/migration behavior are byte-identical. The Learning-mode gating itself (never volunteer a key/meter/chord name) never moved and was never at risk — every spy test proving it still passes.
- `platform/storage.js` — `cfg`/`saveCfg`/`baseJoin`, every self-contained IndexedDB leaf op (`idbOpen`; `idbAudioPut`/`Get`/`Delete`/`Move`; `idbSf2Put`/`Get`; `idbNsfPut`/`idbNsfPutNow`/`idbNsfGet`; `idbFsGet`/`idbFsPut`; `idbDraftOp`/`idbDraftGet`/`idbDraftDelete`/`idbDraftMove`), `draftStoreKey`, `draftInIdb` (needed `IMP_DIR`/`CONSOLE_OF` to come with it — unlisted by the plan but load-bearing, same pattern as steps 4/5's unlisted constants), and the cfg-driven URL/API builders `readBase`/`songsURL`/`analysisURL`/`nsfURL`/`repoName`/`repoApi`/`apiError` (not named by the plan's table, but they're pure functions of `cfg()` + `EDITION`, the same "where do songs/analysis/NSF live" responsibility as `cfg` itself). **SAFETY (per this step's own instruction — the 2026-10-02 notes-loss regression): `saveEdits`, `loadEdits`, `saveDraft`, `draftWrite`, `draftRead`, `localDraftWrite`, `localDraftTracks`, and `idbDraftPut` did NOT move, verbatim, bodies untouched.** `idbDraftPut` is the one IDB leaf that calls `logErr` (ui/chrome.js, not yet split, layer 4+) in its catch branch — the only blocked member of the otherwise-clean idbDraft* family, so it alone stays, still importing `idbDraftOp`/`idbOpen` from this file (a plain downward import, no behavior change). `localDraftWrite`/`localDraftTracks` also call `logErr`. `draftWrite`/`draftRead` call `localDraftWrite`/`localDraftTracks` (both staying) so they stay too. `saveDraft` separately needs `isComposition`/`editableSong`/`retireOldOverlay`/`setInfo`/`updateSongBtn`/`updateSyncBtn`/`filesMirrorSoon` (provenance/model/UI, layers 2+4, none yet split). Every "local song: …" regression test (tests/night-roll.test.mjs) passes unchanged because this code is byte-identical in the same file it started in — same precedent as model/edits.js (step 5). **`scheduleBackupFlush`/`flushBackupNow` (the Mac-backup SAFETY pair, also named by this step) likewise did NOT move**: `flushBackupNow` calls `editableSong`/`draftDoc` (model, layer 2), `serializeRollnotes` (model/rollnotes.js, layer 2 — platform, layer 1, can never import it), `aiUrl`/`aiHeaders` (ask/, layer 4), and `logDebug` (ui-adjacent); `scheduleBackupFlush` only exists to debounce into it, so it stays alongside, unchanged. **`idbDraftPut` DID move, 2026-10-04 (docs/split-phase2-plan.md step 2)** — from `ui/sheets.js` (where it was misfiled to in a later step), now importing `logErr` from `../hooks.js` (the port dissolves exactly the blocker this entry names); `saveEdits`/`loadEdits`/`saveDraft`/`draftWrite`/`draftRead`/`localDraftWrite`/`localDraftTracks`/`scheduleBackupFlush`/`flushBackupNow` were out of this step's own move list and stay exactly as this entry describes.
- `platform/folder.js` — the local-folder backend's clean half (step 6, 2026-10-03): `fsRoot`, `folderActive`, `folderOnly`, `folderSupported`, `nativeFs` (the Capacitor Filesystem-plugin FS-handle shim — "native FS", per the plan's own folder.js description), `nativeDirHandle` (the `FileSystemDirectoryHandle`-shaped adapter over it — self-contained apart from WebCrypto/TextEncoder-class globals), `folderPermission`, `fsDirFor`, `folderRead`/`folderWrite`/`folderDelete`, `fsReadJSON`, `restoreFolder` (the one folder-choice function with no UI call in its own body), `readData` (the folder-then-network song/analysis fetch dispatcher — needed `LINK_SONGS` from platform/base.js, `songsURL`/`analysisURL` from platform/storage.js, both same-or-lower layer, so no new blocker), `bundledPath`. **Not moved**: `nativeDirHandle`'s sibling `filesMirror`/`filesMirrorFor`/`filesMirrorSoon` (need `isComposition`/`setInfo`/`notesTxtFor`, model/UI); `folderScanAlbums` (needs `titleCaseSlug` — already model/catalog.js, layer 2 — and `albumTitleFor`, still app.js); `renderFolderUI`/`folderAfterChange`/`chooseFolder`/`forgetFolder` (all need `setInfo` and/or `updateSyncBtn`/`updateSongBtn`, UI layer); the whole settings-sheet/sync/publish/GitHub-readme cluster textually inside the same banner section (`cfgShowPane`, `openSettingsSheet`, `renderSyncPending`, `openSyncSheet`, `writeSongsReadme`, `putRollnotes`, `markPublished`, `writeToken`, `publishAllJobStart`, …) — every one of these is UI-chrome- or sync/publish-layer code (steps 9/14) that happens to share this banner, not folder-backend code; moving any of it now would be exactly the scope creep CLAUDE.md's "no one-time hacks" principle warns against in spirit. All stay in app.js, bare-name reachable, now importing `fsRoot`/`folderActive`/`nativeFs`/`folderRead`/`folderWrite`/`idbFsGet`/`idbFsPut`/`cfg`/`baseJoin`/`repoName`/`repoApi`/`apiError`/`readBase` back from platform/*.
- `platform/native.js` — the two Capacitor-bridge leaves with zero non-global dependencies (step 6, 2026-10-03): `nativeCall` (the generic `Plugins.<name>`/`nativePromise` dispatcher — Filesystem direct, everything else, including Share, through `nativePromise`) and `audioSessionType` (the iPad `navigator.audioSession` "ambient"/"playback" switch — touched with extra care per this step's SAFETY note: moved byte-identical, zero logic change, every caller in app.js's audio engine (`ensureAudio`, `play`, `previewNote`, …) now imports it back unchanged). **`nativeOpenUrl`/`nativeOpenHook` (also named by this step) did NOT move** — `nativeOpenUrl`'s body calls `setInfo`/`stop`/`closeFileMenus`/`openPickedFiles` (UI/audio/import-hub, layers 3-4) to actually hand off an opened file, not just reach the native bridge; `nativeOpenHook` only wraps it. Capacitor's Core MIDI glue (`initWebMidi`/`initCoreMidi`/`midiStatusLine`, docs/split-plan.md's `input/record.js`, step 12) has the same shape — `setInfo`/`midiMessage` calls throughout — and was never a platform/native.js candidate despite living in the same `window.Capacitor` idiom; left alone.
- **`platform/sw.js` was NOT created this step** (it was, in phase 2 step 12 — see its entry at the end of this map). The service-worker-registration code (banner "service worker", originally index.html ~line 23103) is a single top-level `if (...) { ... } else { ... }` statement, not a named declaration — `move.mjs --names` can't select it, and `--range` would also sweep up the adjacent "interrupted job" `try` block and the `boot()` IIFE, neither of which belongs in platform/sw.js. More fundamentally, the registration branch itself calls `setInfo` (the "offline support turned off" message) — UI-chrome, layer 4, not yet split — so even moved alone as an `initSw1()` via `--range`, it would be a straight rule-5 violation for the new module. No subset of it is both "the SW registration" and free of `setInfo`. Queued in open-items.md for whichever later step (14, when `ui/chrome.js` exists) can actually split it; until then it stays in app.js, unchanged, bare `navigator.serviceWorker`/`S.APP_BASE`/`PERF_FLAGS` reachable exactly as before.
- `audio/engine.js` — AudioContext lifecycle's PURE half (step 7, 2026-10-03): `warmContext`, `clockAlive`, `clockProbeText`, `gestureActive`, `openMaster`, master-gain-adjacent `trackGain`/`trackVol`/`trackPan`/`trackAudible`/`updateTrackGains`, oscillator/noise building blocks `dutyWave`/`makeOsc`/`pluckBuffer`/`drumNoise`/`drumNoiseBuf`/`DRUM_LONG_SEC`/`DRUM_SUSTAIN_CAP_SEC`, the drum-audition state `pieceState`/`pieceAudible` (needed by `drumHit`; app.js's gutter-label render and its click handler now import them back), and `drumHit` itself. **`ensureAudio`, `resumeAudio`, `rebuildAudio` did NOT move**, despite being this step's own named targets — all three call `logDebug`/`logErr`/`setInfo` (`ensureAudio`'s `onstatechange`; `resumeAudio`'s dead-clock path; `rebuildAudio`'s own rebuild log), and `logErr`/`logDebug` both resolve to `errChip()`, which touches `document.getElementById`/`askSeenMax()` — UI-chrome, layer 4. Unlike every prior step's "not yet split" blockers, this one is PERMANENT: logging/status reporting will never be a layer-≤3 concern (the exact platform/storage.js precedent set in step 6 — "idbDraftPut is the ONE member... that calls logErr... so it alone stays" — applies here to three functions at once, not one). All three stay bit-for-bit in app.js; the audio-session code they gate (ambient/playback switching, the visibilitychange wake, previewNote's 2s ambient timer) never moved a single character — see docs/split-plan.md "Deviations (7)" for the byte-identity check. **RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 1/2): `ensureAudio`/`resumeAudio`/`rebuildAudio` all DID move**, step 2, once step 1's `logDebug`/`logErr`/`setInfo` upcall ports existed — each now imports all three from `../hooks.js` (layer 0, legal from any layer), not from `ui/chrome.js` directly. The "PERMANENT" framing above was permanent against a DIRECT import, not absolutely — same shape as `render/roll.js`'s own later correction (docs/split-plan.md "Deviations (14)").
- `audio/voices.js` — voice IDENTIFICATION, not voice ORCHESTRATION (step 7, 2026-10-03): `voiceType`, `trackVoice`, the SF-voice tables/lookups (`SF_VOICES`/`sfPick`/`VOICE_GROUPS`/`VOICES`/`VOICE_AMP`/`SF_NOTE_NAMES`/`sfNoteName`/`sfFileFor`/`sfBank`/`sfEnsure`/`sfDecode`/`sfDecodeCtx`), the game/sf2 voice-id parsers (`gameVoiceVault`/`parseGameVoice`/`parseSf2Voice`/`sf2VoiceId`/`gameVoiceId` — none of this step's own moved code calls them, but they're the one genuinely pure, zero-blocker "game voices" content this step's responsibility line names; their callers — `gameVoicesInSong`, `gameVoiceLabel`, `buildGameVoicePicker`, … — all stay in app.js and import them back), and `playSynthVoice` (the default oscillator/sampled-note renderer — pure, no `chip`/UI reference, imports `trackGain`/`makeOsc`/`pluckBuffer` from `./engine.js`, a same-layer import). **`scheduleNote` and `previewNote` — this step's two headline targets — still did NOT move (step 8 update, 2026-10-03).** Step 8 landed `chip`/`chipActive`/`chipHas`/`chipPreviewBuffer`/`chipNoteSlice` in `audio/chip.js`/`audio/chip-stream.js` exactly as queued, which DID clear that original blocker — but surfaced a second, deeper one the queued note hadn't anticipated: `scheduleNote`'s `n._clip` branch calls `scheduleClip` (`audio/clips.js` territory, step 8), which itself stays in app.js (blocked by `stretchEnsure`, which stays blocked by a single `draw()` call at the end of its decode callback — see `audio/clips.js`'s own entry). `previewNote` falls to `scheduleNote` as its non-chip fallback, so it inherits the same block one level removed. `sfPreloadForSong`/`sfWaitForSong`/`autoVoiceLabel`/`gameVoicesInSong`/`sf2VoicesInSong`/`gamePreloadForSong`/`gameWaitForSong`/`resolveVoiceInstrument`/`scheduleGameNote` all stay too, for the same reason as before (`playGateKick`, `setInfo`, or `inst*` import-hub calls, none yet split). Every one of these now imports `voiceType`/`sfFileFor`/`sfBank`/`playSynthVoice`/`chipActive`/`chipHas`/`chipPreviewBuffer`/`chipNoteSlice`/`scheduleClip` back from `audio/voices.js`/`audio/chip.js`/`audio/chip-stream.js` unchanged. This is now understood to be blocked until whichever step moves `draw()` (render, step 11) — see open-items.md's corrected QUEUED entry. **`gameVoiceWarn`/`scheduleGameNote`/`resolveVoiceInstrument`/`gameLibSync`/`sf2Sync`/`gameNoteBucket`/`gameNoteCache`/`gameVoiceWarned` DID move, 2026-10-04 (docs/split-phase2-plan.md step 2)** — `gameVoiceWarn`'s `setInfo` call (the one blocker this entry's "for the same reason as before" lumped it in with) now resolves from `../hooks.js`; `gameVoiceWarned` (the warn-once `Set`, unlisted by any plan table) moved alongside it, the usual "pull the load-bearing helper along" pattern. `scheduleNote`/`previewNote` themselves — still blocked by `scheduleClip`/`stretchEnsure`/`draw()`, none of which this step touched — are unaffected and stay exactly as this entry describes.
- `audio/transport.js` — the thinnest of this step's three files, and for the same reason as `scheduleNote`/`previewNote` above, only worse: `play`, `stop`, the whole play-gate (`playGate`/`playGateKick`/`playGateTick`/`playGateActive`/`playGateWait`), and album orchestration (`albumStart`/`albumPlayIdx`/`albumNext`/`albumPrev`/`albumAdvance`/`albumLeave`/`albumStrip`/`albumClear`/`armAlbumLink`/`albumPos`) are each saturated with `chip.*` state, `clipLen`/clip scheduling (audio/clips.js, step 8), `document.getElementById`/UI-chrome calls, `loadSong`/`S.CATALOG` (model, step 9), and `met.*` (metronome, step 8) — none yet split, all LEGACY_CONTAINER imports a real layer-3 module can't make. What DID move, genuinely pure and zero-blocker: `currentLoop` (the loop-segment calculator `play()` reads), `audioStopSrcs` (the clip-source stopper `stop()` calls), and the album-math leaves `albumNextIdx`/`albumPrevIdx`/`albumEndSec` plus their constants `ALBUM_PASSES`/`ALBUM_CAP_SEC`/`ALBUM_FADE`/`ALBUM_MAX_FAILS` — none of these five functions touch `chip`, clips, UI, or the model layer; every one of their callers (`play`, `stop`, `albumStart`, `armAlbumLink`, `albumEndSec`'s own caller in `play()`'s pump) stays in app.js and imports them back. See docs/split-plan.md "Deviations (7)" for the full per-function accounting — this step moved the AudioContext/oscillator/voice-identification innards cleanly, but found the transport layer (play/stop/scheduling/album) to be the single most app.js-entangled area the split has hit so far.
- **The `?perf=1` self-profiler fix** (docs/split-plan.md §2.4, step 7): `wrap()`'s `globalThis[name]` patching stopped finding anything the moment a profiled function first left the inline script (step 3's `secToTick` was the first casualty, silently) — a module's top-level binding isn't a `globalThis` property. Replaced with `prof(name, fn)`: each of the 26 still-in-app.js profiled functions, plus `secToTick` (midi/parse.js) and `drumHit`/`updateTrackGains` (audio/engine.js, both moved this step), now does `name = prof("name", name);` right after its own declaration, wherever that declaration lives. `prof` (+ its gate and the `S.perfAcct`/`S.perfTotal`/`S.perfRec` accumulators it reads/writes) lives in **`state.js`**, not next to `PERF_FLAGS` in `platform/base.js` — layer 0, so every layer can import it (even `midi/parse.js`, itself layer 0: platform is layer 1, which a layer-0 module may never import). The HUD panel/report/record-button code stays in app.js, now reading `S.perfAcct`/`S.perfTotal`/`S.perfRec` instead of its own closure locals. The second, separate "mark the timeline on an edit" wrapper (`saveEdits`/`selEditApply`/`insertTime`, inside the same guarded block) was NOT fixed — it's a different mechanism (same `globalThis[name]` disease, but doing something `prof()` doesn't: pushing an EDIT marker into the recording's timeline) outside this step's "replace `wrap()` with `prof()`" scope; queued in open-items.md.
- `audio/chip.js` — authentic chip render, memory budget, chip worker (step 8, 2026-10-03): the `chip` state object itself; `chipTrackNo`; `ghHeaders` (unlisted by the plan, but `vaultFetch` needs it and its OTHER callers — `putRollnotes`/`markPublished`/`writeToken`, sync/publish.js, step 9, layer 4 — can legally import it back down, unlike `isCaptureKey` below); `vaultFetch`; `chipAlbumHasSource`; the memory-budget math (`CHIP_BUDGET_APP`/`CHIP_BUDGET_WEB`/`CHIP_RATE_STEPS`/`chipRenderBudget`/`planChipRender`/`chipStaticPan`/`chipDownmixStatic`/`chipSilent`/`chipIsPcm`); `CHIP_STREAMED_RENDER_CHUNK_SEC`/`chipRenderStreamed` (the AUTHENTIC render's own chunked-allocation path — NOT stream-mode playback, see chip-stream.js below); `chipWorkerAvailable`; the preview caches (`chipPreviewPending`/`chipPreviewCache`/`chipPreviewProgAt`) + `chipPreviewBuffer`; and the live-playback surface `chipActive`/`chipHas`/`chipBuffers`/`chipPcmToBuffers`/`chipStopSrcs`/`chipStart`. **`albumMetaCache`/`albumMetaFor` moved OUT to `model/provenance.js` in step 9** (2026-10-03) — the correction `isCaptureKey`/`ownFolderPath` needed (see provenance.js's own entry and docs/split-plan.md "Deviations (9)"); `chipAlbumHasSource` now imports `albumMetaFor` back down from provenance.js, unchanged. **`chipSource` still did NOT move, even after step 9 cleared its named blocker (`isCaptureKey`) — it has a second, independent one step 8 never saw**: `chipSource` → `chipVaultFile` → `chipExt` → `CHIPS[kind]`, the same permanently-blocked table below. `isCaptureKey` itself is now `model/provenance.js`, layer 2, and chip.js (layer 3) could legally import it today; `chipSource` stays in app.js regardless, now blocked by `CHIPS` alone, importing `chipTrackNo`/`vaultFetch`/`idbNsfGet`/`idbNsfPut` back from chip.js/platform/storage.js otherwise unchanged. **`updateChipBtn`/`updateChipBtnInner` and the whole "▶ waits for the song" play-gate cluster (`PLAY_GATE_GRACE`/`PLAY_GATE_MAX`/`gateSettled`/`gateWatched`/`gatePending`/`playGate`/`playGateKick`/`playGateActive`/`playGateTick`/`playGateWait`) did NOT move** — none of these were named by this step's own responsibility line, and each calls `setControl`/`setPlayBtn` (ui/controls.js, layer 4) or `play`/`logErr` (app.js) directly. **The single biggest finding this step made: `CHIPS` (the per-console-kind table — magic-byte sniff, parse/run/render/stream hooks, one entry per nsf/gbs/spc/vgm/psf/psf2/usf) did NOT move, and because of it neither did `chipEstimateTracks`, `chipRender` itself, `chipPublish`, `chipRenderInWorker`, or `chipCleanupAfterFailure`.** `CHIPS.usf.capture`'s own diagnostic line (`if (typeof logErr === "function") logErr(line);`, a Mario-64-scrambling-on-iPad debug aid from 2026-09-27) is the ONLY app.js-layer reference anywhere in the whole table — one `logErr` call, inside one chip kind's capture closure, blocks the entire data structure (and its sibling `sonySeqCapture`/`psfInflater`/`PSX_SOUNDING_ON`) from moving, the same way `idbDraftPut`'s one `logErr` call blocked it alone in step 6 — except here the blocked unit is the table the actual chip RENDER entry point (`chipRender`) can't run without. `CHIPS` is also, by the plan's own line-range table, `import/capture.js` territory (step 9) — splitting the object by hand to move only its render-relevant fields would be exactly the kind of logic/structure change a verbatim move must not make. All five stay bit-for-bit in app.js; `chipEstimateTracks`/`chipRender`/`chipPublish`/`chipRenderInWorker` now import `chipStaticPan`/`chipDownmixStatic`/`chipSilent`/`chipRenderStreamed`/`chipCleanupAfterFailure`'s own helpers back from chip.js where applicable. **Step 9 (2026-10-03) confirms this is still exactly as blocked as step 8 found it** — `import/capture.js` landed (see its own entry) but `CHIPS` didn't move into it, because its blocker (`logErr`, inside `CHIPS.usf.capture`) is unrelated to which layer `CHIPS` targets: ANY module, at any layer, is forbidden from importing `logErr` while it stays in app.js (layer 5). `chipKindOf` (import/capture.js's own un-moved candidate) inherits the same block. See docs/split-plan.md "Deviations (8)" and "Deviations (9)". **RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 1/2): `CHIPS`, `sonySeqCapture`, `psfInflater`, `PSX_SOUNDING_ON`, `chipExt`, `chipEstimateTracks`, `chipCleanupAfterFailure`, `chipSource`, `chipVaultFile`, `chipModules` all DID move** — `CHIPS.usf.capture`'s `logErr` call now resolves from `../hooks.js` (layer 0), and (a separate `check.mjs` fix this step needed) `CHIPS`'s own top-level `const CHIPS = {...}` is an object literal built only from pure-literalish parts (nested closures, never invoked at module-eval time) — `isPureLiteralish` now recurses into object/array literals, the same reasoning it already applied to a bare function/arrow expression. **`chipRender`/`chipRenderInWorker`/`chipPublish` — the actual render entry points — are a NEW, separate permanent blocker this step's own move surfaced, unrelated to `logErr`/`CHIPS`**: all three call `songTitleOf` (`ask/context.js`, layer 4) directly — `chipRender`/`chipRenderInWorker` each for a `logDebug` status line naming the song, `chipPublish` because `chipRender` passes it through — an illegal upward import from `audio/chip.js`'s layer 3, with no port covering `songTitleOf` yet. All three stay in app.js, now importing `CHIPS`/`chipSource`/`chipEstimateTracks`/`chipVaultFile`/`chipCleanupAfterFailure`/etc. back from `audio/chip.js` unchanged. Flagged in open-items.md, not silently retried. **RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 3/4): `chipRender`/`chipRenderInWorker`/`chipPublish` all DID move.** Step 3 ported `songTitleOf` (`hooks.js`, body stays in `ask/context.js`); `blockers.mjs` then reported this trio clean (their only blocker was the `songTitleOf` import, now legal from any layer), and step 4 moved all three by name, verbatim. `chipRender`/`chipRenderInWorker` now import `songTitleOf` from `../hooks.js` for their `logDebug` status line; `chipPublish` needed no direct import of it (it only receives `chipRender`'s debug string).
- `audio/chip-stream.js` — chip stream mode (step 8, 2026-10-03, docs/streamed-render-plan.md step 3/5): the on/off/auto switch (`chipStreamMode`), the "auto" heuristic (`chipAutoShouldStream`/`chipAutoReason`), every stream-session constant (`CHIP_STREAM_CHUNK_SEC`/`CHIP_STREAM_OVERLAP`/`CHIP_STREAM_HORIZON_VISIBLE`/`CHIP_STREAM_HORIZON_HIDDEN`/`CHIP_STREAM_PIN_LOOKAHEAD`/`CHIP_SEG_HORIZON_SEC`/`CHIP_SEG_MAX_SEGMENTS`), the pure tape-time segment math `chipSegments`/`chipStreamIdxForTapeSec`, the worker-reply handlers `chipStreamOnChunk`/`chipStreamOnSilent`, the cache/pin/evict bookkeeping `chipStreamRequestRange`/`chipStreamWaitFor`/`chipStreamPinLoopStart`/`chipStreamEvict`/`chipStreamScheduled`/`chipStreamScheduleChunk`, `chipNoteSlice` (previewNote's register-chip slice-from-the-render fallback), and the per-tick pump `chipStreamPump`/`chipStreamStart`. `chipStreamPump` needed `playSec` (previously bare in app.js, a pure `S`-only function nobody had moved yet) to come down into `audio/transport.js` first — an unlisted, zero-risk leaf move alongside this step, not named by any step's table, done because `chipStreamPump` could not otherwise resolve it. **`chipStreamOpenWorker`, `chipStreamOpen`, and `chipRenderAuto` did NOT move** — both of the first two read `CHIPS[kind]` directly (the same `CHIPS` blocker as chip.js, above); `chipRenderAuto` calls `chipStreamOpen` (blocked) and `chipRender` (blocked, chip.js), so it inherits both. All three stay in app.js, importing `chipStreamMode`/`chipSegments`/etc. back from chip-stream.js. **RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 1/2): `chipStreamOpenWorker` DID move** — its own `CHIPS[kind]` reference now resolves from `./chip.js` (moved there the same step). **`chipStreamOpen` did NOT move, for a NEW reason, not the old `CHIPS` one**: it calls `songTitleOf` directly for a `logDebug` status line (the same new blocker `audio/chip.js`'s `chipRender`/`chipRenderInWorker` hit — see that entry). `chipRenderAuto` (calls both `chipStreamOpen` and `chipRender`, both blocked) stays too. All three now import `chipStreamOpenWorker` back from chip-stream.js. **RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 3/4): `chipStreamOpen`/`chipRenderAuto` both DID move**, the same `songTitleOf` port (step 3) clearing their last blocker; `chipRenderAuto` now calls `chipRender` as a same-layer import from `./chip.js` (moved there the same step) instead of an app.js bare reference.
- `audio/clips.js` — audio tracks (clips) + the WSOLA pitch-preserving slowdown ALGORITHM (step 8, 2026-10-03): the file/peak cache (`audioBufCache`/`PEAK_BUCKET`/`audioDirFor`/`audioCacheKey`/`songHasAudio`), the pure clip-geometry leaves (`clipLen`/`clipEndTick`/`clipClamp`/`forEachClip`), the decode path (`audioBytesFor`/`decodeAudioBytes`/`peaksOf`), the tempo-from-a-take math (`clipOnsetSec`/`tempoFromPeaks`/`onsetCurve`/`beatTrack`/`clipBeatMap`/`clipTempo`), `audioReady`, and the WSOLA machinery itself (`wsolaStretch` — still `SERIALIZED`, rule 7 unaffected by which module defines it — `stretchJobs`/`stretchInWorker`/`stretchCache`/`keepPitch`/`stretchKey`/`stretchPending`). **The functions that actually APPLY a clip or a stretched buffer to the live song — `applyAudioDirs`, `audioEnsureFile`, `applyBeatMap`, `setSongTempo`, `stretchEnsure`, `stretchEnsureAll`, `scheduleClip`, `audioChaseNow` — did NOT move.** Each reaches `draw`/`setInfo`/`computeSongEnd`/`finalizeNotes`/`buildSchedule`/`isComposition`/`isLocalDraft`/`stop`/`play`/`playGateKick` (render/model/UI/transport, none yet split) — `stretchEnsure`'s own blocker is just `draw()` at the end of its decode callback, but that one call is enough, the same single-`logErr`-call shape step 6/8 both found elsewhere. This has a real knock-on effect noted under `audio/voices.js` below: `scheduleNote`'s `n._clip` branch calls `scheduleClip`, so `scheduleNote` stays blocked by THIS, not (only) by `chip`. All eight stay bit-for-bit in app.js, importing `clipLen`/`forEachClip`/`keepPitch`/`stretchCache`/`stretchKey`/`audioBufCache`/`audioCacheKey`/`clipOnsetSec` back from clips.js.
- `audio/metronome.js` — `met*` (step 8, 2026-10-03): the `met` state object + its persistence (`metSave`), `metDefaultAccents`, `metBuildCells`, the click synth `metClick`, follow/trial-mode math (`metFollowBeatTicks`/`metFollowNum`/`metPumpFollow` — `metPumpFollow` needed `playSec`, see chip-stream.js above), the free-run pump `metPump`, `ensureMetGain`, `metHalt`, and `applyMetMode`. **`metStart` did NOT move** — it calls `ensureAudio()`/`resumeAudio()` directly, and those two (see `audio/engine.js`'s own entry, step 7) are permanently blocked by their own `logErr`/`logDebug`/`setInfo` calls; no other function in this file touches them. The initial `#metnum`-populating IIFE and all 13 `addEventListener` wiring statements (`#metbtn`/`#metcfg`/`#metclose`/`#metgo`/`#metbpm`/`#metnum`/`#metden`/`#metsub`/`#metfollow`/`#metnudgeL`/`#metnudgeR`/`#metcountin`/`#mettap`) also stay in app.js, unmoved — two of them (`#metbtn`, `#metgo`) call the still-blocked `metStart`, and rather than split otherwise-identical UI wiring across two files by which handler happens to be movable, all of it stays together as one block, now calling `metHalt`/`metSave`/`metBuildCells`/`applyMetMode`/`metDefaultAccents` back from metronome.js. **RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 1/2): `metStart` DID move** — `ensureAudio`/`resumeAudio` (moved to `audio/engine.js` the same step) are now a plain same-layer import. The 13 `addEventListener` statements and the `#metnum` IIFE stay in app.js regardless (§2.2's `init<Module><N>()` wrapping wasn't attempted this step — not this step's own move list), now calling `metStart` back from metronome.js too.
- `audio/bounce.js` — Download audio: wav encode, offline render (step 8, 2026-10-03): `wavEncode`, `audioBufferToWav`, and `deliverAudioFile` (the native-share/browser-download dispatcher) — plus `midiBase64` (unlisted by the plan; it's a general chunked-base64 helper, not MIDI-specific per its own comment, but `deliverAudioFile` needed it and its OTHER callers, scattered across MIDI/SF2/audio-clip code still in app.js, can import it back down from audio/, same safe direction as `ghHeaders` above). **`offlineWaitForAssets`, `renderSongOffline`, and `recordRealtimeAudio` — the actual offline-bounce and real-time-fallback entry points — did NOT move**: `offlineWaitForAssets` calls `audioEnsureFile`/`stretchEnsureAll` (clips.js's own blocked pair, above); `renderSongOffline` calls `stop()` and `scheduleNote()` (both still blocked, audio/transport.js step 7 + audio/voices.js above); `recordRealtimeAudio` calls `setInfo`/`stop`/`play` directly. All three stay in app.js, along with the `#filedlaudio` click handler (which also calls `closeFileMenus`/`albumClear`/`logDebug`/`logErr`, all still UI/transport-layer) — it now imports `audioBufferToWav`/`deliverAudioFile` back from audio/bounce.js.
- **Phase 2 step 4c (2026-10-04) finishes the three audio entries above** — every "did NOT move / still blocked" clause in `audio/transport.js`'s, `audio/voices.js`'s and `audio/clips.js`'s step-7/8 entries is stale now. `audio/transport.js` holds the transport proper: `play`, `stop`, the play gate (`playGate`/`playGateKick`/`playGateTick`/`playGateActive`/`playGateWait`, `gatePending`, `PLAY_GATE_GRACE`/`PLAY_GATE_MAX`), `albumStrip`, `buildSchedule`, `playSec`, `currentLoop`. `audio/voices.js` holds voice ORCHESTRATION too: `scheduleNote`/`previewNote`, the sampled/game/SF2 preload+wait (`sfPreloadForSong`/`sfWaitForSong`/`gamePreloadForSong`/`gameWaitForSong`/`gamePreloadTokens`), `gameVoicesInSong`/`sf2VoicesInSong`, `resolveGameVault`, and the instrument-library layer (`instLibrary`/`instSamples`/`instAlbums`/`INST_CHIPS`/`instFolder`/`instPlayer`/`instPlayerReady`/`instDecodeWav`/`sf2Font`/`sf2Bytes`/`sf2Module`). `audio/clips.js` holds the clip APPLY side: `scheduleClip`, `stretchEnsure`/`stretchEnsureAll`, `audioChaseNow`, `applyAudioDirs`, `audioEnsureFile`, `applyBeatMap`, `setSongTempo`. `audio/bounce.js` gained `renderSongOffline`/`offlineWaitForAssets` (the offline bounce — docs/split-plan.md §1's row, not the phase-2 table's transport guess). `model/catalog.js` gained `romanValue`/`titleSortKey`/`titleCompare` (album-title order, Roman numerals as numbers). The three audio files import each other (a layer-3 cycle, legal); what made it movable was steps 1/3/4b's ports — every upcall `play()`/`stop()` make (`setInfo`, `logDebug`/`logErr`, `updateChipBtn`, `srAnnounce`, `songTitleOf`, `albumAdvance`, `updateSubtitle`, `playbackFrame`, `draw`, `recFinish`) is a `hooks.js` forwarder. All verbatim; see docs/split-phase2-plan.md "Step 4c".
- **Phase 2 step 5 (2026-10-04) — the model/gen rows are real now; the stale "did NOT move" clauses in `model/edits.js`, `model/selection.js`, `gen/drummer.js`, `gen/bassist.js`, `gen/analysis.js`, `model/versions.js` above are retired.** `model/edits.js`: `saveEdits`/`loadEdits`/`foldOldOverlay` (the 2026-10-02 SAFETY slice, verbatim) + `undoTrackAdd`. `model/selection.js`: `selEditApply` and every mutator — nudge/resize/quantize/split/join, copy/cut/paste(+annotations), insert/delete time (`closeGap`/`openGapShift`), `ridealongChordBands`/`transposeTrack`, `splitApply`/`deleteSelection`/`duplicateSelection(InPlace)`/`divideSelection`/`diatonicShift`/`removeDuplicateNotes`/`sweepStrandedClones`/`clearMultiSel` (left in app.js: `selectAllNotes`, the undo log's apply side). `model/versions.js`: the whole draft save/read path — `saveDraft`, `draftWrite`/`localDraftWrite`, `draftRead`/`localDraftTracks`, `retireOldOverlay`, `filesMirror`/`filesMirrorSoon`/`filesMirrorFor` (step 14 had parked these in ui/chrome.js and ui/sheets.js; `flushBackupNow` stays in ui/chrome.js). `model/rollnotes.js`: `isDirective`/`isCopyableAnno` (from render/roll.js), `setEndBQ`/`dropSupersededBy`/`dropLocalKeyAt`, and the `.notes.txt` dump `notesTxtFor` + `declaredTsForKey` (from sync/publish.js). `model/grid.js`: `snapBeat`. `theory/chords.js`: `transposeChordLabel`. `gen/analysis.js`: `scheduleAnalysisRecompute` + `adoptChordBand`/`adoptAllChords`/`adoptKeyRegion`. `gen/drummer.js`: `drGenerate`. `gen/bassist.js`: `bsGenerate`/`applyTake`. `audio/clips.js`: `moveClip`/`trimClip`/`splitSelectedClipAtCursor`. Four new `hooks.js` ports made this legal: `updateSongMeta` (bpm label; impl still in app.js), `lassoedAnnos` (ui/note-editor.js), `drumStep` and `annoInLasso` (render/roll.js) — the lasso's pixel geometry and the kit-lane row walk are the two things model code asks the view for. See docs/split-phase2-plan.md "Step 5".
- `session/song.js` — song-lifecycle orchestration, layer 4 (phase 2 step 6, 2026-10-04): `finalizeNotesImpl` (the annotation resolver — bakes tempo/meter via model/rollnotes.js's `bakeTempos`/`bakeMeter`, re-applies track:/audio: directives, preloads voices, redraws the chip bar; `finalizeNotes` the port stays in hooks.js), `loadNotes`, `loadSong`/`loadSongInner`/`setSong`, `openDraft`/`openDraftDoc`, `fitViewImpl`, `updateSongMetaImpl`, `rememberRecentSong`, `reflectSongURL`. Being layer 4 it imports same-layer bodies directly (`setInfoImpl as setInfo` from ui/chrome.js etc.) rather than through ports — check.mjs rule 10 insists.
- `session/album.js` — the album run sequencer (step 6): `albumStart`/`albumPlayIdx`/`albumNext`/`albumPrev`/`albumAdvanceImpl`/`albumLeave`/`albumClear`/`armAlbumLink`/`albumPos` — the part of "Album play" (below) that loads songs; the pure pass math and `albumStrip` stay in audio/transport.js.
- `session/files.js` — Save As / fork / rename (step 6): `saveSongAs`, `openSaveForm` + its folder picker (`fillFolderSelect`/`folderChoices`/`localFolders`), `saveVersion`, `forkCurrentSong`, `renameLocalKeys`. **`revertSongToRepo`/`moveComposition` did NOT move** — held by the sync/publish web (publishSong, updateManifest, markPublished, …), phase 2 step 8. Also this step: `annotationsFor`/`subtractTombstones`/`mergeLocalAdditions`/`resolveNoteWith`/`bakeTempos`/`bakeMeter` → model/rollnotes.js; `draftFingerprint` → model/versions.js; `cmpBar` → ui/chrome.js; `syncDurSeg` → ui/note-editor.js.
- `audio/transport.js` gained `playSec` this step (unlisted — see chip-stream.js/metronome.js above, both needed it to resolve). Its own step-7 entry's "none yet split" list for `play`/`stop`/the play-gate/album orchestration is now PARTIALLY stale: `chip.*`/`clipLen`/`met.*` are real exports now (chip.js/clips.js/metronome.js, this step), so that specific blocker clause has cleared — but `play`/`stop`/`playGate*`/the album functions remain in app.js regardless, now blocked by `document.getElementById`/`setControl`/`setPlayBtn`/`setInfo`/`loadSong`/`S.CATALOG` (ui/chrome.js step 14, model step 9) instead. No function moved from this cluster this step; see open-items.md's corrected QUEUED entry.
- `model/song.js` — `editableSong` (the one editability test every "is this mine to edit" check now calls, P1 docs/provenance-plan.md), plus `estimateKey`/`checkKeyVsFile` (+ `keyEstimateSig`/`tonicPcFromName`/`KS_MAJOR_PROFILE`/`KS_MINOR_PROFILE`) — the Krumhansl-Schmuckler key estimate and the declared-key-vs-file check, relocated here in step 9 (2026-10-03) after steps 4-5 found they can never reach `theory/key.js` (layer 0 can't import `trackIsDrums`/`barTicks`, genuinely layer 2). **`loadSong`/`loadSongInner`/`setSong`/`computeSongEnd` — this file's whole namesake content — did NOT move**: the first three are saturated with `play`/`stop`/`setInfo`/`fitView`/`renderTrackbar`/`buildScoreModel`/`draw`/ask-panel calls (audio/render/ui/ask, none yet split); `computeSongEnd` alone is blocked by `clipEndTick` (`audio/clips.js`, layer 3 — permanent, clip geometry is genuinely audio-layer). All four stay in app.js bare-name reachable. See docs/split-plan.md "Deviations (9)". **Step 10 (2026-10-03) added `keyNameAt`/`sfDeclaredAt`/`sfDeclaredAtRaw`/`sfShownAt`/`sfAt`** (unlisted by any step's table): "what key/scale-factor does the user's declared annotation say governs this tick, else the Normal estimate" — the same family as `estimateKey`/`checkKeyVsFile` already here, reading `S.keyRegions`/`S.previewSf` directly plus `appMode()` (new import, platform/mode.js, layer 1) and `estimateKey()` (same file). All five were genuinely blocker-free (pure, or blocked only by things this file already has); `gen/bassist.js`'s `bsInferTimeline`/`bsChordTimeline` and `gen/analysis.js`'s `computeAnalysisLayer` needed them. `sfShownAt` was explicitly flagged as destined for `platform/mode.js` back in step 4's Deviations, written when `estimateKey` itself was still unmovable; once step 9 landed `estimateKey` here, `model/song.js` — not `platform/mode.js` — became the only layer-≤2 home that doesn't need an upward import. See docs/split-plan.md "Deviations (10)".
- `model/selection.js` — `selEditItems`, `clipboardHas`, `clipSummary`: the three selection-adjacent reads with no call into unsplit code (step 9, 2026-10-03). **Every actual mutator — `selEditApply`, `nudgeSelection`, `resizeSelection`, quantize/split/join, copy/paste — did NOT move**: all of them bottom out in `selEditApply`, which calls `saveEdits()` (model/edits.js's own SAFETY-blocked function, step 5), `computeSongEnd()` (blocked, above) and `draw()`/`buildScoreModel()` (render, step 11). The plan's own named targets for this file stay in app.js almost entirely.
- `model/provenance.js` — the P1 "one origin per song, one rule table" machinery (docs/provenance-plan.md), step 9 (2026-10-03): `isCaptureKey`, `ownFolderPath`, `isComposition`, `isCompositionKey` (unlisted — `publishSong`'s own predicate for a non-open key, `isComposition`'s blocker-free twin), `bakesTempo`/`bakesMeter`, `hasProvenanceNote`, `originOf`/`originFor`/`pendingOrigin(Key)`/`setOrigin`, `RULES`/`rulesFor`, `canEditMusic`, `NR_DIR`/`COMP_DIR`/`PROVENANCE_RE`/`READONLY_DIRS`/`COMP_ALBUMS`/`RESERVED_FOLDERS`, `albumTitleFor`, `slugify`, `untitledKey`, `isUnsaved`, `folderFromInput`, `chosenFolder` — plus `albumMetaCache`/`albumMetaFor` (relocated HERE from `audio/chip.js`, not from app.js — step 8 had put them in chip.js because chip.js's own callers needed them there, flagging the exact risk this step hit: `ownFolderPath` could never import them at layer 3). This one relocation cleared three separate permanent-looking blocks at once — see `model/catalog.js` and `audio/chip.js`'s own entries. **`saveSongAs`/`renameLocalKeys`/`openSaveForm` did NOT move** (each reaches `finalizeNotes`/`draw`/`setInfo`/`updateSongBtn`, none yet split) despite `saveSongAs` being the plan's own named target for this file. See docs/split-plan.md "Deviations (9)".
- `model/album-order.js` — `setAlbumOrderPref`, `slugOfPath`, `albumTrackMap`, `albumHasTrackData`, `albumOrder`, `albumEffectiveOrder`, `albumOrderControl` (step 9, 2026-10-03): the Game order/A–Z switch, entirely clean — this step's one file whose real content matches the plan's table exactly, nothing left behind.
- `model/versions.js` — the localStorage version store (Model B), step 9 (2026-10-03): `autosaveOn`, `versionsStoreKey`, `readVersionsRaw`/`writeVersionsRaw`, `migrateVersions`/`readVersions`/`pushVersion`, `songDirtyFlag`/`songUnsaved`, `draftTracks`/`musicSig`/`draftDoc` (the draft fingerprint), `draftKeys`. **`saveVersion`/`saveDraft`/`draftRead`/`draftWrite`/`draftFingerprint`/`pubCompareDraft`/`fingerprintOldDrafts`/`markPublished` all stay in app.js** — `saveVersion` needs `openSaveForm`/`setInfo`/`filesMirror`; `saveDraft` needs `retireOldOverlay`/`logErr`/`setInfo`/`updateSongBtn`/`updateSyncBtn`/`filesMirrorSoon` (its `isComposition`/`editableSong` blockers cleared this step, but it stays — see open-items.md's SAFETY re-check). None yet split.
- `model/jobs.js` — the jobs store's and the debug log's PURE halves, step 9 (2026-10-03): `JOB_KINDS`/`jobListeners`/`jobControls`/`jobsSave`/`jobsOnChange`/`jobProgress`/`jobFraction`/`JOBS_AUTOCLEAR_MS`/`jobBarSet`/`jobsList`/`jobsFind`, and `appErrors`/`appDebug`/`debugLogOn`/`logPush`/`logLines`/`logLine`/`BENIGN_ERRORS`. **`jobsNotify` did NOT move — PERMANENTLY, not "not yet split"**: its body calls `updateJobsBtn()` (UI-chrome, `document.getElementById`/`setControl`), and status/footer reporting is structurally a UI concern in this app's layer table forever, the same shape step 7 found for `ensureAudio`'s logging calls. Every mutator that calls `jobsNotify` — `jobsLoad`/`jobStart`/`jobApi`/`jobCancel`/`jobsDismiss`/`jobsClearFinished`/`jobsAutoClear` — inherits the block transitively even though none of them individually touches UI. `logErr`/`logDebug`/`errChip` stay too (both resolve to `errChip()`, blocked by `askSeenMax`, ask/, step 13). **RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 1/2): `jobsNotify` DID move** — from `ui/sheets.js` (where it was misfiled to in a later step, not from app.js directly), now importing `updateJobsBtn` from `../hooks.js`. `jobsLoad`/`jobStart`/`jobApi`/`jobCancel`/`jobsDismiss`/`jobsClearFinished`/`jobsAutoClear`/`logErr`/`logDebug`/`errChip` were out of this step's own move list and stay exactly as this entry describes.
- `import/hub.js` — `importHubLabel` only (step 9, 2026-10-03): the Import hub's one pure leaf. `openPickedFiles` (the hub's real dispatcher) stays in app.js, blocked by `CHIPS`/`setInfo`/`createComposition`/`importAudioFiles`/`openChipImport`/`importSf2File`, none yet split; every `addEventListener`/drag-drop wiring statement for the panel stays too (non-declaration top-level code, and none of it pure regardless).
- `import/capture.js` — format identification and pure key/label helpers, step 9 (2026-10-03): `impDirFor`, `importDraftKeys`, `impTrackKey`, `streamedAudioMagic`/`audioMagic`/`sf2Magic` (byte-magic sniffing, each touching only its own byte array), `impDisplayTitle`, `impTrackLabel`. **`chipKindOf`/`impCapture`/`captureJobStart`/`renameImportDraft` all stay in app.js** — `chipKindOf` needs `CHIPS` (permanently blocked, see `audio/chip.js`'s entry); the others reach `draftWrite`/`jobStart`/`updateSongBtn`/`updateChipBtn`, none yet split.
- `sync/publish.js` — every GitHub-Contents-API / local-folder write primitive, the share-link builder, and the README/manifest-text generators, step 9 (2026-10-03): `putMidAt`, `deleteRepoFile`, `audioDirFiles`, `declaredTsForKey`, `notesTxtFor`, `putSongsText`, `uploadAudioClips`/`uploadAudioClipsFor`, `putRollnotes`, `recordLastSync`, `writeToken`/`connected`/`takeToken`, `shareLinkFor`, `songsReadmeBlock`/`spliceReadme`/`writeSongsReadme`, `APP_REPO`/`PUBLIC_BASE`/`publicBase`/`README_OPEN`/`README_CLOSE` — all pure functions of their own arguments plus `S`/platform/*/`midi/write.js`/`audio/clips.js`/`audio/bounce.js` (all ≤ layer 4 here). **`publishSong` — this file's own namesake — did NOT move**, nor did `markPublished`/`markCurrentSongSynced`/`publishOpenComposition`: `publishSong` reaches `saveDraft`/`draftRead`/`askCommitLog`/`filesMirror`/`filesMirrorFor`, none yet split; `markPublished` is blocked by `draw`/`updateSubtitle`/`saveDraft`/`draftWrite`. `updateManifest`/`manifestPlace` were checked for this file too and left in app.js — pure, but not required by anything that moved, so left rather than guessed at (docs/split-plan.md "Deviations (9)").
- `gen/drummer.js` — the Drummer's pure skeleton/fill math, step 10 (2026-10-03): `drumRng` (per-bar substream PRNG), `DR_TOMS`/`DR_FILLS`/`DR_SMALL_FILLS`/`DR_MEDIUM_FILLS` (the fill vocabulary; `drFillStep` its 16th), `drPickFill` (weighted / even pick, no repeat), `fnv1a32` (section-label hash), `drDeepestSection`/`drSectionPos` (the bar's section + 1-based offset in it: phrase fills, groove cycle), `sectionLane` (same-label-same-substream, shared with the Bassist), `drBoundaries`, `drNormParts`, `drBassTrack`, `drBackbeats`, `fmtBarBeat` (unlisted — a bar.beat formatter used by both generators' status strings, pure `barTicks`/`beatTicks` math). **`drGenerate` and `drKitCountT` — this file's own namesake content — did NOT move**: `drGenerate` calls `setInfo`/`renderTrackbar`/`saveDraft` (UI, not yet split), `saveEdits` (model/edits.js's SAFETY-blocked function, step 5), `computeSongEnd`/`buildScoreModel`/`draw` (model/render, permanently or not-yet blocked — see `model/song.js`'s own entry); `drKitCountT` calls `drPartsGet()` (a UI sheet reader, `ui/sheets.js`, step 14) directly. Both stay in app.js, bare-name reachable, now importing every helper above back from `gen/drummer.js`.
- `gen/bassist.js` — the Bassist's pure harmony-reading math, step 10 (2026-10-03): `bsChordTone` (chord-symbol → {rootPc, bassPc, tones}), `bsInferTimeline` (the internal, never-displayed harmonic sketch inferred from a melody track — duration+metric-weighted PC census against diatonic/harmonic-minor candidates), `bsChordTimeline` (declared chord bands → a lookahead-aware timeline, including the "N.C." key-root-pedal device), `chordAt`/`nextChange` (timeline lookups). Needed `keyNameAt`/`sfDeclaredAt` (relocated to `model/song.js` this step, see its entry) and `tonicPcOfName`/`modeOfName` (relocated to `theory/key.js` this step) — both were the ONLY things blocking `bsInferTimeline`/`bsChordTimeline`, and neither had a blocker of its own, so relocating them (not leaving the named target stuck) was the right call per steps 4/5/9's own precedent. **`bsGenerate` and `applyTake` — the plan's other named target for this file — did NOT move**: `bsGenerate` calls `setInfo` (multiple sites) directly; `applyTake` (the generators' shared replace-in-range apply) calls `saveEdits`/`computeSongEnd`/`buildScoreModel`/`draw`, the same cluster blocking `drGenerate`. Both stay in app.js, importing `bsChordTone`/`bsInferTimeline`/`bsChordTimeline`/`chordAt`/`nextChange`/`drumRng`/`sectionLane` back from `gen/bassist.js`/`gen/drummer.js`.
- `gen/analysis.js` — the Analyze layer's pure compute, step 10 (2026-10-03): `harmonyTrackIndices` (non-drum, non-audio tracks — chord evidence only, never the kit; textually sits in the Bassist's banner but has exactly one caller, `computeAnalysisLayer`, so it belongs here) and `computeAnalysisLayer` itself (builds `S.analysisBands` from either declared chord bands via `bsInferTimeline`'s harmonic sketch, or `estimateKey()` for the whole-song key region — Normal mode only, gated by `analysisAvailable()` at its own top, the same "Learning never reaches this line" construction `estimateKey` already relies on). **`scheduleAnalysisRecompute`, `drawAnalysisLayer`, `adoptChordBand`/`adoptAllChords`/`adoptKeyRegion`, and `openAnalyzeSheet` — the rest of "compute and adopt" — did NOT move.** `scheduleAnalysisRecompute` (the debounced note-edit hook) calls `finalizeNotes()` (model/rollnotes.js's own still-blocked headline, step 5) and `draw()` (render, step 11) — open-items.md's step-9-era note assumed landing this file would let `model/edits.js`'s `saveEdits` import `scheduleAnalysisRecompute`; it can't yet, corrected below. `drawAnalysisLayer` is canvas-context drawing (`ctx`/`css()`/`BASE_RULER_H`), genuinely `render/roll.js` territory (step 11), not compute, despite sharing the banner. The three `adopt*` functions and `openAnalyzeSheet` are each saturated with `setInfo`/`finalizeNotes`/`buildScoreModel`/`updateSubtitle`/`draw`/DOM-sheet code. All five stay in app.js, importing `computeAnalysisLayer`/`harmonyTrackIndices` back from `gen/analysis.js` at their two call sites (the toggle handler and the debounce). See docs/split-plan.md "Deviations (10)".
- `render/roll.js` — the roll/tracks-view hub's PURE half, step 11 (2026-10-04): `canvas`/`ctx`/`wrap` (the roll's own DOM/2d-context lookups), `css`/`cssCache`, `pxPerTick`, the kit-lane row-math family (`DRUM_LABELS`/`DRUM_SLOTS`/`kitSlots`/`songHasDrums`/`topRow`/`computeLaneTop`/`kitLaneTop`/`laneBotRow`/`botRow`/`inKitLane`/`noteRow`/`drumStep`), the farthest-point auto-track-color algorithm (`AUTO_COLOR_S`/`AUTO_COLOR_L`/`hslToHex`/`hueOf`/`hueDist`/`relLuminance`/`contrastRatio`/`ROLL_SURFACE_COLORS`/`TRACK_COLOR_CANDIDATES`/`pickFarthestColor`/`TRACK_COLORS`/`autoTrackColors`/`trackColor`), the ruler/strip geometry constants (`RULER_W_ROLL`/`TRACKS_GUTTER`/`BASE_RULER_H`/`LANE_H`/`AUDIO_STRIP_H`/`STRIP_H`), `trackShown`, `drawRangeTints`, the view/range-selection persistence (`viewKey`/`viewPersistSoon`/`viewRestore`, `rangeSelKey`/`rangeSelPersist`/`rangeSelRestore`), `showAddedOutline`/`setAddedOutline`, `drawLasso`, `drawRuler`, the playhead-strip family (`stripPlayheadX`/`drawStripPlayhead`/`drawPlayheadStripBand`), `isDirective`/`isCopyableAnno`/`annoInLasso` (unlisted — the lasso-vs-annotation predicates `drawRuler` needs, with no lower-layer caller yet to argue for a different home), `activeNoteAt`/`curTick`/`sectionPathAt`, `drawAnalysisLayer` (deferred here by step 10's own Deviations), and `fallActive` (placed here rather than `render/instrument.js` so instrument.js could import it downward with no cycle). **`resize`, `draw`, `drawFull`, `playbackFrame`, and `updateCanvasA11y` — the plan's own named headlines for this file — did NOT move, and this is now understood to be PERMANENT, not "not yet split."** `resize`/`drawFull` each call `updateTrackMore`/`updateEditButtons` (guarded by `typeof x === "function"`) — `ui/trackbar.js`/`ui/note-editor.js` content, step 14, layer 4, strictly ABOVE render's own layer 3; once step 14 lands those files the import is still upward, forever, the identical shape step 7 found for `ensureAudio`'s `logErr`/`logDebug`. `draw`/`playbackFrame` call `drawFull` directly and inherit the block. `updateCanvasA11y` has its OWN permanent blocker one level down: `songTitleOf` calls `impDisplayTitle` (`import/capture.js`, layer 4). All five stay bit-for-bit in app.js, now importing everything above back from `render/roll.js`. See docs/split-plan.md "Deviations (11)".
- `render/tracks.js` — the Tracks view's own geometry and draw, step 11 (2026-10-04): `tracksLaneH`, `laneGeom`, `trackLaneAt`, `tracksNoteY`, `selClipIs`/`selClipObj`, `clipSpanX`, `clipStatusText`, `clipLabel`, `fmtSec`, `drawAudioStrip`, `drawClipLane`, `drawTracks` — all genuinely clean, matching the plan's "Tracks view" line exactly (the clip-mutation side — `writeClips`/`setClipDir`/`moveClip`/`trimClip`/`splitClipAt`/`deleteClip`, and the hit-test `hitTracksClip`/`hitTracksNote` — stays in app.js, model/edits+input territory, steps 5/12).
- `render/score.js` — `buildScoreModel`/`drawScore` plus their own supporting cast, step 11 (2026-10-04): `VF` + the stave-geometry constants, the drum-chart role table (`DRUM_SCORE`/`drumScoreRole`), `vexKey`, `durationPieces`, `buildScoreModel`, `scoreContentH`, `renderMeasure`, `renderIntro`, `scoreTickToX`/`scoreXToTick` (the engraved-notehead ↔ tick map every playhead/band x-coordinate in score view asks), `drawScore`, `scoreMeasureAnchors`, `drawScorePencilGuides`. **Note entry/erase/tap — `scorePencil`/`scoreErase`/`scoreTap`/`scoreStaveAt`/`scorePencilTick` — did NOT move**: each reaches `saveEdits`/`draw`/`renderTrackbar`/`setInfo`, none yet split (model/edits.js's SAFETY block, step 5; render's own hub, above; ui, step 14).
- `render/instrument.js` — piano, fretboard, fall, step 11 (2026-10-04): `instWrap`/`instCanvas`/`ictx`, the geometry constants (`WHITE_PCS`/`GTR_TUNING`/`GTR_NAMES`/`GTR_FRETS`/`DEGREE_LABEL`), `degreeOf`, `instRange`, `instLitPitches`, `drawInst`, `pianoGeom`, `instLitColor`, `drawPiano`, `guitarGeom`, `drawGuitar`, `gtrFold`, `FALL_WINDOW`, `drawFall`, `instResize`. **Hit-test/recording — `pianoHit`/`guitarHit`/`instTap`/`instPlay`/`recNoteOn`/`recNoteOff`/`recFinish`/the Web MIDI glue — did NOT move**, input/record territory, step 12; all import `pianoGeom`/`guitarGeom`/`gtrFold` back down. `keyNameShownAt` (app.js, `sfShownAt`'s still-unmoved sibling since step 4) was checked and left alone — no render function needs it (`drawPiano`/`drawGuitar` call `keyNameAt`/`sfDeclaredAt` directly), only `instTap` does.
- `render/cof.js` — circle-of-fifths drawing, step 11 (2026-10-04): `cofCanvas`/`cofCtx`, `cofMinor`/`cofDim`/`cofSigLabel`/`cofMajorName`, `wrapSf`, `drawCof`. The wheel's own drag interaction (`cofAngle`/`cofRelease`, the pointerdown/move/up wiring) stays in app.js — gesture territory, step 12. **Step 12 (2026-10-04) confirms the call is right but not for the reason expected: `cofRelease` itself is blocker-free (only `wrapSf`/`drawCof`, this file, plus `S`), but its four top-level `cofCanvas.addEventListener(...)` listeners need §2.2's `init<Module><N>()` wrapping to move, and `verbatim.mjs` has no tolerance for that mechanism's own structural lines — a real tooling gap, not a logic one; see docs/split-plan.md "Deviations (12)" and open-items.md.**
- `render/score-print.js` — Export score (DAW F6, 2026-10-04): `PAPER`/`PRINT_*` (page geometry in CSS px), `paginateScore` + `scorePageLayout` (pure: measures → whole-measure systems → pages), `engraveScorePages` (VexFlow's SVG backend into an off-screen host, one `<svg>` per page, black ink, track-name staff labels — through `render/score.js`'s `engraveMeasure`, the view's own engraver), `scoreHtmlDocument` (the self-contained page with its `@page` rule), `scoreAlbumLine`, `exportScore` (the flow: model → layout → pages → document → `audio/bounce.js`'s `deliverAudioFile`). Imports `buildScoreModelImpl` directly (same layer — rule 10). See "Export score — printable pages".
- `render/compare.js` — Compare with repo's pure outline-drawing + diff math, step 11 (2026-10-04): `cmpTrackKey`, `cmpDiff`, `drawCompare`. **`cmpEnter`/`cmpExit`/`cmpShow`/`cmpBar` did NOT move** — each reaches `setInfo`/`readData`/`draw()` (the last one `render/roll.js`'s own permanent blocker, above).
- `input/gestures.js` — pointer gesture math, step 12 (2026-10-04): `evtPos`, `posToTickPitch`, `cursorHandleHit`, `cursorHit`, `tickAtX`, `rulerSnapX`, `armNoteEdit` (pure coordinate/hit-test helpers). **The canvas pointer/pinch/hold-to-grab/lasso state machine (`pointerdown`/`pointermove`/`pointerup` on `canvas`, `endPointer`, `tap`, `finalizeLasso`, `toggleSel`, `scoreLassoTap`, `scrubTo`, `seekOrMoveCursor`, `placePencilNote`, `clearMultiSel`) did NOT move** — every one of them calls `setInfo()` and/or `draw()`/`drawFull()` directly or through still-bare app.js names (`refreshSelInfo`/`renderTrackbar`/`openVoiceMenu`/`saveVoices`/`hitNote`/`hitTracksNote`/`hitTracksClip`/`annoSnapshot`/`setAnchorBQ`/`setEndBQ`/`updateSubtitle`) — `ui/*` is step 14, `draw` is render's own permanent block (step 11). Every `document.addEventListener("keydown", …)` block in this region (arrow/⌘ editing shortcuts, Space = play/stop, Escape-closes-topmost-overlay) stayed for the same `setInfo`/`draw`/`stop`/`ui/wm.js` reasons. The circle-of-fifths wheel's drag interaction (`cofAngle`/`cofRelease`, `render/cof.js`'s own entry above) is genuinely blocker-free too but stayed — not a logic block, a `verbatim.mjs` tooling gap against the `init<Module><N>()` wrapping its top-level listeners would need; see docs/split-plan.md "Deviations (12)".
- `input/record.js` — pure record/MIDI-status helpers, step 12 (2026-10-04): `recOpenEnded`, `recSnap`, `recSnapOn`, `midiStatusLine`. **The ● record button's click handler and `recNoteOn`/`recNoteOff`/`recFinish`/`midiMessage`/`initWebMidi`/`initCoreMidi` did NOT move** — `recNoteOff` calls `draw()` directly (the one call that blocks the whole MIDI-in chain above it), `recFinish` additionally needs `setInfo`/`pushUndo`/`saveEdits`/`saveDraft`. `instTap`'s pointer wiring (`render/instrument.js`'s own entry, above) stayed for the same reason, confirming that entry's step-12 prediction.
- **Step 14 partially stales this entry's and `input/gestures.js`'s own blocker lists above, without re-checking either file's actual content (neither is a `ui/*` file, out of this step's scope).** `draw`/`setInfo`/`pushUndo`/`saveDraft`/`renderTrackbar`/`refreshSelInfo`/`setAnchorBQ`/`setEndBQ` are now real exports of `ui/chrome.js`/`ui/trackbar.js`/`ui/note-editor.js`/`model/edits.js`, not bare app.js names — so `recFinish`'s and the gesture state machine's blocker count each drops by however many of their own named reasons just moved, but `saveEdits` (→ `scheduleAnalysisRecompute` → `finalizeNotes`) and `openVoiceMenu`/`saveVoices` (→ `buildVoiceMenu` → `ensureAudio`) remain, unresolved either way. Whether `input/gestures.js`'s state machine or `input/record.js`'s MIDI-in handlers are now fully clean enough to move is a real, live question for a future pass — this builder did not re-check either file's full content line by line, only confirmed the specific named blockers above that this step's own work actually resolved.
- `ask/backend.js` — ✦ AI transport/providers, step 13 (2026-10-04): `aiUrl`, `aiHeaders`, `aiSSE` (OpenAI-style SSE parser), `aiHostKind`, `aiRemote`, `aiSay`, `aiModelMenu`, `aiPickModel`, `aiTest`/`AI_TEST_MS`, `aiRunTest`, `aiBackendRows`, the WebLLM in-browser path (`AI_BROWSER_MODELS`, `aiBrowserMenu`, `AI_WEBLLM_URL`, `aiWebllmLoad`, `aiEngineFor`, `aiBrowserTest`, `aiBrowser`), `aiProvider` — 20 names, all library-bound per docs/ai-library-plan.md §3 (the future claude-bridge library's `web/sse.js` + `backends.js`). **`aiHostOk` did NOT move** — its one `appConfirm()` call is still bare in app.js (`ui/*` territory, step 14). **`aiSSE` itself left this file, AI library step 1 (2026-10-04, see "AI library (vendor/ai)" above)**: it's now `import`ed from `../../vendor/ai/web/sse.js` and re-exported, not declared here — the first of this file's 20 names to actually reach the library, not just be bound for it.
- `ask/tools.js` — the tool registry and its pure field helpers, step 13: `ASK_TOOLS` (the OpenAI tool-call schema, pure data), the per-annotation field helpers (`askFindAnnotation`/`askNoteKind`/`askNoteValue`/`askAnnotationStructural`), `askSongPath`, `ASK_READ_BARS_MAX`/`askReadBars` (the read_bars tool body, importing `askKeySpellComment`/`askBarRow`/`askSpanNotesCompact` back from `ask/context.js`), `notesTxtForDoc`/`askAnnotationsText`/`askAnnotationsTextCompact` (the read_song/read_notes text format), the write_notes/bars validators `askNormChip`/`askFindTrackIndex`/`askNoteVel`/`askWriteNotesValidate`/`askWritableGate`/`askBarsCount`/`askBarsValidate`, and `parsePitch` — a general pitch-string parser sitting inside this banner with no other caller, moved here with its one caller rather than given a `theory/` home it doesn't need yet. **Every tool body that actually WRITES — `askAddAnnotation`/`askEditAnnotation`/`askDeleteAnnotation`/`askPublishSong`/`askWriteNotes`/`askInsertBars`/`askCopyBars`/`askDeleteBars` — and the dispatcher `askRunTool` itself did NOT move**: each calls `draw()`/`finalizeNotes()`/`saveEdits()`/`saveDraft()`/`pushUndo()`/`updateSongBtn()`/`updateSyncBtn()`/`publishSong()`/`insertTime()`/`deleteTime()`/`applyTake()` — all still bare in app.js (model/UI-chrome territory, steps 9/14; `draw` permanently, step 11). Also `askSongMatches`/`askSongPath` (2026-10-05, batch 2: catalog + this device's drafts, every match listed, never a guess).
- `ask/actions.js` — the `act` tool's action registry (2026-10-05, docs/ai-parity.md §2, batch 1 of §5): `ASK_ACTIONS` (one entry per action: name/args/gloss/spec/example/say/quiet/song/run), `ASK_TOOL_PHRASES` (the standalone tools' Help rows until batch 3 folds them), the index/declaration builders `askActList`/`askActFind`/`askActIndex`/`askActSpec`/`askActTool`, the forgiving call parser `askActJSON`/`askActItems`, the model-free runner `runActions` and the tool entry `askAct`, the shared validators `askActGiven`/`askActTruthy`/`askActInt`/`askActBarBeat`/`askActBeatText`/`askActPosText`, `askUndoDescribe`, and `askHelpCommandsHTML` (the Help sheet's generated "AI commands" rows), and open_song's first half `askOpenSongQueue` (batch 2, 2026-10-05: finds the song, sets `S.askSwitch`, opens nothing — src/ask/client.js `askSwitchRun` does, once the reply has landed). Layer 4 (ask); imports `play`/`stop` (audio/transport.js), `jumpToTick`/`jumpBarCap` (input/gestures.js — Go to bar's tail, extracted so both share it), `editUndoPop`/`editRedoPop` (ui/note-editor.js), `draw`, and the gate/validators/`askDrummer`/`ASK_TOOLS` back from `ask/tools.js` — a cycle inside layer 4 (`tools.js` imports `askAct` for its dispatcher), legal per check.mjs §2.3, nothing touched at module-eval time. The convention for adding an action is in the ✦ Ask section below ("act — the action registry").
- `ask/context.js` — the system prompt and every context-block line builder, step 13: `askSys`/`ASK_SYS_BASE1`/`ASK_SYS_BASE2`/`RULE_LEARNING`/`RULE_NORMAL` (**Learning mode is the law — moved verbatim, logic untouched**), `ASK_CPT`, the span/bar-cache family (`askSpan`/`askSpanLabel`/`askKeyDeclared`/`askKeySpellComment`/`askSpanNotes`/`askSpanNotesCompact`/`askBarRow`/`askBarFingerprint`/`askSpanNotesCompactCached`/`askSpanCachedBlock`), the per-line builders (`askLegendText`/`askAppState`/`askModeLine`/`askViewCursorLine`/`askOpenSongLine`/`askCapLines`/`askNewSinceLines`), the sent/epoch cache mechanics (`askSentKey`/`Get`/`Stage`/`StageBars`/`ASK_SENT_BARS_CAP`/`Commit`/`Drop`/`Reset`, `askEpochKey`/`Get`/`Set`/`Note`, `askCachedBlock`), `askBudget`/`askStripContext`, `askTerminalContext`, and the message builder `askMsgMode`/`askBuildMessages`/`askEstimate`. **`songTitleOf`/`songWhereLabel` also landed here, unlisted by docs/split-plan.md's §1 table** — a deliberate relocation, not a misfile by default: `askOpenSongLine`/`askTerminalContext` both need them, and they're themselves clean (`S.CATALOG`, `titleCaseSlug` from `model/catalog.js`, `impDisplayTitle` from `import/capture.js`, `LINK_SONGS`/`linkRepoLabel` from `platform/base.js` — all layer ≤4) — but `model/song.js` (the thematically obvious home, layer 2) is ruled out outright: `impDisplayTitle` is layer 4, and layer 2 can never import layer 4 (check.mjs rule 5), the identical wall steps 4/5 hit for `estimateKey`/`trackIsDrums`. `ask/context.js` (layer 4) is the only legal home that unblocks real step-13 content; the dozens of other, non-ask callers left in app.js (breadcrumbs, song lists, share sheets) now import it back downward, which is always legal regardless of which layer-≤4 file it lives in. **`askContext` and `askKeyStateLine` — this step's own two biggest named targets — did NOT move**: `askKeyStateLine` calls `keyLabelState()` (shared with a non-ask UI-chrome caller at app.js's key-select label, no home of its own yet — not ask's row to claim), and `askContext` itself calls `askKeyStateLine`, inheriting the block. Both stay in app.js, importing every line-builder above back.
- `ask/bridge.js` — seen-cursors, inbox/status polling, session + job bookkeeping, and the chat store/log, step 13: `ASK_LOCAL_SOFT`/`ASK_TOTAL_CAP`/`ASK_GENERAL_KEY`/`ASK_GENERAL_LOG`/`ASK_TERMINAL_KEY`, the seen-cursor family (`askSeenKey`/`Get`/`askMaxErrId`/`askMaxStatusId`/`askSeenMaxKey`/`askSeenMax`/`askSeenSet`/`askSeenAdvance`/`askSeenStage`/`askSeenCommit`/`askSeenDrop`), the chat store (`askStore`/`askLoad`/`askUnsavedCount`/`askRevertToSaved`/`askEvictOthers`/`askModelName`), the markdown log (`askLogKey`/`Song`/`Path`/`Header`/`Markdown`), session identity/render (`askSessionName`/`ASK_SONG_ONLY_TOOLS`/`askToolsNow`/`askInboxSeenKey`/`askInboxAllowed`/`askAgeText`/`askTabsVisible`/`askSessionLine`/`askCompactModelName`/`askSessionRender`/`askSessionRefresh`/`askStatusIdle`/`askStatusLine`/`askStatusRender`/`askStatusRecentShow`/`askStatusToggle`/`askStatusFetchCommits`/`askTermModelsLoad`/`TERM_MODELS`), job bookkeeping (`askPendingAll`/`askJobsSupported`/`askJobId`/`askPendingIndex`/`askBadgeOff`), the bridge "composing" notice (`askComposing`, POSTs `/v1/app-state` — matches docs/ai-library-plan.md §2's future `bridge-client.js`), and the 3 deploy/update-banner helpers with no logging call of their own (`deployButtonTick`/`deployBannerShow`/`deployActive`). **Every function that calls `setInfo()`/`logDebug()`/`appConfirm()`/`updateSongBtn()` directly or transitively — `askSave`/`askCommitLog`/`askInboxPoll`/`askNotesArrived`/`askStatusPoll`/`askTabsApply`/`askInboxStart`/`askFinish`/`askFail`/`askLanded`/`askRun`/`askTerminalSend`/`askSend`/`askResume`/`askResumeSoon`/`askRepending`, `deployBeforeInstall`/`scheduleBackupFlush`/`flushBackupNow`/`deployInstallNow`/`deployHoldNow`/`deployWarn`/`deploySetHeld`/`deployAskTap`, `openAsk`/`askBtnTap` — did NOT move**, matching step 7's `ensureAudio` precedent: logging/status reporting is a permanent UI-chrome concern, not a "not yet split" one.
- `ask/annotate.js` — "✦ Annotate this song…" (2026-10-04, docs/plans/2026-10-04-annotate-song.md; its own section below): `annotateGate` (Normal only + song/key/lock/pitched-notes), the pure pieces `annotateParse`/`annotateValidate`/`annotateOverlaps`/`annotateWindows`, `annotateWrite`/`annotateClear` (one `pushUndo` each), `annotateRun` (a `jobStart("annotate")` job calling `aiProvider().chat` with `ANNOTATE_SYS` and `tools: []` — never the chat's `askRun`), the `#annotatesheet` handlers and `initAnnotate1` (main.js, right after `initChrome11`). Imports `factsDocFromState` (model/song.js — the theory-toolkit adapter) and the FACTS kinds as grounding.
- `ask/shots.js` — 📷 screenshot list management, step 13: `ASKSHOT_MAX`/`b64Bytes`, `askShotLine`/`askShotUpload`/`askShotStatusLabel`/`askShotRender`/`askShotAdd`/`askShotRemove`/`askShotClearAll`/`askShotRestore`/`askShotOutgoing`/`askShotDisplayText`, `MAX_SHOT_SIDE`/`MAX_SHOT_KEEP_BYTES`/`askPrepImage`, `askPickFiles`. **`askShotShow` (calls `closeDropUp()`, a shared drop-up-menu helper with no home yet) and `askShotCapture`/`askShotTake` (call `logDebug()`) did NOT move** — per docs/ai-library-plan.md §3 these were always slated to become the host adapter's `captureScreen()` hook, not library material, so staying in app.js for now changes nothing about that plan.
- `ask/sheet.js` — the chat sheet's own DOM and the compose-box draft, step 13: the sheet's DOM consts (`asksheet`/`asklog`/`askinput`/`askstatus`), mode-switch UI (`askSetMode`/`askModeButtons`), the chat-store key router `askStoreKey` (a shared foundation almost every other `ask/*.js` file imports back), small render helpers (`askClock`/`askNoteLabel`/`askRefresh`/`askPartial`/`askShowThinking`), the draft persistence (`askDraftStore`/`askDraftSave`/`askDraftSaveSoon`/`askDraftLoad`/`askDraftClear`), and the box-resize/scroll/focus helpers (`askGrow`/`askScrollEnd`/`askFocusIfKeyboard`). **`askNoteSeen`/`askBubble`/`askFillBubble`/`askCopyText`/`askRender`/`askRenderEarlier`/`askMicOff` and `openAsk`/`askBtnTap` themselves did NOT move** — each calls `setInfo()` (the ✉/status line) or `micStop()` (shared dictation helper, no home yet) directly or transitively; the top-level `document.getElementById("askbtn").addEventListener(...)` wiring block and its neighbors stayed in app.js untouched, per this step's own instruction to leave top-level listener blocks alone.
- **`draw()`/`playbackFrame()`/`buildScoreModel()`/`drawRuler()`/etc. are now real exports of `render/*`, not bare app.js names** — every entry above this one in this Module map that said a function "did NOT move... calls `draw()`/`buildScoreModel()` (render, step 11)" should now be read as: that call is a plain downward import from `render/roll.js`/`render/score.js`, and the function itself remains blocked — `draw()` specifically is now a PERMANENT block (see `render/roll.js`'s own entry), not a temporary one step 11 would clear. This corrects every such reference above (`model/song.js`'s `loadSong`/`setSong`, `model/selection.js`'s `selEditApply`, `model/edits.js`'s `saveEdits`, `gen/drummer.js`'s `drGenerate`, `gen/bassist.js`'s `applyTake`, `gen/analysis.js`'s `scheduleAnalysisRecompute`/`adopt*`, `audio/clips.js`'s `stretchEnsure`, `sync/publish.js`'s `markPublished`) — none of those functions can move once `render/*` exists; they were never blocked by render being unsplit, they're blocked by render's own hub being permanently above their layer, or (for layer-2 callers like `model/selection.js`) permanently unreachable at all (layer 2 can never import layer 3). open-items.md's corresponding QUEUED notes are corrected to match.
- `ui/chrome.js` — by far the largest of step 14's eight files (2026-10-04):
  song button/list, `applyChrome`, view switch, `renderViewMenu`/`closeDropUp`,
  the status/log cluster (`setInfo`/`errChip`/`logErr`/`logDebug`/
  `srAnnounce`), the footer buttons (`updateSongBtn`/`updateSyncBtn`/
  `updateJobsBtn`), `appConfirm`, `keyLabelState`/`expandKeyName`, `micStop`
  — all of these were named in steps 4–13's own Deviations as blocked
  "until `ui/*`, step 14"; they clear now, exactly as predicted, no
  surprises. **Found independently THIS step, once those existed: the
  render hub itself —** `resize`/`draw`/`drawFull`/`playbackFrame`/
  `updateCanvasA11y`, plus `clampView` — **supersedes the "PERMANENT block"
  bullet immediately above and `render/roll.js`'s own entry below, which
  both predate this finding.** The permanence was real against
  `render/roll.js` (layer 3: `updateTrackMore`/`updateEditButtons` are
  layer 4, upward, forever) but NOT against `ui/chrome.js` (layer 4, the
  SAME layer — cycles inside layers 3–5 are legal, docs/split-plan.md §2.3)
  — and nothing below layer 4 ever called these five directly (checked by
  grep across every already-moved file). `render/*` stays pure drawing;
  the orchestrator deciding WHEN to draw, reaching into UI state to do it,
  was always structurally UI-chrome, not render — the table mis-categorized
  it, the layer math didn't. `draw()`'s own hub role (every caller named in
  the bullet above still reaches it) is unchanged; only its OWN home layer
  changed, from "nowhere legal" to "`ui/chrome.js`." Also gained, once
  `setInfo`/`draw` existed here: `saveDraft`, `retireOldOverlay`,
  `scheduleBackupFlush`, `filesMirror`/`filesMirrorSoon`, `draftRead`,
  `flushBackupNow`, `localDraftTracks`, `pendingSongs`/`dirtySongs`/
  `draftDirtyState`/`syncable`, `songtitleEl`/`keyNameShownAt`/`nmic`,
  `minPxq`/`pxqFloor`/`rowHFloor`/`PAN_TAIL_BARS`/`ROLL_AIR`/
  `dispPitchExtent` (clampView's own pure leaf dependencies). **`openDraft`/
  `loadSong`/`play` and everything that reaches them — `updateChipBtn`/
  `playGateKick`/`playGateTick`/`playGateActive`/`chipRenderAuto`/`CHIPS`/
  `chipExt`/`chipVaultFile`/`chipSource`/`psfInflater`/`sonySeqCapture` —
  were tried here too (they're genuinely pure of `draw`/`setInfo`) and
  reverted: `play` itself is blocked by `ensureAudio`/`resumeAudio`/
  `openMaster`/`scheduleNote` (audio/engine.js's own permanent wall, step 7
  — layer 3 can never import layer 4's `setInfo`, regardless of `ui/*`
  existing) — confirming, not merely repeating, that step's finding.**
- `ui/trackbar.js` — `updateTrackMore`/`trackRowNeed`/`fitTrackRow`/
  `scheduleFitTrackRow`/`TRACK_ROW_SLACK` only (2026-10-04). **`renderTrackbar`/
  `trackToggle` — this file's own namesake content — were ALSO tried once
  `ui/chrome.js` existed, passed `check.mjs` clean, and were reverted once
  `npm test`'s real module linking (a check `check.mjs` itself cannot do —
  see docs/split-plan.md "Deviations (14)") surfaced that both still need
  `saveTrackDir` from app.js — permanent: `saveTrackDir` calls
  `finalizeNotes` (writes the `track:` directive, re-applies the whole
  annotation layer), and `finalizeNotes` cannot leave app.js (see its own
  correction below). `renderTrackbar` also needs `openVoiceMenu`,
  permanently blocked the same way `buildVoiceMenu` is (see
  `ui/voice-menu.js`'s entry). Both stay bare in app.js, bit-for-bit.
- `ui/mixer.js` — the meter/measure leaves (`ensureMixerMeters`/
  `teardownMixerMeters`/`mixerMeterRms`/`mixerMeterLoop`/
  `ensureMixerMeterLoop`), `mixerIsOpen`/`mixerPanLabel`/`moveInSameOrder`/
  `mixerMasterStripEl` only (2026-10-04). **`renderMixer`/`mixerStripEl`/
  `mixerStripDragize`/`openMixer`/`closeMixer`/`toggleMixer` were ALSO
  tried once `ui/chrome.js`/`ui/trackbar.js` existed, passed `check.mjs`
  clean, and were reverted for the identical `saveTrackDir` reason as
  `ui/trackbar.js`'s own two — checked independently, same answer, same
  `npm test`-not-`check.mjs` catch (docs/split-plan.md "Deviations (14)").
  All six stay bare in app.js.**
- `ui/voice-menu.js` — the thinnest of the eight (2026-10-04): only
  `autoVoiceLabel`/`GAME_FAMILY`/`SF2_FAMILY`/`gameVoiceFromAll`/
  `gameVoiceFrom`/`gameVoiceFromSet`, the pure label/lookup leaves. **Every
  other named target for this file — `openVoiceMenu`, `buildVoiceMenu`,
  `buildGameVoicePicker`, `buildSf2VoicePicker`, `saveVoices`, `renderSf2Nav`,
  `sf2AuditionPreset`, `renderGameInstNav`, `instAudition`, `gameVoiceLabel`/
  `sf2VoiceLabel` (which refresh the open menu via `buildVoiceMenu`) — did
  NOT move, permanently**: `sf2AuditionPreset`/`instAudition` call
  `ensureAudio`/`resumeAudio`/`openMaster`/`instPlayer` directly (auditions a
  sound the instant the picker opens) — the identical `audio/engine.js`
  permanent wall as `play` above. `saveVoices` calls `saveTrackDir`
  (blocked, see `ui/trackbar.js`'s entry). All stay in app.js, importing the
  six label leaves back down.
- `ui/notes.js` — the key/meter check UI (`fileCheckLine`/`runKeyCheck`/
  `runMeterCheck`/`useFileMeter`/`tonicLabel`/`chosenTonic`/`chosenTonicPc`/
  `partialNameOf`/`tonicOptionValue`/`refreshKeysetLabel`, plus the `keysel`/
  `keysetBtn`/`keymodeSel` DOM consts they close over) and the notes-list UI
  (`notelistSheet`/`NOTE_GROUPS`/`renderNoteJump`/`showHelpTab`/`openHelp`/`ensureHelpLoaded`/`lassobtn`/
  `chordEvidence`/`openChallenge`), step 14 (2026-10-04). **`useFileKey`/
  `refreshKeyPreview`/`renderNoteList`/`openNoteList` did NOT move** (each
  reaches `finalizeNotes`/`draw`/`clampView`/`updateSubtitle` — `draw`/
  `clampView` resolved this step, `finalizeNotes`/`updateSubtitle` did not,
  see below). **`finalizeNotes` was tried here, found blocked by a SECOND
  path, and reverted — see its own entry below; this is the one real false
  step this builder's pass took and backed out of cleanly.**
- `ui/note-editor.js` — the editor/chord-widget cluster (`editor`/
  `fillBarBeatSelects`/`editorType`/`applyEditorType`/`chordSel`/
  `refreshChordChips`/`composeChord`/`setChordWidget`/`SPEECH`/`micJoin`/
  `micToggle`/`snapBeat`/`setBeatPair`/`getBeatPair`/`openEditor`/
  `updateEditButtons`), the chord-label leaves (`CHORD_QUALS`/`CHORD_ROOTS`/
  `INS_DURS`/`chordLabel`/`stampChordBand`/`PROG_LIB`), the anchor helpers
  (`setAnchorBQ`/`setEndBQ`/`dropSupersededBy`/`lassoedAnnos`), and — found
  independently clean later in the pass — `refreshSelInfo`/`renderOctBtn`/
  `reflectSelVel` (the selection readout), step 14 (2026-10-04).
  **`insertChordAt`/`insertProgressionAt` (the chord-insert buttons' own
  handlers) and `updateEditBtnVis` did NOT move**: the first two reach
  `pushUndo`/`finalizeNotes`/`saveLocalNotes`/`computeSongEnd`/`draw`
  directly (`finalizeNotes` blocked, the rest resolved — so these are now
  blocked by `finalizeNotes` alone, where before they had four reasons);
  `updateEditBtnVis` calls `updateChipBtn` behind a `typeof` guard — checked
  directly and confirmed `move.mjs`/`check.mjs` do NOT exempt a
  `typeof`-guarded reference from import resolution, so this stays blocked
  too, correctly, not by a tooling gap.
- `ui/sheets.js` — the jobs/pub-job sheets (`jobCancel`/`renderJobs`/
  `openPubJobSheet`/`renderPubJob`), `publishDest`/`publishLabel`/
  `versionLabel`, the Settings/Share/Analyze sheets (`openSettingsSheet`/
  `openShareSheet`/`openAnalyzeSheet`/`cfgShowPane`/`CFG_PANES`/
  `ghCheckMessage`/`ghCheckOut`/`ghCheck`), `askCopyText` (moved here from
  the `ask/sheet.js` entry's own "did NOT move" list above — it stopped
  calling anything blocked once `setInfo` resolved; `askBubble`/
  `askFillBubble`/`askRender`/`askRenderEarlier`/`askResume`/`askResumeSoon`
  are each still blocked, by the ask-run-loop internals named in their own
  entry, not by `setInfo`, and stayed), and a handful of pure leaves the
  drummer/bassist sheets happened to bring along (`drKitCountT`/`bsRange`/
  `drRange`/`segSet`/`drPartsGet`/`drPartsSet`/`drPartsSync`/
  `computeSongEnd`/`dpTick`/`undoTrackAdd`), step 14 (2026-10-04). **The
  drummer/bassist sheets themselves — `openDrummer`/`openBassist`/
  `drBuildControls`/`drRefresh`/`bsBuildControls`/`bsRefresh` — and the
  generators' own `drGenerate`/`bsGenerate`/`applyTake`/`saveEdits` were
  all tried, found blocked one hop further than they looked
  (`saveEdits` → `scheduleAnalysisRecompute` → `finalizeNotes`), and
  reverted together.** `openSyncSheet`/`renderSyncPending`/
  `fingerprintOldDrafts` (the publish/sync-status sheet) were tried too:
  blocked by `openDraft`/`loadSong` (→ `play`, the permanent transport
  wall) — stayed in app.js.
- `ui/study-sheet.js` — the Analysis sheet (2026-10-05, docs/plans/
  2026-10-05-analysis-sheet.md S2; the `study` stem is deliberate —
  `analysis*` in src/ is the Normal-only estimate layer): `STUDY_GROUPS`/
  `STUDY_PROMPTS` (the sixteen prompt ids, stored in his files, never
  renamed), the pure `studyGroups(notes)`/`studyCoverage(notes)`/
  `studyCoverageText`, `renderStudySheet`/`openStudySheet`/
  `closeStudySheet`/`toggleStudySheet`/`studyIsOpen`, the one write
  `studyWrite` (→ `putStudyEntry`, one "anno" undo step, the lock reason
  on the status line), the answer-box draft (`studyCommitDraft`/
  `studyDiscardDraft`/`studyBeforeSongChange`/`studyAfterNotesChange` —
  the last two are called from `session/song.js`'s `setSong` and
  `finalizeNotesImpl`), `studyRunCheck`, `initStudySheet1`. See
  "Analysis sheet" below.
- `ui/wm.js` — every pure window-shape/layout-math leaf: the `WM_*`
  constants, `wmClampSize`/`wmClampHeight`/`wmClampSplit`/`wmAllowed`,
  `wmMigrate`/`wmMigrateShape`/`wmMigrateShapeB`, `wmSetSide*`/
  `wmClearSide`/`wmAddSideTab`/`wmRemoveSideTab`/`wmSetActiveSideTab`,
  `wmDockBottom`/`wmClearBottom`/`wmSetBottomHeight`/`wmSetBottomSplit`,
  `wmWhereIs`/`wmLoad`/`wmSave`/`wmInnerWidth`/`wmInnerHeight`/
  `wmSideCells`/`wmWindowTitle`/`wmLayoutBottom`/`wmDockLabel`/
  `wmDockShort`/`wmSyncDockButtons`/`wmZoneFor`/`wmZoneForPointer`/
  `wmShowDropZone`/`wmHideDropZone`/`wmMenuItem`/`wmCloseMenu`, step 14
  (2026-10-04). **`wmLayoutAll` — and everything that calls it, directly or
  transitively — did NOT move, permanently**: `wmLayoutAll` calls `resize()`
  directly (the one `ui/chrome.js` function `ui/wm.js` can't legally reach
  back up to, even same-layer — `resize` lives in `ui/chrome.js`, and
  `ui/wm.js` importing it would be fine, layer4-to-layer4, EXCEPT
  `wmLayoutAll` is called from so many places across the window-shell that
  it was simpler to leave the whole cluster together rather than chase one
  more hop — flagged in open-items.md as worth a real re-check, not closed
  off the way `ensureAudio`/`finalizeNotes` are). `wmCloseWindow`/
  `wmDockSide`/`wmSetSideModeFor`/`wmDockBottomWindow`/`wmFloat`/
  `wmSideDividerize`/`wmLayoutTabs`/`wmLayoutSide`/`wmOpenMenu`/`makeWindow`
  all transitively need `wmLayoutAll` and stayed with it. The Dock menu/
  drag-to-dock action functions were never separately checked this step —
  they ride the same cluster.
- **Phase 2 step 7 (2026-10-04) — the ui/ homes filled.** Every "did NOT
  move, permanently" verdict in the seven `ui/*` entries above was a
  phase-1 reading of a call that phase 2 since re-homed or ported
  (`finalizeNotes` → session/song.js in step 6, `ensureAudio`/`play`/the
  transport in steps 2/4c, `saveTrackDir` itself here); they are kept as
  history, not as a map. What each file holds now, on top of its step-14
  leaves: `ui/chrome.js` — `songRegionRight` (the song region's right
  edge every popup positions against), `placeLassoBtn`, `toggleHl`,
  `updateLCD`, and the port bodies `updateEditBtnVisImpl`/
  `updateSubtitleImpl`/`updateChipBtnImpl` (+`updateChipBtnInner`);
  `ui/trackbar.js` — `renderTrackbarImpl` (the chip bar, the step-3 port's
  body), `trackToggle` (M/S/H → `track:` annotation), `saveTrackDir`,
  `saveVoices`, `renameTrack`; `ui/mixer.js` — `renderMixer`/
  `mixerStripEl`/`mixerStripDragize`/`openMixer`/`closeMixer`/
  `toggleMixer` and `reorderTrack` (the strip drag's reorder);
  `ui/voice-menu.js` — `openVoiceMenu`/`buildVoiceMenu`, the game and SF2
  pickers (`buildGameVoicePicker`/`openGameVoiceMenuTo`/`renderSf2Nav`/
  `sf2AuditionPreset`/`buildSf2VoicePicker`), `buildClipControls` (the
  audio track's sheet), the async label fills (`gameVoiceLabel`/
  `sf2VoiceLabel`/`resolvedGameVaultSync` + their `gameVoiceLabels`/
  `sf2VoiceLabels`/`gameVaultResolved` caches); `ui/notes.js` —
  `renderNoteList`/`openNoteList`, `updateChordStale`, `useFileKey`;
  `ui/sheets.js` — File → Instruments… (`renderInstSheet`, the
  `renderGameInstNav` browser it shares with the game-voice picker, and
  its row builders/registries `INST_SYS_ORDER`/`gameInstUsedBySong`/
  `gameSongRows`/`songInstrumentRows`/`currentSongGameContext`/`instKeys`/
  `sf2Registry`/`sf2RegistryAdd`/`instAudition`/`usedInstruments`/
  `usedInstrumentRows`) and the drummer/bassist sheets (`openDrummer`/
  `openBassist`/`drBuildControls`/`drRefresh`/`bsBuildControls`/
  `bsRefresh`); `ui/wm.js` — the window-manager actions (`wmLayoutAll`/
  `wmLayoutSide`/`wmLayoutTabs`, `wmDockSide`/`wmSetSideModeFor`/
  `wmDockBottomWindow`/`wmFloat`/`wmCloseWindow`, `makeWindow`,
  `wmOpenMenu`, `wmSideDividerize`). Convention this step made the rule
  (docs/split-phase2-plan.md step 7): a ui/* or session/* file never
  imports a port from hooks.js whose impl is at layer ≤ 4 — it imports
  `XImpl as X` from the impl's home (check.mjs rule 10 enforces it); the
  only hooks.js imports left in ui/* are inside the impl's own file.
  Still in app.js from these areas: the top-level wiring (`S.wm`
  migration, `makeWindow(...)` registrations, the listener blocks) for
  step 12, and `askRenderImpl` (step 9).
- **Phase 2 step 8 (2026-10-04) — import and sync out.** `import/capture.js`
  now holds the chip capture and import commit: `openChipImport`/
  `openNsfImport` (the Import hub's chip entry), `impCapture` +
  `captureChipTrack`, `captureJobStart`, `batchCommit`/`commitImports`,
  `computeImportAlbumJson`, the SF2 import (`importSf2File`,
  `SF2_SIZE_WARN`/`SF2_SIZE_REFUSE`), the audio-size gate and mono WAV
  encoder (`AUDIO_SIZE_GATE`/`monoWavBytes`), `slugFile`, the chip-rip
  helpers (`chipTrackOrder`/`chipKindOf`/`chipVaultMeta`/`nsfModules`) and
  the import-draft status/rename pair (`impStatus`/`impRename`/
  `renameImportDraft`). `import/hub.js` holds the hub itself:
  `openPickedFiles` (every picked, dropped or shared file routes by type
  from here), `importAudioFiles`, `localMidiOpen`, `nativeOpenUrl`/
  `nativeOpenHook`, `createGameFilesRepo`, the .m3u four (`decodeM3u`/
  `parseM3u`/`applyM3uNames`/`applyM3uToAlbum`) and the File-menu submenu
  builders `fsubItem`/`fsubHeader`/`fsubAlbums`/`fsubFolder`/`fsubSongs`/
  `fsubLocalFolder`/`fsubImportAlbum`. `sync/publish.js` holds the ONE
  publish function and its family: `publishSong`, `copyAudioClips`,
  `markPublished`/`markCurrentSongSynced`, `publishOpenComposition`/
  `publishUnsavedSong`/`publishAllJobStart`/`publishJobStart`,
  `fingerprintOldDrafts`, `discardPending`, `renameRepoTitle(s)`,
  `updateManifest`/`manifestPlace`. The sync sheet (`openSyncSheet`/
  `renderSyncPending`) and the jobs store (`jobsLoad`/`jobStart`/
  `jobsClearFinished` — beside `jobApi`, which is why they are not in
  model/jobs.js) are in `ui/sheets.js`; `revertSongToRepo`/
  `moveComposition`/`createComposition`/`editHereNow`/`forkClashTitle`/
  `makeItMine` in `session/files.js`; the File-menu shell (`songsheet`/
  `filesheet`/`filesub`, `closeFileMenus`/`openDropUp`, `fileStatus`,
  `songStatus`, `draftRow`) and compare mode (`cmpEnter`/`cmpExit`/
  `cmpShow`) in `ui/chrome.js`; the folder-tree walks (`folderTree`/
  `nodeAt`/`nodeCount`/`parentFolder`/`subfolderKeys`) and `publishedLabel`
  in `model/catalog.js`; the tombstone maintenance side (`retireEdited`/
  `pruneTombstones`/`clearTombstones`/`clearTombstonesFor`) in
  `model/edits.js`; `askSave`/`askCommitLog` (Publish's chat leg) in
  `ask/bridge.js`. sync/publish.js ↔ ui/sheets.js ↔ session/files.js is a
  legal layer-4 cycle (the sheet wires revert/discard rows; both re-render
  the sheet) — every crossing name is a hoisted function.
- **`finalizeNotes` — model/rollnotes.js's own central resolver, and the
  thing `saveTrackDir`/`openVoiceMenu`'s `buildVoiceMenu`-adjacent chain and
  the drummer/bassist generators all ultimately reach — was checked here
  for the first time since step 5 named it, found genuinely movable by a
  first scan, and then found blocked a SECOND, independent way: it calls
  `sfPreloadForSong`/`gamePreloadForSong`/`updateEditBtnVis` directly, and
  those reach `playGateKick`/`updateChipBtn` — the chip-audio transport
  wall, step 7/14's own confirmed-permanent block.** It was moved to
  `ui/notes.js`, `check.mjs` reported the second-level import, and the move
  was reverted (verbatim; its prof wrapper restored). `finalizeNotes` has
  roughly 30 callers across app.js — every one already bare there, so
  nothing regresses by it staying. It genuinely needs a layer-4 home
  (its own `renderTrackbar()` call, re-applying `track:` directives then
  redrawing the chip bar, is real) but no existing `ui/*` file is a
  structural fit for "the model's rollnotes resolver" — it is
  model/rollnotes.js content wearing a UI-redraw side effect, exactly
  `draw()`'s shape one layer down, and — because of the chip-audio
  reach-through — just as permanent, not merely homeless. See
  docs/split-plan.md "Deviations (14)" for the full chain.

- `hooks.js` — docs/split-phase2-plan.md §1 M1, step 1 (2026-10-04), 16 more
  ports step 3 (2026-10-04): layer 0. Upcall ports — one-line synchronous
  forwarders that let a lower layer call a function whose real body lives
  higher up, without an illegal import. Step 1: `setInfo`, `logErr`,
  `logDebug`, `appConfirm`, `updateJobsBtn`. Step 3: `draw`,
  `playbackFrame`, `clampView` (bodies stay in `ui/chrome.js`); `fitView`,
  `renderTrackbar`, `updateEditBtnVis`, `updateChipBtn`, `updateSubtitle`,
  `askRender`, `finalizeNotes`, `recFinish`, `albumAdvance` (bodies stay in
  `app.js`); `buildScoreModel` (body stays in `render/score.js`);
  `updateSongBtn`, `updateSyncBtn` (bodies stay in `ui/chrome.js`);
  `songTitleOf` (body stays in `ask/context.js` — step 2's own
  `chipRender`/etc. blocker, dissolved by this port in step 4). Each
  forwarder reads `S.hooks.<name>` (installed by `wire.js`'s
  `installHooks()`) and throws `hook <name> not installed` if called before
  boot wires it. Dissolves the "permanent" blockers docs/split-plan.md's
  Deviations (7)/(8) found for `ensureAudio`/`resumeAudio`/`rebuildAudio`
  (logDebug/logErr/setInfo) and `CHIPS`/`chipRender`/`chipSource`/etc.
  (logErr) — both now unblockable, step 2; and the NEW `songTitleOf`
  blocker step 2 itself surfaced for `chipRender`/`chipRenderInWorker`/
  `chipPublish`/`chipStreamOpen`/`chipRenderAuto` — dissolved by this
  step's `songTitleOf` port, letting step 4 actually move all five.
- `wire.js` — docs/split-phase2-plan.md §1 M1, step 1, extended step 3: layer
  5 (app.js's/main.js's own tier — the composition root). `installHooks()`:
  the ONLY place a `hooks.js` port's bare name binds to its real body —
  step 1's five from `ui/chrome.js`'s `*Impl`s; step 3's sixteen from
  `ui/chrome.js` (`drawImpl`/`playbackFrameImpl`/`clampViewImpl`/
  `updateSongBtnImpl`/`updateSyncBtnImpl`), `render/score.js`
  (`buildScoreModelImpl`), `ask/context.js` (`songTitleOfImpl`), and
  `app.js` itself (`fitViewImpl`/`renderTrackbarImpl`/
  `updateEditBtnVisImpl`/`updateChipBtnImpl`/`updateSubtitleImpl`/
  `askRenderImpl`/`finalizeNotesImpl`/`recFinishImpl`/`albumAdvanceImpl` —
  `wire.js` importing FROM `app.js` is a circular import with `app.js`'s
  own `import { installHooks } from "./wire.js"`, safe because every
  imported name is a hoisted function declaration, available before either
  module's top-level body runs). Called as `app.js`'s FIRST top-level
  statement (later `main.js`'s), before any `init*()` — every port throws
  if reached first. Not every importer of a ported name routes through the
  port: a caller whose own layer is at or above the impl's (same-layer
  siblings like `ui/sheets.js`/`ui/note-editor.js` importing from
  `ui/chrome.js`, or `ui/sheets.js` importing `render/score.js`'s
  `buildScoreModelImpl`/`ask/context.js`'s `songTitleOfImpl`) imports
  `XImpl as X` directly instead — a port exists only to legalize a
  genuinely LOWER layer's upcall; a same-or-higher-layer import was already
  legal and needs no indirection. `app.js`/`main.js` always route through
  the port regardless (the impl's own home file no longer re-exports the
  bare name once ported).
- `ui/controls.js` — moved to layer 0 (next to `ui/icons.js`, which is all
  it imports), docs/split-phase2-plan.md §1 M2, step 1: `setControl`/
  `setPlayBtn`/`setVolBtn` are now reachable from `audio/*` once step 2
  needs them, without a port.
- **docs/split-phase2-plan.md step 4b (2026-10-04) corrects several
  entries above, written for phase 1's app.js-wide split, now that phase
  2's hooks.js ports + re-homes have cleared their specific blockers**:
  `hooks.js`/`wire.js` gained three more ports (`srAnnounce`,
  `scheduleBackupFlush`, `setAnchorBQ` — bodies stay `ui/chrome.js`/
  `ui/chrome.js`/`ui/note-editor.js`, same shape as step 3's sixteen).
  `input/record.js`'s `recOpenEnded` and `ui/sheets.js`'s
  `computeSongEnd` — both named above as pure/blocker-adjacent — moved
  to `model/song.js`, taking `audio/clips.js`'s own `clipLen`/
  `clipEndTick`/`songHasAudio` (named above as "the pure clip-geometry
  leaves") down with them: `computeSongEnd`'s "permanent, clip geometry
  is genuinely audio-layer" verdict (`model/song.js`'s own entry) no
  longer holds once the geometry itself is model-layer, not audio-layer.
  `model/edits.js` gained `buildSchedule` (from `audio/transport.js`'s
  entry's "none yet split" list — independently clean once `clipLen`
  was model-layer), the tombstone/undo helpers `annoSnapshot`/`tombKey`/
  `tombKeyFor`/`noteIdentity`/`tombstone`, and `saveLocalNotes` (named
  above, `ui/chrome.js`'s entry, as blocked only by `scheduleBackupFlush`
  — now a port). `audio/clips.js` gained `writeClips`/`setClipDir`/
  `splitClipAt`/`deleteClip` — this file's own entry named these as "the
  functions that actually APPLY a clip... did NOT move"; with
  `computeSongEnd`/`setAnchorBQ`/`scheduleBackupFlush`/the undo helpers/
  `buildSchedule` all now reachable, these four cleared, but the OTHER
  four names that entry listed in the same breath
  (`applyAudioDirs`/`audioEnsureFile`/`applyBeatMap`/`setSongTempo`) plus
  `scheduleClip`/`stretchEnsure`/`stretchEnsureAll` remain blocked —
  they reach into the ~37-name play-gate/instrument-preload web
  `audio/transport.js`'s/`audio/voices.js`'s own entries describe, which
  step 4b's blockers.mjs runs confirm is still one single interdependent
  cluster, not a chain of individually-portable names. See
  docs/split-phase2-plan.md's step 4b writeup for the full
  commit-by-commit accounting.

- `ui/piano.js` — the on-screen keyboard's DOM-free geometry (main, 2026-10-04;
  merged into module-split the same day): `PIANO_LO`/`PIANO_HI`,
  `pianoIsWhite`/`pianoWhiteIndex`, `pianoKeyW`, `pianoGeom(W, H, scroll)`
  (whites/`wx`/`keyX`/`keyW`/`bw`/`bh`), `pianoHitAt`, the scroll math
  (`pianoClampScroll`/`pianoScrollTo`/`pianoScrollCentering`),
  `pianoVisibleRange`/`pianoRangeLabel`, `pianoOffscreen`. Imports nothing,
  so check.mjs's LAYERS places it at layer 0 beside `ui/icons.js`/
  `ui/controls.js` (the file stays under ui/ as main created it) —
  `render/instrument.js` (layer 3) draws with it. The keyboard's app-side
  pieces main added to app.js landed on this branch where the branch had
  already moved their neighbours: `instScrollNow`/`instGeom`/
  `instSetScroll`/`instScrollBy`/`instOctave`/`instRevealPitch`,
  `instGrad`/`instRoundBottom`, the real-piano `drawPiano`, `INST_CHEVRON_W`/
  `drawInstChevrons`/`updateInstRange` and `pianoHit` (now a one-line
  `pianoHitAt` wrapper) in `render/instrument.js`; `applyInstBar` (called by
  `applyInst`) in `ui/chrome.js`; the finger-side gesture machine
  (`instPointerDown`/`Move`/`Up`, `instPtr*`, `instLetGo`,
  `INST_PAN_SLOP`), Sustain (`instPlay`'s ticket + `instReleaseVoice`/
  `Held`/`All`), `instSetMode`/`instSetLock`/`instSetSustain`, the #instbar
  listeners and the four new prefs stay in app.js for step 10. The playhead
  tag of the same merge: `TAG_W`/`TAG_R`/`TAG_HIT` + the tag-shaped
  `drawStripPlayhead` and scrub-aware `stripPlayheadX` in `render/roll.js`;
  `cursorHandleHit`/`cursorHit` rewritten in `input/gestures.js`; the
  triangle removed from `ui/chrome.js`'s `playbackFrameImpl`/`drawFull`,
  `render/tracks.js`'s `drawTracks`, `render/score.js`'s `drawScore`;
  `S.drag.cursor` folded into `stripCursor` (+ `onCursor`) in app.js's
  pointer handlers and `audio/transport.js`'s `play()` follow rule. The ⏮
  `reveal` logic is in app.js's rwbtn handler. Full conflict list:
  docs/split-phase2-plan.md "Merge of main (2026-10-04)".

- **Phase 2 step 9 (2026-10-04) — the Ask cluster out of app.js.** Two new
  files. `ask/client.js` (docs/ai-library-plan.md §2's "lib client.js"):
  `askRun` (one exchange, tool rounds inside), `askSend`, `askTerminalSend`,
  `askFinish`/`askFail`/`askLanded`/`askRepending` (the pending-question
  markers), `askResume`/`askResumeSoon`. `ask/host.js` (§2's host adapter,
  started): `openAsk`, `askBtnTap`. Into existing files: `askRunTool` + the
  write tool bodies (`askAddAnnotation`/`askEditAnnotation`/
  `askDeleteAnnotation`/`askPublishSong`/`askWriteNotes`/`askInsertBars`/
  `askCopyBars`/`askDeleteBars`) → `ask/tools.js`; `askContext` +
  `askKeyStateLine` → `ask/context.js` (its step-13 "did NOT move" clause is
  retired); `askShotShow`/`askShotCapture`/`askShotTake` → `ask/shots.js`;
  the inbox/status polling (`askInboxPoll`/`askStatusPoll`/`askTabsApply`/
  `askInboxStart`/`askNotesArrived`/`askNoteSeen`) and the deploy hold
  (`deployBeforeInstall`/`deployInstallNow`/`deployHoldNow`/`deployWarn`/
  `deploySetHeld`/`deployAskTap`) → `ask/bridge.js`; `aiHostOk` →
  `ask/backend.js`; `askRenderImpl` (the `askRender` port's body),
  `askRenderEarlier`, `askBubble`/`askFillBubble`/`askMicOff` →
  `ask/sheet.js` (wire.js imports `askRenderImpl` from there now). Only the
  ask wiring statements (the ✦ listener, the compose box, the timers) stay
  in app.js, for step 12. Commit-by-commit: docs/split-phase2-plan.md's
  step 9 write-up.

- **Phase 2 step 10 (2026-10-04) — the input side out of app.js.** New
  `input/keyboard.js`: the on-screen keyboard's finger side — `instTap`,
  `instPlay` (+ Sustain's `instReleaseVoice`/`instReleaseHeld`/
  `instReleaseAll`), `setInstInfo`, `guitarHit`, the `instPointerDown`/
  `instPointerMove`/`instPointerUp` gesture machine (`instPtrXY`/
  `instPtrMeanX`/`instPtrPlayed`/`instPtrTicket`, `instLetGo`,
  `instScrollPersist`, `INST_PAN_SLOP`), `instSetMode`/`instSetLock`/
  `instSetSustain`; the geometry/scroll half stays in `render/instrument.js`.
  `input/record.js` now holds the whole MIDI-in/record chain its step-12
  entry said did NOT move: `recNoteOn`/`recNoteOff`, `recFinishImpl` (the
  `recFinish` port's body — wire.js imports it from here; app.js holds no
  port body any more), `midiMessage`, `initWebMidi`, `initCoreMidi`.
  `input/gestures.js` now holds the canvas pointer machine's functions its
  own entry listed as stayed: `tap`, `endPointer`, `finalizeLasso`,
  `toggleSel`, `scoreLassoTap`, `scrubTo`, `seekOrMoveCursor`, `hitNote`/
  `fallHitNote`/`hitTracksNote`/`hitTracksClip`, `placePencilNote`, the
  Score pencil (`scorePencilTick`/`scoreStaveAt`/`scorePencil`/`scoreErase`/
  `scoreTap`), the cof drag (`cofAngle`/`cofRelease` — `render/cof.js`'s
  entry is retired on this point) and the tap's info-line formatters
  `beatLabel`/`noteLabel`. Re-homed on the way: `moveSelectionToTrack` →
  `model/selection.js`, `setSecDepth`/`cycleSecDepth` → `ui/chrome.js`,
  `gridFollowNote` → `ui/note-editor.js`. The `addEventListener` statements
  themselves (canvas, cofCanvas, instCanvas, #instbar, ●, ⏮) stay in app.js
  for step 12. Commit-by-commit: docs/split-phase2-plan.md's step 10
  write-up.
- **Phase 2 steps 11–13 (2026-10-04) — the end.** Step 11 moved app.js's
  last 65 declarations to their homes (the song picker/view switch/File-menu
  leftovers and the speed/volume popover → `ui/chrome.js`; the undo log's
  apply side `invertEdit`/`editUndoPop`/`editRedoPop`/`applyEditEntry` +
  `selectAllNotes` → `ui/note-editor.js`; the sheet openers, the versions
  sheet, the drum-fill grid, the Settings/folder UI → `ui/sheets.js`;
  `annoRestore`/`shiftAnchors`/`convertAnchors` + `stampChordBand` →
  `model/rollnotes.js`; `CHORD_QUALS` → `theory/chords.js`; `dedupeSong`/
  `insertChordAt`/`insertProgressionAt` → `model/selection.js`;
  `recordRealtimeAudio` → `audio/bounce.js`; `HOLD_MS`/`HOLD_SLOP`/
  `RULER_RANGE_SLOP` → `input/gestures.js`; `MODAL_KEEP` → `ui/wm.js`;
  `refreshKeyPreview`/`fileMeterAt` → `ui/notes.js`). Step 12 turned every
  one of its 327 top-level statements into `init<Module><N>()` functions,
  one per contiguous same-home run, 66 in all, at their original spots —
  so every `addEventListener`/IIFE/first-render line the entries above say
  "stays in app.js for step 12" now lives in the module its entry names,
  inside that module's init. Step 13 deleted app.js (see `main.js` above).
  Three files are new:
- `session/boot.js` — layer 4 (phase 2 steps 11–12): `boot()` — the old
  top-level boot IIFE, verbatim inside a named export: clears the boot
  watchdog, `restoreFolder()`, `renderFolderUI()`, `initCatalog()`, picks
  the first song (shared link → last song → `homeSong`), arms an album
  link, `loadSong`, then `nativeOpenHook` — plus `homeSong` (the first song
  a fresh device sees) and `initBoot1` (the launch-time document-title set
  from the URL, before the catalog exists). main.js calls `boot()` last.
- `ui/perf.js` — layer 4 (phase 2 step 12): the `?perf=1` on-device HUD
  (`initPerf2`: fps / worst frame / event-loop lag / long tasks, the
  self-profiler's hot list from `S.perfAcct`, the ⏺ session recorder and
  its report sheet) and the `?dpr=` override (`initPerf1`). Both no-ops
  without the URL flag.
- `platform/sw.js` — layer 1 (phase 2 step 12; docs/split-plan.md §1's
  row, finally): `initSw1` registers sw.js (scope `S.APP_BASE`, posts
  "warm") or, with `?sw=0`, unregisters it and drops the `night-roll-*`
  caches. `setInfo` from here is a hooks.js port (a genuine upcall).

## AI library (vendor/ai) — docs/ai-library-plan.md §1, step 1 (2026-10-04)

The AI support that used to live entirely in `src/ask/` is moving into its
own repo, `Night-Roll-App/claude-bridge` (private — Josh's songs/analysis
never leave this repo, but the AI *code* is shared with future iPad apps).
Night Roll never depends on that repo directly (no submodule, no CDN/raw-URL
import — both break Pages/offline/the package reachability guard for a
private repo): it consumes a **vendored copy**, committed at `vendor/ai/`,
kept in sync by `tools/ai-sync.mjs`:

```
node tools/ai-sync.mjs --ref v0.1.0             # pin a tagged release (commit the result)
node tools/ai-sync.mjs --from ../claude-bridge  # local dev loop — marks VERSION "dirty"
node tools/ai-sync.mjs --check                  # npm test: hashes match vendor/ai/files.json, not dirty
```

**Never hand-edit anything under `vendor/ai/`** — `ai-sync --check` fails
("edit in claude-bridge, then sync") the moment a file's hash stops matching
`vendor/ai/files.json`, or `vendor/ai/VERSION` says "dirty" (a `--from` sync,
never committed). Edit the library in its own repo, tag it, `ai-sync --ref`
here, then commit.

The sync copies only the library's `web/` (browser ES modules) and `bridge/`
(if present — not yet, as of v0.1.0) plus `LICENSE`/`README.md` — never its
own tests/tools. It writes `vendor/ai/VERSION` (`<ref> <full sha>`) and
`vendor/ai/files.json` (path → sha256), and rewrites `sw.js`'s
`AI_LIB = "<sha7>"` line so the service-worker cache name
(`"night-roll-" + SW_VERSION + "-" + AI_LIB`) turns over whenever the
library does — a stale vendored file can never hide behind an unrelated
`SW_VERSION` bump. `vendor/ai/web/*.js` is precached cache-first (like
`vendor/vexflow.js`), unlike `src/` (network-first): a synced file is
pinned, not live-edited, so there's no staleness risk to guard against.

**The `{final}` tool-result protocol (library, 2026-10-05, for the act
tool's quiet actions):** a `host.runTool` result of the shape `{final:
"text"}` ends the exchange — that text (after any words the model said
before the call) is the reply and no further model round is made. Both of
the library's tool loops honour it: `aiRemoteBackend.chat` (one POST
instead of two; `aiToolFinal`/`aiFinalText` in web/backends.js) and
client.js's `aiResume` (`aiFinish` at once, no new job). A round where
only some results are final is not final — those texts travel back as
plain tool messages. Night Roll's only producer is `askAct`
(src/ask/actions.js). Made in claude-bridge as commit `dfef7e7` (tests in
its tests/backends.test.mjs and tests/client.test.mjs); the branch that
built act vendored it with `--from` (VERSION "dirty"), so the main
session's step is: tag the library (v0.7.0), `node tools/ai-sync.mjs --ref
v0.7.0`, commit — until then `ai-sync --check` (tests/modules.test.mjs)
fails on that one point by design.

`src/ask/backend.js` imports `aiSSE` (the OpenAI-SSE stream parser) from
`vendor/ai/web/sse.js` and re-exports it, so every existing
`import { aiSSE } from "./ask/backend.js"` (src/app.js) keeps working
unedited. `tools/package.mjs` follows src/'s imports out into
`vendor/ai/web/`, guards that every file there is reachable (from src/, or
is the library's own public entry `web/index.js`), and never ships
`vendor/ai/bridge/**` (the Mac-only server, once that lands). `tools/split/
check.mjs`'s rules 1-3/6/7 (no top-level `let`, every free identifier
resolved, unique top-level names, SERIALIZED self-containment) also run
over `vendor/ai/web/` — rules 4/5 (the layer table) don't apply: the library
isn't part of Night Roll's own layer system.

**The host adapter — `askHost()` in `src/ask/host.js` (AI library steps 3–6,
2026-10-04).** Every library function takes the app's `host` object as its
first argument (the library holds no global of its own, no "mode", no
storage key, no wording); `askHost()` builds Night Roll's once (cached on
`S.aiHost`) and is the ONE place the library learns anything about this app.
`src/ask/*.js` keep every bare name the tests and the e2e mirror use —
`aiUrl`, `aiHeaders`, `aiProvider`, `aiRemote`, `aiBrowser`, `aiTest`,
`aiHostOk`, … — as one-line delegates (`aiUrl = () => aiBaseUrl(askHost())`),
and the host's own `url()`/`headers()`/… arrows read those delegates' live
import bindings, so a test's `run("aiUrl = () => …")` is seen by every
library call too. Library top-level names are `ai*` but never the same ones
as a delegate (check.mjs rule 6 scans `vendor/ai/web` with `src/`); a library
name Night Roll needs under its own name unchanged is forwarded
(`export { AI_BROWSER_MODELS, aiWebllmLoad, aiEngineFor }`), never
redeclared. Step 3 (library `v0.3.0`, `web/backends.js`): the remote
(OpenAI-SSE, tool rounds, the bridge's job/session headers) and in-browser
(WebLLM) backends, `aiProbe` (the Test button's mechanics — it answers a
KIND, `backend.js`'s `aiTestWords` turns it into this app's sentence) and
per-host consent (`aiHostConsent`, the list under `ff1roll-ai-hosts`; the
sheet's wording is `askHost().confirmHost`). tests/ai.test.mjs is the oracle
for every step and is unchanged throughout. Step 4 (`v0.4.0`): `web/store.js`
(the chat record `{msgs, saved, trimmed, lastUsed}`, its caps and eviction,
the pending markers, the seen cursor, the draft, `aiLogMarkdown`), `web/
ctx-cache.js` (the `-sentctx`/`-epoch` records, `aiCachedBlock`, `aiHash` =
the same FNV-1a 32 as `fnv1a32`, so every hash a device holds still
matches), `web/bridge-client.js` (HTTP only: jobs, inbox, status, sessions,
terminal + prefs, app-state, deploy — `{ok, status, body}`, a network error
throws; polling and every render stay in `src/ask/bridge.js`) and `web/
attach.js` (upload, the `(screenshot: path)` line, image prep, tab capture;
the pending list and the shell's native capture stay in `src/ask/shots.js`).
The library reads and writes under `askHost().keys` — `store: "ff1roll-ask-"`,
`seenMax`, `inboxSeen`, `draft: "ff1roll-askdraft-"`, `mode` — so nothing
migrates. **tests/ask-storage.test.mjs + tests/fixtures/ask-storage-2026-10-04.json**
are the no-lost-chats guard: every shape a device held that day, under its
real key names, must read back identically (stores, cursors, hashes, epoch,
both draft shapes, the saved tab), eviction must never touch an unsaved
chat or any key that isn't a chat store, and a save round-trips. One
deliberate change rode along: eviction over `ASK_TOTAL_CAP` used to walk
every `ff1roll-ask-*` key and so deleted the `-seen`/`-sentctx`/`-epoch`
cursors (a resend, a re-poll — never messages); it now considers only
values that are chat stores. Step 5 (`v0.5.0`): `web/client.js` — the
exchange (`aiSendText`: the question stored with its pending marker BEFORE
the request; `aiRun`: the stream, tool rounds under `-r1…` job ids, abort,
the cut-stream branches; `aiResume`: every pending question looked up on
the bridge; `aiTerminalSend`). The library never sees what the context says
or which tools exist: `askHost()` hands it `systemPrompt` (= `askSys`, the
Learning law), `context` (= `askContext`), `buildMessages` (= `askBuildMessages`
— a different mode's turn never enters a request), `tools`/`runTool`,
`messageMeta` (`{mode: appMode()}` — stored on every message, never read by
the library), `backend`/`jobsSupported` (through the app's own `aiProvider`/
`askJobsSupported` delegates, so a test's by-name stub reaches the loop),
and the window callbacks (`bubble`, `showThinking`, `fillBubble`, `busy`,
`afterSend`, `landed` = `askLanded`). Wording: the library's `AI_TEXT`
defaults are neutral ("the server", "the bridge"); `host.text(key)` hands
back this app's lines (`ASK_TEXT` in host.js: "the Mac", "File → Settings…
→ AI model"). `src/ask/client.js` keeps `askSend` whole (the DOM read, the
gating, the consent, the span freeze, and the user push itself with its
`mode: appMode()` tag — the SAFETY test reads that line from the source, so
the library's `aiSendText` is for other apps; Night Roll hands the built
messages to `aiRun`) and every bare name as delegates; `askPartial` is now
`S.askPartial` (aliased in sheet.js). All 68 Learning cases and
tests/ai.test.mjs's Learning-wire test are unchanged and green. Step 6
(`v0.6.0`): `web/window.js` in ADOPT mode — it binds index.html's existing
`#asksheet #asklog #askinput #askstatus #asksend #askstop #askmode*
#askspanrow` by id (`AI_WINDOW_IDS` are exactly this app's; markup, CSS
and every e2e selector untouched) and owns the mechanics: the box that
grows (`aiGrow`), bubbles + links + the copy button (`aiBubble`/
`aiFillBubble`, copy via `host.copyText`), the live stream (`aiShowThinking`),
the three tabs (`aiTabSet`/`aiTabButtons`/`aiTabRestore`, the choice under
`host.keys.mode`), the draft (`aiDraftLoad`/`aiDraftSaveNow`/`aiDraftSaveSoon`/
`aiDraftDrop`), the log render (`aiRenderLog`) and the Send/Enter/Stop/tab
wiring (`aiWindowBind`). Every sentence a user reads is still this app's:
sheet.js now holds them as plain functions the host hands over —
`askTabLabel` (♪ + the song), `askPlaceholder`, `askGreeting` (the Learning
greeting leads with hints, the Normal one answers), `askMsgTag` (which turn
is "another mode's": `askMsgMode`/`appMode`, decided here, drawn there),
`askNoteLabel`, `askRenderEarlier(div)`. `openAsk`/`askBtnTap` stay in
host.js; `askRenderImpl` = `aiRenderLog(askHost())`. The window's own
listeners (tabs, Send/Enter, Stop, input) stay in `initSheet3`, and
`initSheet1`'s tab restore stays as it was — each a one-line call into a
delegate, kept so tests/boot-order.test.mjs's snapshot (main.js's expanded
init sequence) is byte-identical; the library's `aiWindowBind`/`aiTabRestore`
do the same for an app with no wiring of its own. Step 7 (the library's
own markup + CSS + `mountAiSettings`) is deliberately NOT done: index.html
is the only consumer today — docs/ai-library-plan.md §4 says what it would
take once a second app exists.

## Code map (index.html, section comments mark these)

catalog → CATALOG built from albums/manifest.json at boot (run
tools/build_manifest.mjs after adding music; album.json per album holds
title/order/name overrides) + two-level song picker (groups sheet → songs;
opens into the current song's group) ·
rollnotes → parse/serialize/regions/
sfAt/subtitle · lasso/chord id · load song → setSong (computes songEndTick;
loadGen guards stale async loads) · track chips · drawing → draw/drawRuler (roll) ·
score → buildScoreModel (quantize 16ths, chord-group, clip overlaps,
measure split with ties, rest fill) / renderMeasure (LRU 60 cache,
geometry + timeMap per measure) / drawScore · gestures → pointer/pinch/
lasso/cursor drag; iOS page-zoom suppressed · audio → NES voices, drumHit,
per-track gains, loop scheduler · note editor (type-first) · notes list ·
sync (GitHub Contents API, 409 retry) · key dial · help sheet.

## Project conventions that govern this code

- Keys/analyses are Josh's discoveries: never pre-fill answers into the UI
  or seed analysis for unanalyzed songs (see memory + open-items.md).
- Commits auto-allowed in this repo only (.claude/settings.local.json hook,
  gitignored; script at .claude/hooks/allow-git-commit-push.py).
- Docs: open-items.md (questions/tasks); docs/learning/ (quizzes.md =
  protocol + bank, supplemental-learning.md = session log = quiz source
  material, glossary.md); docs/design/ (score-view-plan.md = score
  history/limitations, and the other design records); docs/README.md is
  the index.

## Tracks/Arrange view (advisor-designed, 2026-08-22)

Third viewMode ("tracks"; footer v2 tweaks, 2026-09-30, Josh after using
footer v2: "I use it a lot in analysis" — brought back from the first
footer v2 pass, which had hidden it, betting View ▾'s Tracks/Score items
alone would cover it). The Roll/Tracks/Score switch is a 3-way segment —
viewSeg{roll,tracks,score}, ids viewsegroll/viewsegtracks/viewsegscore —
now #viewbtn itself: the FIRST item in the footer's left group (before ⊞
Lasso/🎹), current mode lit via button.active. View ▾ has the same switch
again too, now its own VIEW group at the top of a restructured four-group
menu (VIEW radio → PANELS → DISPLAY → MODE, each with a .cfgsec label like
⋯ More's; renderViewMenu/#viewsheet) — separate DOM nodes
(vwRoll/vwTracksView/vwScore), same setViewMode() calls. RULER_W is now a LET —
148 in tracks (the header column), 46 elsewhere — set ONLY in
applyViewMode; every gutter/time consumer keys off it. Time axis is
the roll's shared map, so ruler/sections/cycle/bar-magnet/playhead/
follow-camera come free. laneGeom(ti) = fit-to-count lanes (44-88px),
thumbnails normalized per lane (min one-octave span; drums use
kitSlots rows). Editing: selection is the arrange currency — lasso =
time-span × lane-span across tracks; drags on selected notes GHOST
(tracksGhost {dT, dLane}) and commit on release: dLane 0 ->
selEditApply time slide, else moveSelectionToTrack(target, dT)
(retrack keeps pitch, one group undo; melodic/drums lanes never mix).
Pencil is roll/score-only (no honest pitch in a squeezed lane); erase
works. Headers: M/S chips, fader (live gains, persists via
saveVoices as vol=), tap = selTrack, second tap = voice menu.
Gesture guards: anything assuming ROLL geometry must check
viewMode === "roll", not !== "score".

## Chrome visibility: applyChrome() is the ONE writer (advisor, 2026-08-22)

editrowHidden/footerHidden (device-local; migrated from the old
combined ff1roll-panelhide key, preserving the phones-start-folded
default). editrow shows iff editable (.on class) AND !editrowHidden
(inline style) — never write editrow.style.display anywhere else.
footer folding (footer v2, 2026-09-30) is a CLASS, not style.display:
`footer.classList.toggle("folded", footerHidden)` — CSS `footer.folded >
:not(#readline) { display: none; }` hides only line 2 (the buttons),
never #readline (the readout, #noteinfo + #chordbtn) — a folded footer
still says what's selected. Listener mode's own `body.listener footer`
rule still hides the whole footer, readout included (phones are PLAYERS).
INVARIANT: the header never hides; View ▾ is always reachable, and a
hidden footer always floats the ▴ restore (which shows both). The
View ▾ menu stays open across toggle taps (batch hiding); every item
mirrors an existing button — buttons are the fast path.

### Listener mode (2026-08-23)

Phones (min-dimension < 500) default to a PLAYER: body.listener CSS
hides File/Edit/View, track chips, edit row, footer, ▴ restore,
metronome/record, instrument panel, #subtitle notes strip — leaving
the roll, ⏮ ▶, the LCD, speed % and 🔊. Section/chord bands fold too:
finalizeNotes caps depth at -1 and nulls chord lanes when listenerMode,
so STRIP_Y = BASE_RULER_H (applyListener re-runs finalizeNotes on
toggle — idempotent, same pattern as setSecDepth); RULER_H is always
STRIP_Y + the playhead strip's own height on top of that (2026-10-03,
below). listenerMode is
declared beside editOn/viewMode: lane math runs at song load, before
applyChrome's boot read (the editOn TDZ lesson).
Rationale: shared ?song= links are for listening.
Device pref ff1roll-listener ("1"/"0"; null = phone default). The
never-strand invariant holds via a header **Full app** button that
only renders in listener mode (one tap opts the device out and
persists "0"); View ▾ → 📻 Listener mode folds it back on any device.
applyListener() is the one class writer, called from applyChrome's
boot read and the two toggles; it early-returns when document.body is
absent (vm harness).

### Footer v2 — Option A v2 (docs/footer-redesign-plan.md, 2026-09-30)

A 6-note lasso chord outgrew the footer at ~1030px (iPad, AI docked
full-height right) — 20-odd children fighting one row. Fix, by usage
(Josh: ⊞ Lasso/+ Note/☰ Notes/the readout USED A LOT; 8va/find:/the
Tracks-Roll-Score switch/◯5/Publish/⏳ Jobs RARELY):

- **#readline** (order:-1; flex:1 1 100%; its own `display:flex` row) —
  #noteinfo (flex:1 1 0, same 2-line clamp, tap → #infosheet, ⧉ copy)
  + #chordbtn at its right end. Replaces the old #noteinfo
  order:-1/flex:1 1 100% hotfix (3d60818) directly on #noteinfo.
- Footer line 2 (the actual buttons): ⊞ Lasso, 🎹, ☰ Notes, + Note,
  then ⚠/✦ reply/Clear edits only when they apply, **⋯ More always
  last**. Folding (`footer.folded`) hides this line only — see Chrome
  visibility above.
- **#moresheet** (new, styled/positioned like #editsheet/#viewsheet —
  a dropdown pinned under #moresheetbtn via its click handler,
  `songRegionRight()`-clamped; the outside-tap pointerdown closer
  EXEMPTS a native `<select>` so iOS's own picker UI, rendered outside
  this DOM, can't close the sheet out from under a pick; phones
  (≤480px) get a `position:fixed` full-width bottom sheet instead, via
  a plain media query — the JS skips inline positioning there so it
  doesn't fight the CSS). Section labels reuse the (previously unused)
  `.cfgsec` rule. Rows, same ids/handlers, just moved:
  - VIEW: viewseg{roll,tracks,score} (3-way, replaces the cycling
    #viewbtn — #viewbtn itself is now a hidden, inert node).
  - SELECTION READOUT: #octbtn (8va) — now **always visible** (no more
    show/hide in refreshSelInfo; `renderOctBtn()` just renders its ✓
    prefix + `.primary` class, same convention as renderViewMenu's
    checkmarks, so it's reachable with nothing selected).
  - HIGHLIGHT: #findsel, #cofbtn (◯5).
  - KEY SIGNATURE: #keysel/#keymode/#keyset/#keysetest + a fixed
    explanation line (spelling/signature/degrees, never the sound).
  - SONG: #syncbtn (Publish), #jobsbtn (⏳ Jobs).
  - #morebadge (inside #moresheetbtn) mirrors #jobsbtn's own running
    count as a gold badge — `updateJobsBtn()` writes both, #jobsbtn's
    own text/display logic untouched (its tests stay green).
- **💬 retired from the footer**: #subbtn is a hidden, inert node;
  View ▾ → 💬 Notes strip calls the extracted `toggleSubtitle()`
  directly (used to be `subbtn.click()`).
- Container query on `footer` itself (`container-type: inline-size`):
  `@container (max-width: 420px)` drops the `.ftxt` label span in
  "⊞ Lasso"/"⋯ More" to bare glyphs (aria-labels unchanged).
- `footer button, footer select { min-height: 44px; }`.

#### Footer v2 tweaks (Josh, 2026-09-30, after using it)

After a day's use: Publish back on the bar, ⋯ More's VIEW and KEY
SIGNATURE sections dropped, ⋯ More itself promoted to a real window.

- **Footer line 2 groups**: LEFT = ⊞ Lasso, 🎹. A `.footerspacer`
  (`margin-left: auto`) pushes everything after it to the bar's far
  end — RIGHT = ☰ Notes, + Note, then ⚠/✦ reply/Clear edits only when
  they apply, **Publish** (#syncbtn — back from #moresheet, same
  `updateSyncBtn()` display/text logic untouched), **⋯ More always
  last**.
- **#moresheet is a real window now** (`makeWindow("moresheet",
  {dockable: true})`, the seventh alongside AI/Instruments/Notes/
  Jobs/Publish-dialog/Mixer): `.overlay` > `.sheet` > `h2#moresheet-h2`
  + `#morerows` (the one designated scrolling body while docked, same
  convention as `#asklog`/`#instrows`/etc.), wrapped in a
  `#moresheet-home` floating anchor. Gets the generic ✕/drag/resize/
  dock-button/remembered-position machinery for free — no bespoke
  dropdown CSS or positioning JS left. moresheetbtn's click handler is
  now a plain toggle + `wmLayoutAll()` (re-activates its tab if it's
  parked in a dock, same "reopening a background tab" promotion every
  other window's own open button already relies on). Its old bespoke
  outside-tap closer (with the native-`<select>` exemption hack) is
  gone — floating, it's a modal overlay like every other window
  (backdrop tap closes it, generically, via the shared
  `.overlay`/`SHEET_TOP` machinery, `MODAL_KEEP` unchanged); docked,
  there's no backdrop, so it stays open while you work the roll
  around it. No longer in `closeFileMenus()` (same as every other
  dockable window — only the transient File/Edit/View dropdowns and
  the non-dockable import hub are).
- **⋯ More now holds only**: SELECTION READOUT (#octbtn, 8va),
  HIGHLIGHT (#findsel, #cofbtn), SONG (#jobsbtn only — Publish moved
  out).
- **VIEW (viewseg) and KEY SIGNATURE (keysel/keymode/keyset/
  keysetest) dropped from the UI** (Josh: View ▾ already has Tracks/
  Score; the key/mode pickers duplicated the LCD key: tap → the
  governing key: annotation's own editor, which has always had its
  own tonic/mode pickers, #nkeysel/#nkeymode, in #noteeditor). The
  KEY SIGNATURE nodes stay in the DOM inside a `display:none`
  `#hiddenmorerows` container (sibling of `#moresheet-home`) —
  `refreshKeysetLabel()`, `refreshKeyPreview()`, and the keyset/
  keysetest click handlers are all unchanged, and still work on these
  hidden nodes; P3's key tests still drive `#keysetest` by id
  directly. (The VIEW segment itself didn't stay dropped — see
  "View switcher restored" below, same day: Josh used the footer for
  one day without it and asked for it back.)
- Help sheet: the ⋯ More entry describes the window behavior and that
  Publish moved out; `key: picker` (the FEATURES drift keyword, kept
  verbatim) now reads "key: picker — now the key on the transport
  display" and points at tapping the LCD key chip instead of
  describing pickers that no longer have a seat in the UI.
- `tests/e2e/docking.spec.mjs` WINDOWS gained `"moresheet"` (CI only).

#### View switcher restored, View ▾ regrouped (Josh, 2026-09-30, same day, after using footer v2 for a day)

**Superseded 2026-10-01 (c045382):** the footer's 3-way segment was "way too big" (Josh) — `#viewbtn` is ONE cycling button again (Roll → Tracks → Score, label = the next view; `viewSeg` and the `viewseg*` ids are gone). The View ▾ regrouping below stands.

"Put the view changer button back in the bottom left — I use it a lot
in analysis." The bet in the tweaks pass above (View ▾'s Tracks/Score
items alone would cover it) didn't hold.

- **#viewbtn** is no longer the retired hidden node — it's now the
  `.seg` container itself: `<div class="seg" id="viewbtn"
  role="radiogroup">`, first item in the footer's left group, before
  ⊞ Lasso/🎹. Its three children are the SAME ids/object the
  `#hiddenmorerows`-era segment used — `viewsegroll`/`viewsegtracks`/
  `viewsegscore`, still the `viewSeg` object, still driven by the same
  `applyViewMode()`/`setViewMode()` — only the markup's location
  changed, so no JS changed. Each button is icon + `.ftxt` label (▦
  Roll / ▤ Tracks / 𝄞 Score), collapsing to bare glyphs past ~420px
  like the rest of the footer (`footer .ftxt` container query). `.seg
  button`'s own 36px min-height is below the footer's 44px touch
  floor, so a `footer .seg button { min-height: 44px; }` rule wins on
  class-count specificity.
- **`#hiddenmorerows`** now holds only the key picker — its comment
  no longer mentions VIEW.
- **View ▾ (#viewsheet) regrouped into four sections**, each with a
  `.cfgsec` label like ⋯ More's own (that rule is now `#moresheet
  .cfgsec, #viewsheet .cfgsec`): **VIEW** (▦ Roll — new, ▤ Tracks
  view, 𝄞 Score view — a radio, one ✓ at a time: clicking any of the
  three now calls `setViewMode(mode)` directly, no more toggle-to-roll
  on the other two), **PANELS** (🎹 Instrument panel, 💬 Notes strip,
  🎚 Mixer, ◂ Tracks — the side panel/window controls), **DISPLAY**
  (🛠 Edit toolbar, ▦ Bottom bar, ▦ Grid…, ▸ Section levels — what the
  roll itself shows or snaps to), **MODE** (🔍 Analyze ▸, ⇄ Compare
  with repo, 🎓 Learning mode, 📻 Listener mode — last, Listener mode
  being Josh's own example of a "mode"). These are separate DOM nodes
  from the footer segment (`vwRoll`/`vwTracksView`/`vwScore`), same
  `setViewMode()` calls; `renderViewMenu()` gained a `vwRoll` entry
  (`set("vwRoll", viewMode === "roll")`) alongside the existing
  `vwScore`/`vwTracksView` checks.
- Help sheet: the "View ▾ menu" entry (FEATURES drift keyword, kept
  verbatim) now walks all four groups by name; the "▤ Tracks view" and
  "Track chips (top)" entries' stray mentions of "the 𝄞/▦ view toggle"
  (a cycling single button, no longer what ships) now describe the
  segmented control.
- Tests: `#viewbtn` is visible (not `display:none`/`aria-hidden`/
  `tabindex="-1"`) and sits before `#lassobtn`; clicking any of its
  three buttons drives `viewMode`; `#viewsheet`'s four `.cfgsec`
  groups are in VIEW/PANELS/DISPLAY/MODE order and every item falls in
  the right one (incl. Listener mode last); `#vwRoll` exists and
  clicking it switches to roll and shows the ✓.

## Bassist (advisor-designed, 2026-08-23)

bsGenerate(seed, opts) mirrors the Drummer's contract: seeded takes,
replace-in-range as ONE group undo, per-bar substreams via the shared
sectionLane(bar) (same label = same bassline), labeled-Break silence,
meter-change refusal, strictly monophonic output (post-sort duration
clamp). Pitch truth ladder: declared chord bands (bsChordTimeline —
slash basses honored, N.C. = key-root pedal, gaps ride the last chord,
unreadable labels ride root+fifth) > INTERNAL melody inference
(bsInferTimeline: per-bar duration+metric-weighted PC census over ALL
sounding voices (one voice alone misreads multi-voice songs), scored
against the declared key's diatonic triads PLUS harmonic minor's
V-major and vii° when the declared key is minor (the graveyard-B
failure: an E# over F#m had no candidate, so every seed shuffled
equally-wrong diatonic picks), an additive mass-scaled smoothness
prior strong enough to hold a pedal (multiplicative ×1.15 amplified
negative scores and let solo lines read as a new root every bar), a
sounded-root bonus, seed draw squared-biased to the best reading and
gated to candidates ≥55% of the top score; a bar where every candidate
scores negative RIDES the previous chord instead of committing to a
confident wrong root. Seeds give different harmonic READINGS
— never displayed, never annotated: naming chords is Josh's; this is
his explicit melody-only "idea machine" case, overriding the
advisor's doctrinal rejection with the display boundary) > key-root
pedal > honest refusal. Styles chug/pump/arp/walk/riff per the spec;
constant rng draws per bar per style (liked-bar stability). Target
track picker never defaults onto a track with notes in range.

## Drummer parts scoping (advisor round 3, 2026-08-22)

parts = chips {kick, snare, hats, fills}. kick/snare/hats scope by
PITCH GROUP; fills is a ROLE (fills contain snares and kicks), scoped
by BAR: the bar before each declared boundary + the boundary/arrival
downbeat crash ticks. Semantics: all four = the literal v1 "all" path,
bit-identical (asserted in vm); groove-only = union of pitch groups,
fillAmt forced 0, no crashes; fills-only = whole-kit rewrite of fill
bars alone (fills knob "off" here = a DE-FILL: strips fills, lays
plain groove); combos = union. DOCUMENTED DECISION: a fills-only
reroll re-seeds the fill bar's groove too, so an identically-labeled
section's restated bar may diverge from its twins there — fill bars
are statement bars and vary on purpose (fills key on absolute bars).
ZERO new rng draws in any pre-existing path — the bit-compat guarantee
is what keeps takes replaying.

## UI convention: menu/row parity (Josh's rule, 2026-08-20)

Every command in the Edit ▾ menu has a corresponding icon button in the
edit row, and vice versa — the menu is the labeled version of the row,
never a superset. Shipping a new edit command means shipping both.
## Drummer (branch `drummer`, awaiting field test)

drGenerate(seed, opts) in index.html: deterministic kit generation.
v2 knobs (advisor-designed from Josh's Logic screenshot, 2026-08-22):
busy (density), hard (velocity — ONE choke point in put(), so hard=3
is bit-identical to v1; hats floored at 40), fills (band + odds),
follow (bass probabilistic / chords deterministic-on-declared-starts
capped 4/bar / off), feel (normal / half = mid-bar backbeat + thinner
hats / double = skank: kick every beat, snare every offbeat 8th,
bass-follow disabled). Legacy positional signature still works and
maps energy -> busy = hard.
Consistency (advisor round 2, 2026-08-22): the GROOVE substream keys on
(fnv1a32(section label) + bar offset in section) for the deepest section
containing the bar's downbeat — sections with an EXACT matching label
restate bar-for-bar (no stemming: "A repeat" != "A1"; renaming is the
manual signal, and it also merges their ruler colors). Groove cycle (B6,
2026-10-05): `grooveLane(bar)` = `drSectionPos(bar).base + [0,1,0,3][(k-1)%4]`
— within a section bars 1 & 3 share a stream, bar 2 is the answer, bar 4
the turnaround (A B A C: a 2-bar loop that varies the fourth); unsectioned
bars use the constant base 0x2545F491 (an unsectioned song is NO LONGER
bit-identical to the pre-2026-10-05 engine). Ghosts share the lane, so
they repeat with it; bass-following kicks read each bar's actual bass.
Reverting B6 alone = `grooveLane = sectionLane` (`sectionLane` itself is
unchanged — the Bassist keys on it). Fill + arrival-crash substreams stay
absolute-keyed on purpose (fills are commentary on what comes NEXT).

Fills (docs/plans/2026-10-05-drum-generation-review.md, built 2026-10-05):
`hits(frng, qt, beats, ctx)` → `[{off, p, v, d}]`, off in ticks from the
bar start, step `drFillStep(qt)` = ppq/4 (the beat's quarter in compound
meters, so eight steps fit the two beats a fill owns); `frng` is the FILL
substream `drumRng(seed, bar*7919+13)` (section fills) — never the groove
stream — and `ctx = {bs, onsets}` carries the other tracks' note starts in
the window (what `stabs` hits with). Rule every fill obeys: one idea, one
direction, 16th grid, lands on the next 1. The snare-only fills `run`,
`negative`, `flam` draw nothing and are frozen byte-for-byte by golden
tests (B1) — Josh keeps them. Vocabulary: run 2–5, negative 1–2, flam 1–3,
stabs 2–5, tomdescent 3–5, threes 3–5, accel 4–5 (full bar), tomrun /
kitfall / doublekick 4–5. `drPickFill(frng, fillAmt, pool, prevName)`:
weighted at fills ≥ 4 (run/tomdescent/threes/accel/kitfall/tomrun 2,
doublekick/stabs/negative/flam 1), even below; the fill picked at the
previous fill bar of the same take never repeats (next pool entry).
Phrase fills: `k` = the bar's 1-based offset in its deepest section
(`drSectionPos`; unsectioned = the absolute bar); fills ≥ 3 may fill
`k % 8 === 0`, fills ≥ 4 also `k % 4 === 0`, never when bar+1 is a
boundary; odds `0.25 + 0.1*fills` from `drumRng(seed, bar*7919+29)`;
pool `DR_SMALL_FILLS` (flam, negative — the same objects — pickup,
tomlick), plus `DR_MEDIUM_FILLS` (run, tomdescent, threes) on 8th bars at
fills ≥ 4; NO crash after a phrase fill. Every `k % 4 === 0` bar is fill
SCOPE regardless of the knob, so a fills-only de-fill strips phrase fills.
Ghosts (busy's promised motion): substream `drumRng(seed ^ 0x5BD1E995,
grooveLane)`, soft snares (v 28–40, d 30, floor 18 after hard) on the 16th
either side of each backbeat, odds .5/.6/.7 and cap 1/2/3 at busy 3/4/5,
none at busy 1–2, in a fill window, or under double. Design invariants (advisor-reviewed, 2026-08-20):
every generation is the same idempotent operation — erase all kit
notes in the bar range + add the new take, pushed as ONE
group{eraseBatch, addBatch} undo entry (no generation-identity
bookkeeping exists to go stale). Randomness is per-bar substreams
(drumRng(seed, barIndex)), so extending the range never reshuffles
bars already liked. The skeleton (kick on 1, meter-table backbeat) is
fixed; seeds only vary hats/ghosts/extra kicks/fill choice. Breaks =
bars where nothing but the bass SOUNDS (sustain-aware), or a section
labeled "break" — the drummer lays out. Fills own their window (the
skeleton yields inside it) and fire on 75% of section/loop boundaries,
crash on the arrival downbeat. Velocity table keeps hats ≥25 under
the bar's backbeat snare (cap 76). Take chips are session-ephemeral UI
snapshots of (seed, energy, from, to) — the winning take IS the notes.

## Perf HUD + session recorder (?perf=1)

The iPad has no Activity Monitor and WebKit has no longtask
attribution, so the app profiles itself. `?perf=1` mounts a HUD
(fps / worst frame / event-loop lag / hot functions / build stamp) and
a `⏺ rec` button. Recording accumulates a session and prints a report
into a copyable sheet — the intended workflow is: reproduce the
stutter, stop, Copy, paste the report into a session.

The HUD/report/record-button code lives in one guarded block in app.js and
costs nothing without the query param. Hot-function timing is `prof(name,
fn)` (step 7, docs/split-plan.md §2.4 — src/state.js, with its own
`?perf` gate, the `S.perfAcct`/`S.perfTotal`/`S.perfRec` accumulators, and
a short comment explaining why it lives there and not next to
`PERF_FLAGS`): each of the ~28 profiled functions wraps ITSELF at its own
declaration (`name = prof("name", name);`), wherever that declaration
currently lives — most still in app.js, a few already in their own
modules (`secToTick` in midi/parse.js; `drumHit`/`updateTrackGains` in
audio/engine.js). This replaced an older mechanism that patched
`globalThis[name]` centrally, after boot, from inside the HUD's own IIFE —
which worked only as long as every profiled name was a classic `<script>`
global, and silently stopped finding anything the moment the first one
(`secToTick`) moved into its own module (step 3) — attribution went
quietly empty, no error, until step 7 found and fixed it. The HUD itself
still reads `S.perfAcct`/`S.perfTotal`/`S.perfRec` live. The audio-node
census is unrelated and unchanged: it patches `BaseAudioContext.prototype`
+ `AudioNode.prototype.disconnect`, listening for `ended` via
`addEventListener` so an app-side `.onended` assignment is never
clobbered. A second, separate `globalThis`-patching wrapper (marking the
recording's timeline when `saveEdits`/`selEditApply`/`insertTime` fire) is
STILL broken the old way — out of step 7's scope, queued in
open-items.md.

Two experiment flags ride alongside it, off by default, added because
Josh's iPad blocks the main thread 100-220ms repeatedly while app JS
accounts for under 2% of wall clock and nothing in the heap grows:

- `?dpr=1` — render at 1x. Overrides `window.devicePixelRatio` with a
  getter rather than editing the eight call sites, so every consumer
  (roll, scene cache, score, instrument panel) picks it up. On a 2x
  iPad this cuts the roll canvas from ~14MB of backing store to ~3.5MB.
- `?scene=0` — skip the playback scene cache entirely: one canvas
  instead of two, paying a full redraw per frame. The cache was added
  as a CPU win (39c551a); on a memory-tight WKWebView that trade can
  invert, which is the shape of regression Josh remembers ("older
  versions did not have this problem").

Both print into the report's `flags` line, so a pasted report is never
ambiguous about which build produced it.

What the report carries, and why each part is there:

- **`shape`** — the discriminator. A blocked main thread makes the
  50ms probe timer AND the frame late together; a throttled rAF
  starves frames while the timer stays on schedule. These have
  completely different causes, and fps alone cannot tell them apart.
- **frame-delta histogram** — uniform throttling piles into one
  bucket; "mostly fine with spikes" is bimodal.
- **attribution** — session ms + call counts per wrapped function.
  `drawFull` nests inside `playbackFrame`, so percentages overlap;
  the report says so rather than pretending they partition.
- **audio-node census** — created vs ended/stopped/disconnected, live
  estimate and peak. A leaked graph burns time in the realtime render
  thread, which no page-side profiler can see and which outranks the
  UI thread in priority.
- **context** — canvas dimensions, dpr, `instOpen`/`fall` (both add a
  full canvas repaint per playback frame), audio sample rate, and
  localStorage size. Chrome negotiating 96kHz doubles WebAudio render
  cost against a 48kHz device on the same code.

## Query tools (tools/*.mjs — deterministic, facts only)

For any session (web sessions especially) that needs to READ music
without eyeballing dumps. All load through the app's own parser via
tests/harness.mjs (one parser, no drift), de-duplicate stacked notes by
default, and take `--json`. They report what IS in the file — never a
chord name, key inference, or note classification; findings are Josh's.

    node tools/at.mjs <song> <bar.beat> [--span <bar.beat>]
    node tools/span.mjs <song> <from> <to>        # + pitch-class set (no drums)
    node tools/pitch-census.mjs <song> [--track T] # PCs present/absent, duration-weighted
    node tools/song-diff.mjs <old.mid> <new.mid>
    node tools/annotations.mjs <song> [--type T]   # + anomaly flags
    node tools/loop-targets.mjs <song>|--all       # loop-target methodology
    node tools/theory.mjs <song> pattern|form|melody|rhythm|bass|voices [opts]
                                                   # the theory FACTS toolkit (docs/theory-toolkit.md):
                                                   # where a figure recurs (any transposition), bar/phrase
                                                   # repeats + sequences, range/leaps/contour, density/
                                                   # syncopation (+ how often HIS chord bands change),
                                                   # lowest-per-beat + pedals, parallel 5ths/8ves/crossings

<song> = a bare name (resolved under albums/) or a path.

theory.mjs is the CLI face of `src/theory/facts/*.js` (layer 0, pure, 2026-10-04 — built
and tested, not yet wired into the app; docs/theory-toolkit.md §3 names every
integration point: ✦ Ask tools in src/ask/tools.js first). Same law as the
others, enforced by tests/theory.test.mjs on real songs: no key name, chord
name, roman numeral or meter in anything it prints or returns.
**Verdict tools (docs/theory-harmony.md)** — the exception to "never a
classification": `tools/harmony.mjs <song> roman|cadences|nct|modulation|
chromatic` reads roman numerals, cadences, non-chord tones, pivot chords
and chromatic chords FROM the song's own `key:` annotation and chord
bands (no key estimate, no chord naming; a song without a declared key
gets "no declared key" rows). On demand only, and in a session with Josh
only when he asks for that reading — it is a reading of HIS declarations,
and it says so.

## Analysis guide (Help → Analysis, 2026-10-05)

Step S0 of docs/plans/2026-10-05-analysis-sheet.md: a ninth help tab
(`data-hs="analysis"`, body `help/help.html`'s `data-hsec="analysis"`),
reached via **Help → Analysis** or the **Analysis guide** button at the
top of the Analysis sheet (`#studyguide`, `openHelp("analysis")` in
`src/ui/study-sheet.js`). It was briefly a ☰ Notes ▴ item (`#notesguide`,
S0) until Josh moved it into the sheet (Terminal #147: "I don't wanna
clutter the drop-up"). It is the reference text Josh asked for (Terminal #133):
not a checklist he fills in, just "here's all the things that analysis
needs" so he can mentally check his own annotations against it — the
sixteen things a full analysis covers, grouped Form/Harmony/Melody/
Texture & rhythm/Summary, each with what to find, how to find it in
Night Roll, how to write it down, and common mistakes, plus a getting-
better ladder and one invented worked example. Generic on purpose —
Learning mode's law — so it names no key, chord, or reading of any real
song; a test (`tests/night-roll.test.mjs`, "Analysis guide (Learning
net)") checks the fragment against every multi-word title in
`albums/manifest.json` plus "Final Fantasy"/"FF1" literally. The later
Analysis SHEET (S2+ in the same plan) clones this text under each of its
own prompt's "What to look for ▸" fold — one source, never duplicated.
`tools/build_help.mjs`'s dd-matching regex was `<dd>` only (no
attributes); the guide's `data-topic="form"` etc. (so S2+ can clone one
group's text) needed it widened to `<dd[^>]*>`, or every attributed dd's
body silently vanished from docs/HELP.md.

## Analysis sheet (☰ Notes ▴ → Analysis sheet, 2026-10-05)

Step S2 of docs/plans/2026-10-05-analysis-sheet.md (storage was S1,
".rollnotes format" above), built against docs/reviews/2026-10-05-
analysis-sheet-review.md. `src/ui/study-sheet.js`; markup `#studysheet`
(`#studysheet-home` wrapper, `#studysheet-h2` → `#studysheettitle`,
`#studyjump`, `#studytools` = `#studyguide` + `#studycheck`,
`#studyStatus`, `#studyrows`); `makeWindow("studysheet", {dockable:
true})` and `S.wmOpeners.studysheet = openStudySheet`, so it docks as a
tab beside AI and comes back after a relaunch; View ▾ → Panels →
Analysis sheet (`#vwStudy`, a `setControl` control like `vwMixer`).

What it shows, per song: the five groups of the guide (FORM, HARMONY,
MELODY, TEXTURE & RHYTHM, SUMMARY) with a bare-name jump strip (no
fractions — review finding 6a), and under each group its prompts — one
tick button (44 px, one tap, `☐`/`☑`), the prompt text, an **Answer**
(or **Edit**) button and a **+ section / + chord / + note** button that
opens the ordinary editor at the cursor. A typed prompt lists his
annotations of that type (`studyTypeMatch`: section bands under
Sections; key lines inline and chord bands behind a "▸ N chord bands"
fold under Key and chords) as ☰ All notes rows — tap one and the cursor
jumps to its bar, the view follows, its editor opens (`studyJumpTo`).
His plain bar notes sit in a last "BAR NOTES · N" fold. Each group's
"What to look for ▸" fold (folded by default — Josh, Terminal #144)
clones that group's `data-topic` `<dd>` out of help/help.html's
analysis section through `ensureHelpLoaded()` — one source, offline via
the same precache. Learning-mode law throughout: the sheet never names a
key or chord of its own, never says what is missing, shows no coverage
figure; the only unasked count is the number of chord bands HE wrote
(the number ☰ All notes shows). `visibleNotes()` feeds it, so a Learning
sheet never lists an ✦ AI estimate band.

Writes: `studyWrite(item, patch)` is the only path — `annoSnapshot()`,
`putStudyEntry()` (S1: retires the old entry, saves the unsynced store,
throws on a locked song → the lock reason goes to `#studyStatus`, never
a native dialog), `pushUndo({kind: "anno"})`, `finalizeNotes()` (whose
tail calls `studyAfterNotesChange()` → re-render). A tick is one tap; an
answer box is an inline textarea with Done / Cancel / Speak
(`micToggle`, the editor's dictation), never auto-focused (the keyboard
pops only when he taps it). `S.studyDraft = {item, songKey, ta}` is the
one open box; `setSong` calls `studyBeforeSongChange()` FIRST, while
`S.songKey`/`S.rollnotes` are still the outgoing song's, so an album
run commits the words to the song they were written on (or, if that
write refuses, stashes them device-locally under
`ff1roll-study-draft-<songKey>|<item>` and restores them the next time
that box opens on that song — review finding 9). Done with a mismatched
song key stashes the same way and says so on the status line. A shared
link (`LINK_SONGS`) is read-only here as in the editor.

**Check coverage** (`studyRunCheck` → `studyCoverage(notes)`, pure):
the one on-demand report (CLAUDE.md's 2026-08-19 corollary; the
Check-vs-file precedent) — "Nothing ticked or answered under: …" plus
"N of M chord bands have no note.", computed from his ticks, his
answers and his annotation TYPES only (a typed prompt with bands counts
as covered). It takes the notes list and nothing else; a vm test proxies
`song.tracks` and spies `estimateKey` to prove a render + a check never
touch the music. The line lives in `S.studyCheck`, shown in
`#studyStatus`, cleared on the next open and on song change.

Not built here (later steps, by design): S3 "File under" chips (`topic`
on bar notes — located prompts list by type only until then) and S5
(Ask writing sheet entries; reading them already works).

## Shipping checklist (every user-facing feature, Josh's standing rule)

1. **Help dialog**: add/update the entry in `help/help.html` (the
   help sheet's body — one `.hsec` per tab; the tab buttons themselves
   are index.html's #helptabs; put it in the right section, touch gesture
   first, keyboard equivalent after).
2. **Full manual**: run `node tools/build_help.mjs` to regenerate
   docs/HELP.md from help/help.html + the tab labels. Never edit it by hand.
3. **Drift guard**: add a keyword for the feature to the FEATURES list
   in tests/night-roll.test.mjs (the keyword must appear in the help
   sheet region). A separate test fails if docs/HELP.md is stale — so a
   feature with no help entry, or an unregenerated manual, breaks the
   suite by construction.
4. Tests green: `npm test` (vm suite) and `npm run test:e2e`
   (Playwright gesture suite, chromium + webkit ≈ iPad Safari; WebAudio
   is stubbed in e2e — a real AudioContext stalls 20s in headless).
   Mid-iteration, `npm run test:e2e:smoke` runs the @smoke-tagged
   specs chromium-only (~2s); the FULL suite before every push stays
   mandatory — smoke is for the edit loop, not the ship gate.
   The harness (tests/harness.mjs) records element/document/window
   listeners and exposes dispatchEvent, a fake clock (app.tick(ms)
   drives setTimeout + performance.now — the 230ms dwell is
   deterministic), Set-backed classList, and the e2e suite's inert
   FakeAudioContext, so vm tests drive the REAL pointer handlers with
   plain event objects (pev() in harness.mjs; handlers only read data
   properties). tests/gestures.test.mjs holds these ports. Port
   discipline (advisor, 2026-08-23): a vm port lives alongside its e2e
   twin for at least one commit before the e2e spec retires, and every
   port must fail under a knocked-out gesture (mutation check) before
   it is trusted. Irreducible e2e core stays browser-real on chromium
   AND webkit: boot/viewport/CSS, one real drag + pen dwell + pinch,
   sheet visibility, and the button-wiring sweep (the vm stub has no
   querySelector — a vm test can never prove a button is wired).
   Browser-verify via claude-in-chrome, commit, push with hash check;
   the push-triggered Pages build deploys on its own (manual kicks
   collide with it and email failure noise — only kick if it hangs).

## Shareable links and the document title (2026-09-07, path form 2026-09-14)

**A song's link is its path with no extension**, and the same path with
`.mid` is the file (Pages serves it as audio/midi):

    https://night-roll-app.github.io/night-roll/albums/compositions/nightroll/ambush
    https://night-roll-app.github.io/night-roll/albums/compositions/nightroll/ambush.mid

Mechanics: `reflectSongURL` puts the path form in the address bar
(replaceState; other query params like `?perf=1` survive). Pages has no
file at the extensionless path, so `404.html` (repo root = the custom 404
for the project site) routes it: it finds `/albums/` in the pathname,
sets the tab title from the slug, and `location.replace`s to
`<root>?song=<path>.mid`. The app reads `songPathFromURL` — `?song=` in
either form (the pre-09-14 links keep working) or the path form — and
then reflects the path form again. One redirect hop per open/reload.

`APP_BASE` is the app directory snapshotted at script start and pinned
as a `<base>` element, so relative loads (vendor/soundfonts, albums/,
the dynamic `tools/nsf` imports, `songsBase` default "") keep resolving
against the app, not the song path, after the address bar changes.

**Album links (2026-09-29):** while `albumRun` is set, `reflectSongURL`
also sets `?album=<CATALOG name>` on top of the song link (dropped again,
`album` never carried over stale, once `albumClear`/`albumLeave` end the
run — both now call `reflectSongURL(currentPath)` themselves). Opening
such a link waits for the catalog like a song link does (`boot`), then
calls `armAlbumLink(album, currentPath)`: if the album name is in
`CATALOG` and the song that resolved is actually in its list, it sets
`albumRun` (`albumStart`'s own shape, `idx` at that song) and calls
`albumStrip()` — armed, NOT playing (no autoplay without a tap). An
unknown album, or a song from elsewhere, is a silent no-op; the song
still opens. `play()` already reads `albumRun` however it got set (see
the `loopSeg`/`albumEndAbs` block), so the first ▶ after such a link
counts passes and advances exactly like `albumPlayIdx`'s own play — no
special-casing needed for "armed but not yet playing."

Tab title and `og:title` are "<Song> · Night Roll" (setDocTitle): set
synchronously from the URL at script start, refined by updateSongBtn
once the catalog supplies the display title. Preview fetchers that run
scripts (Messages) see the song on the `?song=` hop; on the path form
they see 404.html's title — whether Messages previews a 404 response is
UNVERIFIED (2026-09-14). If it doesn't, the route is static per-song
stub directories (`albums/…/ambush/index.html`) with their own titles,
which also makes previews work for script-less fetchers — not built.

## Open Recent (2026-10-01)

File ▾ → **Open Recent ▸**, right under Open…: same expanding-row pattern
as View ▾'s "View type ▸" (`fileOpenRecentOpen`/`renderOpenRecentRow`,
`#fileopenrecentrow`) rather than a floating submenu like Open…'s own
`#filesub`. Device-local list, `localStorage["ff1roll-recent"]`, up to
`RECENT_MAX` (10) `{key, title}` entries, newest first, deduped on
reopen — storing the title means the row never needs the catalog just
to display; the album shown beside it (`recentAlbumFor`) is read fresh
at render time instead (the catalog's own album title via `groupOf`,
or `folderTitle(folderOf(key))` for a local-only song — the same two
cases `updateSongBtn`'s breadcrumb covers).

**One choke point:** `rememberRecentSong(key)` is called from inside
`setSong()` itself, right after `songKey = key` — the single place every
real song-open converges (`loadSongInner`, `openDraftDoc`,
`createComposition`, `forkCurrentSong`), the same hook `rememberLastSong`
("where you left off") already uses one line above it. A linked song
(`LINK_SONGS`) or an unsaved/Untitled one (`isUnsaved`: key starts
`local/`) never joins the list.

**Shown list only** (`recentSongsForMenu`) drops a key that's gone from
both this device's drafts and the catalog — but only once the catalog
has actually loaded (`Object.keys(CATALOG).length`); an empty catalog at
boot means "don't know yet," not "gone," and a genuinely missing song
still fails gracefully through `loadSong`'s own error path. Tapping a
row calls the same two functions Open…'s own rows do — a local draft
wins (`openDraft`), otherwise `loadSong` after the usual
`currentPath`/`rememberLastSong`/`reflectSongURL`/`updateSongBtn`
bookkeeping (`openRecentSong`) — and closes the File menu. "Clear
recent" empties the list and re-renders in place, same as every other
toggle in this menu.

## Album play (2026-09-14; strip model the same day)

**The album is a strip, the transport is the song.** A second advisor
round after Josh found the first version confusing (a transport button
that meant "Album" idle and "Next" running; ⏮ meaning previous song
mid-run; a silent end that then restarted from the last song; a
three-state repeat button). Rulings, all shipped:

- **Entry only from File → Open… → album → 💿 Play album** (`fsubSongs`;
  "from 12/19" when the open song is in that album). No transport
  buttons, no View toggle.
- **A tinted strip** (`#albumstrip`, under `#trackrow`) exists exactly
  while `albumRun` does: "💿 3/19 Song · next: X", ⏮ Prev, ⏭ Next, ✕.
  `albumStrip()` renders it; `stop()`/`play()` call it so it dims while
  paused. Shown regardless of listener mode.
- **The transport never changes meaning.** ⏮ = bar 1. ▶/■/Space start
  and stop this song; inside a run that is pause/resume — `albumRun`
  stays, `play(fromSec)` recomputes `albumEndAbs` against `playOffset`,
  so the resumed song still ends and advances.
- **Prev/Next always mean songs and wrap at both ends**
  (`albumNextIdx`/`albumPrevIdx`). The list wraps forever; no repeat
  control — "this song forever" is ✕ (plain ▶ already loops).
- **✕ (`albumLeave`)** drops the run and keeps the song playing without
  an ending; with chip audio it restarts in place because the buffer
  source has a `stop()` scheduled that can't be unscheduled.
- **Leaving happens only on actions that change what is loaded:** ✕,
  picking a song in Open…, ● record, Download audio (`albumClear`).
- An armed cycle range makes the song loop the cycle and the album wait
  ("cycling — album waits" in the strip; `play()` sets no end).
- **A link can arm a run before any tap** (2026-09-29): `?album=` on the
  address bar, `armAlbumLink` — see "Shareable links" above for the
  boot/reflect mechanics.

**Ending a song (unchanged):** every song wraps forever on its own and
chip audio loops in hardware, so `albumEndSec` supplies the ending —
intro + ALBUM_PASSES (2) of the loop body, once through when nothing
lies inside the segment, capped at ALBUM_CAP_SEC (300). `play()` sets
`albumEndAbs`; the pump schedules nothing past it, `chipStart` adds
`src.stop()` at it, and the pump (the scheduler's setInterval, NOT the
rAF tick — background tabs get no frames) fades the master over
ALBUM_FADE (1.5 s) then calls `albumAdvance()`, idempotent.

**Sequencer:** `albumRun = {album, list, idx, passes, gen}`.
`albumPlayIdx(idx)`: wrap, crumb/URL, `await loadSong`, `await
song.notesReady` (the `loop:` directive must be in before `play()` reads
`currentLoop()` — this also fixed the old `pendingPlay` race), `await
updateChipBtn()` and an in-flight `chip.renderPromise` (15 s cap), then
`play(0, {noCountIn: true})`. A load failure skips the song. `gen`
guards every await. **Never a dialog mid-run:** `loadSongInner` keeps a
dirty draft when the repo is newer and says so in the status line.

Out of v1: shuffle, queue, lock-screen controls (needs a media element;
the silent `<audio>` keep-alive stalled the iPad in August).

**Game order / A–Z (2026-09-30):** Josh wants albums playable in GAME
(soundtrack) order, not only alphabetical. `tools/album-order.mjs`
reads each capture's original rip (filenames for a perFile set, the
rip's `.m3u` for NSF/GBS) and writes the soundtrack position into
album.json as `nsf.tracks[slug].track` (+`.disc` for a multi-disc set);
51 albums have it as of this commit, a handful don't (no rip's playlist
to order by — Zelda, Mega Man 2, SMB3, Tetris (NES), TMNT 2, Shadow of
the Ninja) and Final Fantasy Legend has no rip at all. An album without
any `.track` numbers never shows the switch and always sorts A–Z, same
as before this feature.

ONE function decides the order everywhere: `albumOrder(album, songs,
mode)` — `songs` is `[[title, path], ...]` for one album (the shape
`CATALOG[album]` already is); `mode` "game" sorts by `[disc, track]`
with an untracked song sorting after every numbered one (tie-broken
alphabetically); mode "az" (or an album with no track data at all)
ignores track numbers and sorts by title, byte-identical to the old
behavior. `albumTrackMap(album)` reads the slug → `{track, disc}` map
from `albumMetaCache["albums/" + folderOf(...)]` — the SAME cache
`albumMetaFor` warms for every album at boot (`initCatalog`'s "every
album's album.json, warmed now" loop), so no extra fetch and no change
to `tools/build_manifest.mjs` or `albums/manifest.json` were needed:
`album.json` already carries `.track`, and the app already reads the
whole file. `albumHasTrackData(album)` gates the switch (true iff at
least one song has a `.track`). `albumEffectiveOrder(album)` is
`CATALOG[album]` reordered by the current pref — forced to "az" when
the album has no track data, so a never-ordered album's behavior never
silently depends on the device pref.

**Device pref:** `albumOrderPref` (`localStorage["ff1roll-albumorder"]`,
"game" or "az", one global switch — not per-album), set via
`setAlbumOrderPref(mode)`.

**WYSIWYG (Josh, 2026-09-30: "whatever's shown is what plays"):** the
segmented control (`albumOrderControl(album, onChange)` — a `.seg`
`role="radiogroup"` with "Game order"/"A–Z" buttons, built only when
`albumHasTrackData(album)` is true) sits at the top of an album's song
list in BOTH places a song list renders — `renderFolder` (the mobile
Open… sheet) and `fsubFolder` (File ▸ Open) — and both now order their
`node.songs` through `albumEffectiveOrder(group)` instead of a flat
alphabetical sort. Album PLAY uses the identical function: `albumStart`,
`armAlbumLink`, and `fsubFolder`'s own "from N/M" index all read
`albumEffectiveOrder(album)` for `albumRun.list`, so ⏮ Prev/⏭ Next (plain
index walks over `run.list`) always agree with whatever the list just
showed — flip the switch and the very next Prev/Next follows the new
order. Tapping a mode button calls `setAlbumOrderPref` then re-invokes
the same render function (`onChange`), so the list redraws in place.

Tests: `tests/night-roll.test.mjs` ("Game order / A–Z" / "Game order:"
prefixed tests) — `albumOrder` game vs az, untracked-last, multi-disc
(disc then track), the switch hidden with no track data, the switch
present + tap-to-flip redraw, and Next/Prev walking whichever order is
shown. `tests/album-order.test.mjs` covers the *tool*'s own pieces
(`chipTrackOrder`, `assignSlugsAndTracks`, `namesMatch`, …) — unrelated
to the app-side `albumOrder` above (same name-ish, different file).

## Local folder mode (2026-09-15) — saving without GitHub

Why: Josh's son has no GitHub account (Chrome on a MacBook Pro), and
GitHub removes content on a rights holder's notice, so a recording that
isn't yours needs a home that isn't a repo. Design: `local-folder-
design.md`.

**Model:** a folder on this computer is a fourth data location. Reads
try the folder first and fall back to the configured site (FF1 songs
keep loading from here; a song present in both opens from the folder).
Every write goes to the folder; nothing reaches GitHub and no token is
needed. The folder's layout mirrors the repo exactly
(`albums/<album>/<song>.mid` + `.rollnotes.json` + `.notes.txt`,
`album.json` for titles), so the folder IS a repo without git —
`git init` there and push if the user ever wants GitHub.

**Code (index.html, "local folder backend" after `cfg()`):**
- `fsRoot = {handle, name, mode: "picker"|"opfs", needsGrant}`;
  `folderActive()` is the ONE predicate every seam checks.
- Read seam: `readData(which, path, bust)` — folder first
  (`folderRead` → File), else `fetch(songsURL/analysisURL)`. Returns a
  Response-shaped object (`ok/status/text/json/arrayBuffer/fromFolder`).
  All six repo reads go through it: catalog is separate (below),
  rollnotes load (`loadNotes`, `buildRollnotesFor`), the cross-device
  freshness check, the `.mid` fetch in `loadSongInner`, `albumMetaFor`.
- Write seam: `putMidAt`, `putSongsText`, `putRollnotes`,
  `deleteRepoFile`, `batchCommit`, `renameRepoTitle`,
  `computeImportAlbumJson` each branch on `folderActive()` first.
  `updateManifest` is a no-op in folder mode (no manifest: the catalog
  rescans), and `commitImports` skips the NSF vault upload and the
  manifest rewrite. `writeToken()` returns the stored token or the
  placeholder `"folder"` so every token guard and `ghHeaders()` call
  keeps its shape; `takeToken()` (sync sheet) does the same.
- Catalog: `initCatalog` = site manifest ∪ `folderScanAlbums()` (same
  shape as `tools/build_manifest.mjs`: `albums/*/`, `songs/` subdir,
  subdirectories with their own `album.json`), union by path, folder
  titles win. Either source alone suffices — offline folder users still
  see their songs; the boot error fires only when both fail.
- Persistence: the directory handle is structured-cloned into
  IndexedDB (`ff1roll` v2, store `fs`, key `root`). Boot
  (`restoreFolder`) reloads it and checks `queryPermission`; if Chrome
  wants a fresh grant, `needsGrant` is set, `folderActive()` is false
  (reads fall back to the site), and **📁 Reconnect folder** shows at
  the top of the File menu — `requestPermission` must run in a gesture.
  `navigator.storage.persist()` is requested on first pick.
- UI: Settings sheet row `#folderrow` (`Choose folder…` / `Change
  folder…` / `Reconnect` / `Forget`; on Safari/iPad the row says it
  needs Chrome or Edge on a computer). `renderFolderUI()` also relabels
  File → Publish… as "Publish to folder…" (Model B, below: folder mode
  says Publish too now, never Save — that word means Save Version).
  Status lines say "Published ✓ to <folder>" instead of the Pages wait.
- `?folder=opfs` swaps `navigator.storage.getDirectory()` in as the
  root: same interface, no picker, not persisted. Playwright
  (`tests/e2e/folder.spec.mjs`, chromium only) and browser checks use it.
  The vm test drives the backend with an in-memory fake handle.

**iPad app (2026-09-27, revised the same evening): Files IS Local.**
The first cut made the Files folder a third folder ROOT behind a
Settings checkbox (Save → Files, Publish bypassed). Josh read it as
"everything in Files until I hit Publish" and then ruled "everything
saved locally and up on GitHub", so the mode is gone: `filesMirror()`
writes .mid + .rollnotes.json + .notes.txt at the song's path into the
app's Documents through `nativeDirHandle` (passed as the `root` of
`folderWrite`/`fsDirFor`) on every `saveVersion` (⌘S), after every
Publish, and 2 s after every edit settles (`filesMirrorSoon`, now
unconditional — Model B, below, retired the auto-save switch this
paragraph originally gated on). It is a visible copy, never read back; reads,
`folderActive()` and Publish are untouched; the Settings row is one
sentence (`#filesrow`/`#fileshelp`). `nativeDirHandle` stays the
adapter; the desktop picker/OPFS roots are unchanged. The older
paragraph below describes the adapter; ignore its checkbox/pref parts.

**Edit here (2026-09-27).** A published song in a folder of the user's
own with no local copy on this device shows `#editherebtn` ("✎ Edit
locally") beside Edit ▾ (`updateEditBtnVis`: `ownFolderPath(songKey) &&
!editable`). Tapping asks first (Josh's ruling) and then writes
`draftDoc(true)` as the draft — the local copy, clean until the first
edit — which makes `isComposition()` true.

**iPad app (2026-09-27): the Files adapter.** In the Capacitor shell,
`nativeFs()` returns the `@capacitor/filesystem` plugin
(`window.Capacitor.Plugins.Filesystem`, native platform only) and
`nativeDirHandle(fs, rel)` wraps it in the same handle subset the picker
and OPFS roots expose (get*Handle with {create}, getFile, createWritable,
removeEntry, entries) over the app's Documents directory (`DOCUMENTS`),
which iOS shows as Files → On My iPad → Night Roll (Info.plist:
UIFileSharingEnabled; documents are NOT opened in place — incoming files
are copied to Documents/Inbox). Bytes cross the bridge as base64. It is
used only by `filesMirror()` (the paragraph above) — never as a folder
ROOT: `folderActive()` stays false in the app, reads and Publish are
untouched. The vm test drives it with an in-memory plugin
(`fakeCapacitorFs` in tests/night-roll.test.mjs); the shell project
lives outside this repo (`~/work/ff/night-roll-app`, `build-ipad.sh` =
package → sync → build → install + relaunch).

**Open as LOCAL / PUBLISHED, folders by path (2026-09-27; design:
docs/song-organization-proposal.md, phase 1 of 5).** Nothing moved on
disk: the tree is derived from paths. `folderOf(path)` = the directory
without `albums/` (FF1's `songs/` level collapses); `folderTitle(f)`
names each segment by the catalog album that lives there
(`albumFolders()`), else `FOLDER_NAMES` (nes → NES, imports → Imports,
local → Imported files), else Title Case — "Imports › Mega Man 2",
"My Compositions › Night Roll Sketches". `localFolders()` groups
`draftKeys()` by folder; `songStatus(key)` is the row word: not
published (not in the catalog) / changed since publish (draft dirty) /
annotations changed here (`dirtySongs`) / published. Both pickers —
File → Open (`fsubAlbums` → `fsubLocalFolder` / `fsubSongs`;
`fsubImportAlbum` is the LOCAL view of an imports folder and now holds
the discard-all ✕) and the crumb sheet (`renderSongGroups` →
`renderLocalFolder` / `renderSongList`) — show LOCAL · this device
(folders of local copies) above PUBLISHED · <repo> (catalog albums as
folders); a published song with a local copy says "· local copy" and
opens the local one (draft wins, as before). "Night Roll drafts" and
`fsubDrafts`/`renderDraftList` are gone. Commit → Publish everywhere the
user reads it: `publishDest()` (github / folder / null) and
`publishLabel(what)` ("⇪ Publish …", "Save … to Files/folder", or
"Connect GitHub to publish", disabled) label the import buttons.
The later phases the same evening: Save asks folder + name (below),
the Files mirror (below), the console-folder batch move (below), and
Open as a real tree — `folderTree(paths)` → `{sub, songs, path}` nested
by `folderOf`, `nodeAt`, `nodeCount`, `segTitle` (album title, then
`FOLDER_NAMES`, then Title Case), `parentFolder`; both pickers render
one level per tap (`fsubAlbums`/`fsubFolder(section, folder)` and
`renderSongGroups`/`renderFolder`), top-level folders sorted by title,
"‹ All folders" at the top (Josh: the flat chained list was "thrown
all over the place").

**Console folders — the batch move (2026-09-27, phase 5; branch
`console-folders` until Josh says go).** `git mv`: final-fantasy-i →
nes/final-fantasy-i, imports/{mega-man-2,tmnt-2} → nes/, imports/
chrono-trigger → snes/, imports/final-fantasy-legend → game-boy/.
`MOVED_DIRS` + `movedPath(p)` (beside `songPathFromURL`, which now
redirects old links) drive the boot's fourth wave: every per-song key
(notes/edits/ts/draft/tombs/lastsync/save/stash/ask) follows by prefix,
IndexedDB draft notes move with `idbDraftMove`, and a draft from
imports/ is stamped `capture: true`. Captures are read-only by MARKER,
not by folder (Josh's own "NES/My Covers" may sit beside
nes/mega-man-2): `isCaptureKey(key)` = legacy imports/ prefix, or the
draft's `capture` stamp (impCapture writes it), or `albumMetaCache[dir]
.nsf` (album.json's chip block, for other devices). `ownFolderPath`
excludes captures and `READONLY_DIRS` (nes/final-fantasy-i, starters,
imports/). New captures land in `impDirFor(kind)` =
albums/<console>/<game>/ (`CONSOLE_OF`: nsf→nes, gbs→game-boy,
spc→snes, vgm→genesis, psf→ps1, usf→n64); MIDI-file album imports land
in albums/<folder>/ as the user's own editable folder;
`computeImportAlbumJson` takes the album dir; `importDraftKeys` =
drafts that are captures; `draftInIdb` covers the console roots.
`albumTitleFor` titles any albums/ path by its leaf folder. The
manifest was rebuilt with the tool (imports albums now sort by name).
Tests, README, WEB-SESSION.md and tools/loop_target_bass.mjs use the
new paths; the pre-move waves in the boot block still name the old
ones on purpose (they run first, wave four moves their output).

**Save names the song; folders are yours (2026-09-27, phase 2).** File →
New asks tempo/meter only and creates `local/untitled-N.mid`
(`untitledKey()`; `isUnsaved(key)` = under local/, which also covers
imported MIDIs): editable via `isLocalDraft`, never publishable
(`syncable` skips local/), row word "never saved". Save Version (⌘S,
File → "Save Version…" — "Save…" before Model B, below) on an unsaved
song opens the Save form instead of versioning
(`openSaveForm("save")` inside the File menu: `#fsfolder`
= `fillFolderSelect` over `folderChoices()` — this device's folders ∪
the repo's, own folders only, last-used (`ff1roll-lastfolder`) first,
plus "New folder…" → `#fsnewfolder`, `folderFromInput` slugifies each
segment and refuses `RESERVED_FOLDERS`); `saveSongAs(folder, name)`
asks before replacing an existing local copy (Josh: "overwrite that
one"), `renameLocalKeys(old, new)` carries every per-song key
(draft/notes/ts/edits/versions + IDB — versions/save/stash before Model
B) and the open song, the typed
name lands in the draft's `title`, then `saveVersion(true)` (its first
Version). Save
As shares the form (`mode: "fork"`, `forkCurrentSong(name, folder)`).
Move to… lists every folder (or a new one) and moves a never-published
song on this device only (`moveComposition` returns after
`renameLocalKeys` when `!catalogHas(oldKey)`). Editability is by
folder: `READONLY_DIRS` (final-fantasy-i, imports, starters) are
annotate-only; any other `albums/` path with a local draft or
provenance is a composition (`ownFolderPath`, `isComposition`,
`isCompositionKey`); `albumTitleFor` titles an unknown folder by its
last segment (what a first Publish writes into the manifest — two
folders with the same leaf name would share a manifest album: known
edge). `tools/build_manifest.mjs` walks any depth (a directory with
.mid files is an album; `songs/` collapses). NR_DIR is no longer where
New lands, and since the same evening no longer editable by path
either: a published copy is never edited in place (Josh), so
`isComposition` needs the local draft or provenance for EVERY folder,
Sketches included; "✎ Edit locally" is the way in (no confirm since Model
B, below: tapping it makes the copy right away).

**App edition reads from the configured repo (2026-09-27).** On the web
"this site" (blank base) is Pages = the whole catalog; in the app it is
the bundle = starters only, so Josh's published songs never listed
("why didn't it show the songs that I currently have up there").
`readBase(which)` now answers: the explicit base if set, else in the
app edition `https://raw.githubusercontent.com/<repo>/main` for the
configured songs/analysis repo, else "". It is computed per read, never
stored (saveCfg persists cfg() whole — a stored base would outlive a
repo change; that bit the first draft). `songsURL`/`analysisURL` use
it. `initCatalog` in the app also fetches the bundle's own
`albums/manifest.json` and unions it (repo titles win) so the starters
list offline or with a repo that lacks them; `readData` for a
`bundledPath()` (albums/starters/…) asks the repo first and falls back
to the bundle. Harness: `createApp({edition: "app"})` swaps the
EDITION line like the packager does.

**Settings tabs (2026-09-27).** The sheet is three panes behind a `.seg`
tab strip — Saving (auto-save, the desktop folder rows, and in the iPad
app one sentence in `#filesrow`/`#fileshelp`: songs are kept in Files,
Publish goes to GitHub), AI, GitHub (repo/token, ▸ advanced).
`cfgShowPane(name)` toggles `.cfgpane.on`/tab `.on` and remembers the
pane in `ff1roll-cfgpane` (device pref); `openSettingsSheet` restores it.
`renderFolderUI` shows `#filesrow` and hides `#folderrow` when
`nativeFs()` is present. Josh, from the iPad: one long sheet had texts
running into each other.

**Open in Night Roll (iPad app, 2026-09-27).** The shell's Info.plist
declares `public.midi-audio` plus an imported UTI for chip files
(nsf/nsfe/gbs/spc/vgm/vgz) with `LSSupportsOpeningDocumentsInPlace`
OFF, so a file tapped in Files or sent via the share sheet is copied to
Documents/Inbox and delivered as a `file:` URL through the App plugin
(`appUrlOpen`; `getLaunchUrl` for a cold start). `nativeOpenHook()` is
attached at the end of boot, after the first song settles;
`nativeOpenUrl(url)` reads the bytes with `Filesystem.readFile({path:
url})`, opens a lone MIDI straight into a `local/` draft
(`localMidiOpen`, no import sheet) and everything else through
`openPickedFiles(loaded)` — the picker's own body, extracted so the two
doors share it — then deletes the Inbox copy. vm test: fake App +
Filesystem plugins.

**Not done:** Safari fallback (a downloadable project bundle),
autosave-on-edit-INTO-THE-FOLDER (every edit still stays device-local
until a deliberate Publish to folder…, same as GitHub mode — Model B,
below, made autosave-of-the-working-copy universal, but never changed
what triggers a folder write), copying the FF1 corpus into a folder.

## Tap a note: the game's instrument (2026-09-28)

Chip audio is one pre-rendered stream per track, so a tapped note had
only the synth voice (Josh: "when I press notes on Dire Dire Docks it
sounds them in our MIDI instrument sounds"). Now the render worker
stays alive after a successful render (`w.__key` = its song; freed when
the song's audio is freed) holding the loaded set, and answers
`{preview: {req, id, track, midi, vel}}` by rendering ONE note through
that track's instrument: `previewOne` in tools/chip-worker.mjs copies a
template note of the track (channel, instrument, bank, pan) with the
tapped pitch and a short duration, runs the same `R.render` on a
one-note result, and returns the track's buffer (mono or a stereo
pair). Sequence chips only (PS1, N64) — a register log (NES/GB/SNES)
has no note to re-render this way. Page: `previewNote` →
`chipPreviewBuffer(name, midi)` (400 ms guard, then the synth; cache
per song/track/pitch for instant repeats) → a buffer source into the
track's gain. Test: "tap a note on a chip song …" in
tests/night-roll.test.mjs (a fake worker answers).

**Register chips (nsf/gbs/spc), 2026-09-30:** `chipPreviewBuffer`
always comes back null for these — no per-note renderer — so they fell
to the synth too (Josh, FF4 SNES "Cry in Sorrow (part 1)": "tapping a
note plays the generic synth, not the game sound"). But each track IS
one hardware voice/channel, monophonic, so the song's own rendered
track buffer (`chip.buffers[track]`, or the matching cached chunk in
stream mode) already holds exactly that note's sound, start to
release — no re-render needed, just a slice. `chipNoteSlice(tr, pitch,
tick)` (index.html, by chipStreamScheduleChunk) finds the tapped note
(exact tick+pitch match, not erased, not `added` — a pencil
placement/MIDI-in note has nothing rendered where it now sits, since
`chip.buffers` is the ORIGINAL capture) and returns `{buf, offset,
dur}`: offset/duration in BUFFER seconds (`start()`'s offset/duration
are always seconds, whatever the buffer's own sample rate). Native
("tape") position = `chip.lead + tickToSec(song, tick) * playRate` —
the same identity `chipStart`'s own single looping source relies on.
The slice runs from the note's own start to its end + a short release
tail: up to the NEXT note on the same track, or +250ms, whichever is
sooner. `previewNote` wires it through the SAME path `chipStart` uses
from there down (`[chip.pan panner, if this track was downmixed to
mono] → trackGain(ti)`, so volume/pan/mute match playback) plus its own
~5ms fade-in/out gain (a slice starts/ends mid-waveform, not at a
zero-crossing) — an `AudioBufferSourceNode` sharing the existing
buffer, `start(when, offset, duration)`, never a copy, and never added
to `chip.srcs` (a lone extra source; a tap mid-playback can't fight the
ones already playing). Stream mode (`chip.stream`, Settings → Other,
default off): only answers from a chunk `chipStreamPump` has ALREADY
cached — never requests one from the worker; no cached chunk (or no
rendered buffer at all yet — the render isn't done, or the idle sweep
dropped this track silent) falls to the synth, same as today. An
explicit voice or a drum track still plays the synth, same gate as the
sequence-chip path above. Test: "tap a note on a REGISTER chip song …"
in tests/night-roll.test.mjs.

## Game instrument libraries (2026-09-28)

Josh's goal: use any imported game's instruments in his own songs.
Step 1: `tools/instruments/` extracts every PS1 (AKAO, SEQ/VAB), PS2
(Sony's SQ/HD/BD, Square Enix's BGM/WD), N64 (EAD SM64 + OoT/MM, Rare),
SNES (`.spc` DSP log) and NES/Game Boy (pulse/triangle/noise/wave
synthesis) album's instruments into a
driver-neutral library — `extract.mjs <ripdir> --slug <slug> --vault
<vault> [--out dir] [--publish]` writes `<out>/<slug>/instruments/
instruments.json` locally (instruments with key regions, root key +
fine tune, the driver's exact envelope as points plus an ADSR summary,
pan, gain, which songs use each) and one 16-bit WAV per distinct sample
(loop and root in a `smpl` chunk, readable by any sampler). Names are
measured guesses (`name.mjs`: attack, decay, brightness, harmonicity,
register → Kick/Snare/Hi-hat/…/Soft pad/Lead), editable later.
`play.mjs` plays one note from the library (what the app will use);
`verify.mjs` checks it against the driver's own renderer — pitch within
a cent, envelope correlation ≥ 0.99, level within 0.3 dB on every
sampled song. Libraries go to the game files & instruments repo beside
each album's chip files, at `instrumentsFolder(vault)` (model.mjs): a
folder vault ("goldeneye-007/") keeps its library inside itself,
`<vault>instruments/`; a single-file vault ("tetris.nsf", "tetris.gbs")
has no folder of its own, and vault-minus-extension collides between an
NES and a GB album sharing a base name, so it publishes beside the
whole filename instead, `<vault>.instruments/` (e.g.
`castlevania.nsf.instruments/instruments.json`) — `--publish` uses this
rule when `--vault` is given, falling back to `<slug>/instruments/` only
when it isn't (older callers). The app reads the same rule
(`instFolder` in index.html, tested against model.mjs); a track's
`voice=game:` id drops a folder vault's trailing slash, and
`gameVoiceVault` restores it (a `.nsf`/`.gbs` vault stays whole).
Performance (vibrato, bends, volume
ramps, reverb, filters) stays with the song, not the instrument.

Step 2: `export.mjs <libraryDir> --sf2 out.sf2 --sfz outDir [--used-only]`
writes the same library as SoundFont 2 (one file, one preset per
instrument, bank 0 programs 0..127 then bank 1…) and SFZ (one `.sfz` per
instrument beside copies of the WAVs it uses, plus `index.txt` mapping
program → file — SFZ has no native program-per-file mechanism, so that's
as close as it gets to "one bank"). Either loads in any DAW/sampler, no
Night Roll involved. Both carry key/velocity ranges, root key + fine
tune (fractional key → semitone + cents), pan, gain, loop points, and the
envelope's ADSR summary (attack/decay/sustain/release, as SF2 timecents
or SFZ seconds). SFZ additionally gets the driver's exact envelope shape
through ARIA's flex EG (`eg1_*`, from `envelope.points` + `releaseCurve`)
— a bonus for players that honour it, not a guarantee. What neither
format can express: the exact multi-point shape in SF2 (only the ADSR
summary), the release curve's "resume from whatever level the key was
released at" behaviour (`play.mjs`'s `timeAtLevel`), or an envelope
repeat window (`envelope.repeat`) — all silently approximated by the
ADSR summary. `--used-only` drops instruments no captured song plays
from both formats; without it they're still written (so nothing extracted
is lost) but the SF2 preset list — what a DAW actually browses — is
always used-only regardless. A region with no sample in the rip
(`missing`) is skipped; an instrument left with no playable region is
skipped entirely. Levels are normalised per file (the loudest zone is 0 dB,
every other keeps its ratio — each driver's gains run on its own scale, and
SF2 can only attenuate); instruments are named by their measured name, the
id → name map sits in the SFZ index.txt; a squared velocity curve is not
expressed (both formats use their own). Tests: tests/instruments-export.test.mjs (a hand-built
library through a from-scratch RIFF/SF2 reader, plus the SFZ region
lines).

Step 3: a track in Josh's own song can use one of these instruments as
its voice. Voice id: `game:<vault folder>:<instrument id>` (e.g.
`game:goldeneye-007:rare:bank@0x2D1AB8:prog63`) — it rides the existing
`voice=` value of the `track:` directive, so it syncs/publishes like any
voice; the directive parser/serializer treat it as an opaque `\S+` token,
so the id's own colons ride along unremarked. Assigned from the voice &
color menu's **Game instruments ›** family — one shared navigation,
`renderGameInstNav(container, nav, opts)`, drives both it
(`buildGameVoicePicker`) and File → 🎛 Instruments… (`renderInstSheet`);
`nav` ({game, sub}) is each caller's own state, `opts` says how it draws
a row and what a leaf tap does (assign + audition for the picker,
audition alone for the sheet). Levels: games (+ an **Instruments in this
song ›** shortcut when the open song is itself a published PS1/N64 song
with a library) → a game's **All instruments (A–Z)** or one of its own
songs → a leaf list, built from the shared `instAlbums` / `gameSongRows`
/ `songInstrumentRows` / `usedInstrumentRows`. A song's own list orders
and labels by the song's own tracks when it's the one open (`"ch 3 prog
34 · Soft pad"`, matching a track's PS1/N64 capture-given fallback name
— `tools/psx/notes.mjs`/`tools/n64/notes.mjs`'s `ch N prog M[,M…]` —
against the instrument's `program`); otherwise, or for an unmatched
instrument, it's just the name, alphabetical (natural sort,
`usedInstruments`' rule — Josh, 2026-09-28: FF7's list, most-used-first,
"is just a giant list"). Tapping a leaf assigns + auditions once.
Playback (`scheduleGameNote` in index.html, beside `scheduleNote`):
`gamePreloadForSong` (mirrors `sfPreloadForSong`, called from
`finalizeNotes`) fetches every game voice's library and the samples its
track's notes need; `gameWaitForSong` (mirrors `sfWaitForSong`) gives
that a capped wait before `play()` starts. Each note renders through
`tools/instruments/play.mjs`'s `playNote` at the note's pitch, with
velocity and duration bucketed (8 / 50ms) for the render itself — so a
cache hit is an exact repeat, not noise — and the rendered AudioBuffer
itself is cached (`gameNoteCache`, same `{ctx, buf}` shape and ~300-clear
policy as `chipPreviewCache`, so a repeat skips the render AND the
buffer copy, not just the render). Pan: the instrument's own `pan`/region
`pan` is ignored — `trackGain(ti)` already sits behind the track's own
panner, same as every voice. A drum kit instrument plays its slot at the
note's pitch — `playNote`/`regionFor`
handle a kit's key regions the same as a melodic instrument's. A missing
library/instrument/sample, or one still loading, never goes silent: it
falls back to the track's own auto (NES) synth voice, with one ⚠ per
(voice, reason) this session. Test: "game instrument voice: …" in
tests/night-roll.test.mjs.

**Reopening the menu drills back to the pick (Josh's Ambush report,
2026-09-29).** Before this, `openVoiceMenu` always reset the games picker
to the systems list, even when the track's current voice WAS a game one —
picking a Final Fantasy IV instrument, closing the menu, then reopening it
landed back at the top, not where he'd drilled to. `openGameVoiceMenuTo(ti,
voiceId)` resolves the current `game:` voice to `{sys, game, sub: "all"}`
(via `instAlbums()`, matching by vault) and jumps the already-open menu
straight to that leaf list; `openVoiceMenu` calls it right after its own
synchronous `buildVoiceMenu`, so the systems list shows for one frame before
the drill lands (async — it's a CATALOG/network read). Guarded against the
track's voice or the open menu having moved on by the time it resolves, the
same way `gameVoiceLabel`'s own async fill guards a stale rebuild.
`buildGameVoicePicker`'s `instrumentLabel` now marks the current row by
comparing **resolved vaults + instrument ids**, never the raw voice string
against a freshly-built one (`gameVoiceId` always uses the album's current
vault). The leaf row scrolls into view once drawn.

**Render races on the SAME popup (2026-09-29).** Three independent things
can each call `buildVoiceMenu()` on the one open `#voicemenu`: the initial
open, `gameVoiceLabel`'s own async label-refresh, and now
`openGameVoiceMenuTo`'s drill. The existing staleness guard
(`voiceMenuGameVault`/`Sub`/`Sys` compared against a frozen snapshot) only
catches a CHANGED nav — two renders landing on the SAME state (e.g. both
re-drawing the same leaf list) could both pass and both append, since only
`buildVoiceMenu`'s own synchronous entry clears the menu, not each async
continuation. `voiceMenuRenderToken` (bumped once at the top of every
`buildVoiceMenu` call) fixes this: `buildGameVoicePicker`'s `isCurrent`
check is just `voiceMenuRenderToken === renderToken`, strictly stronger
than the nav-state comparison it replaced, since EVERY navigation, pick, or
family switch already calls `buildVoiceMenu` again.

**Old vaults, from before the archive-by-console reorganization
(2026-09-29).** A `game:` voice picked before archive-by-console (game
files then lived at the archive root) has a vault with no console folder
("final-fantasy-7", "ff1.nsf"); every album's `nsf.vault` is now
`"<console>/<old vault>"` (e.g. `"ps1/final-fantasy-7/"`,
`"nes/ff1.nsf"`), so the old vault 404s against `instLibrary`. Never
rewritten (Josh's picks are his) — resolved at read time instead:
`resolveGameVault(idVault)` (async — an `instAlbums()`/CATALOG read)
returns `idVault` itself when it already matches an album directly
(already current, or simply unknown), else the vault of the `instAlbums()`
entry whose vault, with its console prefix stripped, equals `idVault`.
Every game-voice reader goes through it first — `gamePreloadForSong`,
`gameVoiceLabel` — except `buildGameVoicePicker`'s own per-row "is this the
current voice" check, which uses `resolvedGameVaultSync` (a sync read,
same "fall back to the id, fill in async, refresh once known" contract as
`gameVoiceLabel`/`sf2VoiceLabel`) deliberately: gating that render on a
NEW top-level await reopened the render-race above (an old vault's leaf
list would draw fine in isolation but not under the full test suite's
timing — the race was real, just narrow). `gameLibSync` and
`gamePreloadTokens` stay keyed by the voice string's ORIGINAL (possibly
old) vault throughout — only the actual `instLibrary`/`instSamples` fetch
URLs go through the resolved, current one — so `resolveVoiceInstrument`
(scheduleGameNote's own gate) keeps finding it under the same key it
parsed from `tr.voice`. Test: "game instrument voice: an OLD-form vault …"
in tests/night-roll.test.mjs.

Step 4: any SoundFont 2 (.sf2 — a fan-made game font, a better piano,
anything, 2026-09-28) loads the SAME way, its presets becoming track
voices alongside the extracted game libraries. `tools/instruments/sf2.mjs`
is a plain, browser-clean SF2 reader (no Node imports — the page loads it
the same way it loads `play.mjs`): `parseSf2(bytes)` walks the RIFF/sfbk
chunks and resolves the SoundFont generator rules itself (spec §7-9) —
within one level (instrument or preset) a zone's own generator overrides
its global zone's same generator, never summed; between levels the
instrument's absolute value and the preset's are ADDED (fineTune,
coarseTune, pan, initialAttenuation, the volume-envelope generators);
keyRange/velRange/sampleID/instrument/sampleModes/overridingRootKey exist
only at the instrument level, while a preset zone's own keyRange/velRange
instead NARROWS (intersects) the instrument zone's — how one preset
splits across several zones by key or velocity ("layers"). The result is
`{name, presets: [{name, bank, program, zones, keyRegions}], samples}` —
`zones`/`keyRegions` are model.mjs's own Region shape (keyLo/keyHi/rootKey
+ fine tune/sample hash/loop/gain/pan/envelope), and a preset object
carries `gain: 1, velocityCurve: "linear"` at its top so it doubles as a
play.mjs `inst` with no translation step. Loop is a per-ZONE decision
(`sampleModes` 1 or 3), not a sample-identity one — the same raw bytes can
be looped in one zone and one-shot in another, so the sample hash's tag
includes the effective loop, same as model.mjs's own `sampleHash`.
Rejected with a clear error, not a garbled render: SF3 (Ogg
Vorbis-compressed samples — its `smpl` chunk is shorter than the sample
headers say real PCM must be) and 24-bit samples (an `sm24` chunk).
Modulators (pmod/imod) are not applied (velocityCurve stays "linear",
same simplification `export.mjs`'s own SF2 writer already makes); a
stereo sample pair (two hard-panned zones, same key range) collapses to
whichever zone comes first — play.mjs picks exactly one region per note,
mono, same as any other borrowed instrument.

Storage: an imported SoundFont is a device-local asset the SONG depends
on, so it travels like the game files do — File → Import…'s byte sniff
(RIFF + `sfbk` at byte 8, ahead of a WAV's RIFF + `WAVE`) routes a .sf2 to
`importSf2File`, which parses it, keeps the raw bytes in this device's
IndexedDB (`idbSf2Put`/`idbSf2Get`, its own "sf2" object store — works
offline, no GitHub needed), registers it in a small on-device index
(`sf2Registry()`, localStorage — name + slug only, so the voice menu's
Soundfonts list doesn't have to open IndexedDB just to draw a title), and
— with a game files & instruments repo configured and a token on file —
pushes it to `soundfonts/<slug>.sf2` there too (check-before-PUT, same as
every other archive file this app writes), so it reaches your other
devices. Voice id: `sf2:<slug>:<bank>:<program>` (the slug is always a
plain `slugify()` token, so a strict 3-part colon split resolves it —
unlike a game instrument id, which can carry its own colons). Loading a
song that uses one: `sf2Font(slug)` tries IndexedDB first, else
`vaultFetch`-reads `soundfonts/<slug>.sf2` from the repo (caching it to
IndexedDB on success); missing or unreachable falls back to the track's
synth voice, one ⚠ per (voice, reason) — same contract as a missing game
library. Files over 50 MB ask first (an in-app sheet, "Upload to the
archive" / "Keep on this device only" — GitHub itself warns past 50 MB in
the Contents API); over 95 MB is refused outright (GitHub rejects past
100 MB) but stays fully usable on the importing device.

UI: the voice & color menu's **Soundfonts ›** family (`SF2_FAMILY`) is a
flat 2-level nav — a loaded font, then its presets (bank:program name,
natural sort) — its own small `renderSf2Nav`, in the SAME calling
convention as `renderGameInstNav` (rowFactory/onNavigate/isCurrent/
backLabelAtTop) but not sharing its level logic: a soundfont has no
per-song "used in" concept to browse by, only presets, so there is no
shared LEVEL behavior to parameterise, just a shared STYLE. A tap assigns
+ auditions once, exactly like a game instrument pick.

Playback reuses the game-voice path rather than duplicating it: a
resolver (`resolveVoiceInstrument(voice)`) returns `{inst, samples}` for
either a `game:` voice (from `gameLibSync`) or an `sf2:` voice (from
`sf2Sync` — a parsed font's `presets`/`samples` already ARE that shape),
and `scheduleGameNote` — its caching, its AudioBuffer reuse, its synth
fallback — calls that resolver instead of hard-coding `game:` lookups.
`gamePreloadForSong`/`gameWaitForSong` warm both kinds the same way; a
soundfont has no per-pitch lazy sample fetch the way a game library does
(`instSamples`) — the whole file is one download, so `parseSf2` already
decoded every sample it could need, and preloading is just "fetch + parse
once, remember it under its slug." Tests: tools/instruments/sf2.mjs's own
parser round-trip + a hand-built font with global zones and preset
offsets (tests/instruments-sf2.test.mjs); "soundfont:"/"soundfont voice:
…" in tests/night-roll.test.mjs (import routing + storage, the directive
round-trip, playback through play.mjs, the missing-font fallback).

SNES (`tools/instruments/snes.mjs`, 2026-09-28): a `.spc` is only the
sound chip's own state (64 KB ARAM + DSP registers) — no game-exposed
instrument table like PS1's INSTR.DAT or N64's tuning float, and every
game's driver maps its own instrument numbers to the chip differently,
so the driver is never parsed. An instrument is one SAMPLE, identified
by its decoded BRR content hash (`sampleKeyOf`), NOT by the per-song
SRCN number that happened to point at it — a `.spc` is one song's own
independent ARAM snapshot (nothing like PS1/N64's shared RAM/ROM), so
the same sample commonly loads at a different SRCN in every song that
uses it. Every song in the album is captured first, offering samples
and collecting key-ons into one shared bucket keyed by that hash
(`snesSong`); only once every song is in does `finishSnesAlbum` build
an instrument from each hash's full, album-wide key-on set. Its
envelope is the (ADSR1, ADSR2, GAIN) the MOST of its key-ons used
across the whole album (`chooseEnvelope`, ties by total note-seconds);
every other combination it was ever keyed on with travels as
`raw.envelopeVariants` — nothing is lost, but a driver that rewrites
ADSR per note (Rare's DKC engine does this constantly) doesn't fragment
into one instrument per note or per song the way naive grouping did at
first (703 "instruments" from 59 samples on DKC keying by (SRCN,
ADSR/GAIN); merging envelopes but still keying by a song's own SRCN
got that to 274; keying by sample hash instead — this rule — gets it to
64, next to its actual 59, with the per-song SRCN numbers kept for
reference in `raw.srcnBySong: {songTitle: [srcn, …]}`). rootKey is the
sample's own measured pitch (`tools/spc/notes.mjs` NSDF autocorrelation
on the decoded BRR audio — the only ground truth, since the driver's
intended note is never exposed), refined by averaging every key-on's
own implied root back out of its played P, across every song that
plays the sample; a spread > 10¢ across an instrument's key-ons is
flagged (root estimate likely wrong-octave, or genuinely retuned per
note). Drums: a sample keyed on with one exact P over a clear majority
(≥ half, ≥ 8 notes) of its key-ons, album-wide, never varies pitch
there — those key-ons become a `"drum-kit"` instrument (one fixedPitch
region, exact P, not rounded); the sample's remaining key-ons, if any,
are its melodic instrument — a drum use and a melodic use of the same
sample stay separate (ids `spc:<hash8>:drum` / `spc:<hash8>:inst`). No
velocity register on the S-DSP: a key-on's own VOL L/R (0..127) stands
in for velocity 1:1; pan (also VOL L vs R) is left out, a performance
fact per song, not an instrument property. Verification (`verify.mjs`'s
`verifySnes`): a synthetic one-voice DSP log (KON at sample 0, KOFF at
the note's real hold) against the same song's captured ARAM, compared
to `play.mjs` — matched to the library by the same content hash (a
song's own SRCN is never part of the instrument's identity); a picked
note using a variant envelope is held to ITS OWN variant, not the
instrument's chosen one. What "pitch" means for noise: `compare()`'s
autocorrelation-based pitch check falls back to spectral centroid when
it finds no clean period (noise-like percussion, or a one-shot drum
sample's natural end landing inside the analysis window) — that isn't
a meaningful "wrong pitch" the way it is for a tone, so those rows are
held to shape/level only, not the 5¢ bar.

PS2 (`tools/instruments/ps2.mjs`, 2026-09-29): every PSF2 song
(`tools/ps2/capture.mjs`'s own `ps2Song()`, either driver) through the
exact `vab.mjs`/`instr.mjs`/`spu-render.mjs` readers PS1's own VAB path
already uses — both Sony's HD/BD and Square Enix's own WD `toBank()`
(`tools/ps2/hd.mjs`, `tools/ps2/wd.mjs`) reshape into `vab.mjs`'s own
`{programs, vags, body}` bank shape, so this module has no PS2-specific
render math anywhere. Unlike PS1 SEQ/VAB (one bank shared by the whole
game), PS2's bank is per-SONG — Sony's driver loads a fresh HD/BD pair
per mini (Dark Cloud's own `psf2.ini`), and even Square Enix's own WD,
though often shared by several BGMs, is never one album-wide table — so
a program NUMBER is only ever a per-song accident of that bank's own
layout, the same problem SNES's own per-song ARAM snapshot has. An
instrument here is therefore identified by CONTENT (its region set's
sample hashes, key ranges, gains, pan — `sigOf`), not by (bank,
program): the id itself carries that signature, so the same instrument
met in two different songs' banks — even from two completely separate
bank objects — is one library entry, not two (a VAG's own content hash
walks its raw SPU-ADPCM bytes to its own end-flagged block, the same
self-terminating rule `decodeAdpcm()` already uses, so loop points —
in-band — are part of the same hash with no separate tag needed).
Percussion: `tools/psx/notes.mjs`'s own `isDrumProgram` (several one- or
near-one-key tones on different samples), reused unmodified — the exact
rule `seqNotes()` already applies per note for any VAB-shaped bank, PS1
or PS2. A drum program's tones become kind `"drum-kit"`, one region per
KEY the tone's own range covers (not one region per tone — the same
"per-slot" shape `psx.mjs`'s own `addKit()` builds for AKAO's drum
table, so `name.mjs`'s per-slot note counts line up), `fixedPitch` at
the tone's own center/fine-tune — read straight from the bank's own key
splits, no driver table needed. Sample rate: Sony's HD/BD carries each
sample's own real rate (`hd.mjs`'s `vagInfos[].sampleRate`, 22050-44100
Hz on real Dark Cloud files, threaded through as `vags[].rate`);
Square Enix's WD has no such field (its VAGs always play at the fixed
44100 Hz, same as PS1) — a sample's `rate` in the library falls back to
44100 exactly when `spu-render.mjs`'s own `vabVoices()` would. Verified
(`ps2.mjs`'s own `verifyPs2Song`, a smaller verify.mjs-style check kept
in this module rather than added to verify.mjs's own driver dispatch —
same math, smaller surface on a large, already-tested file) against
real Dark Cloud and Final Fantasy X rips: pitch within a cent, envelope
shape correlation 1.0, level within 0.14 dB once a note's own channel
volume/expression (a performance fact, deliberately left off the
instrument) is folded into the comparison the same way `renderSpu`
folds it into the driver's own render. Real rips (2026-09-29): Dark
Cloud (Sony's driver) — 59 songs, 230/233 instruments used (45 kits),
590 samples, 0 skipped, 0 missing regions; Final Fantasy X (Square
Enix's driver) — 92 songs, 660/662 instruments used (0 kits — its own
tones' key ranges run wider than `isDrumProgram`'s 3-key rule, a file
fact, not a gap in the rule), 2304 samples, 0 skipped, 0 missing
regions. Both export to a valid SF2 (`export.mjs`, `sf2.mjs` parses it
back) with no PS2-specific code in either — the driver-neutral library
format already carries everything they need.

NES + Game Boy (`tools/instruments/nes.mjs`, 2026-09-28): both chips are
pure synthesis — pulse, wave (the NES triangle; a real 32-sample
wavetable on Game Boy), noise — so there is no bank to read at all (not
even SNES's ARAM) and no instrument-number table to avoid parsing: the
"instrument" is derived entirely from register facts the existing,
tested note reconstructors already expose (`tools/nsf/notes.mjs` /
`tools/gbs/notes.mjs` `reconstruct()`: channel, duty, `vol`/`volEnd` for
a software envelope, `waveCycles`/`lfsr7` for GB wave/noise), plus one
small supplementary scan of the same register log (`traceReg`) for what
`reconstruct()` leaves out because it's ambiguous for a human reading
.notes.txt: the hardware envelope's own (period, loop) bits, and — for
GB wave — the 32-nibble wavetable actually in RAM at trigger time.
Identity: channel + duty (pulses) + the SHAPE of the volume-over-time
curve — a note's level 0..1 for its first 16 frames, normalised so its
own onset = 1 (a note's absolute starting volume is a performance fact,
carried by its velocity, exactly the same separation PSX/N64/SNES make).
Clustering is a SIMILARITY merge (`clusterByShape`), not exact match: a
first version quantized the curve coarsely (nearest 0.1) and clustered by
exact string equality, on the theory that a frame of jitter shifts a
decay step far more often than a driver program genuinely changes — but
a review of the first real numbers before commit (Contra 175 instruments
from 11 songs, Castlevania 228) called it: the quantization grid was
still too fine, AND exact-match itself could only ask "is this
identical", never "is this close enough". Now: within each (channel, duty) group, exact-curve dedup
first (cheap, and gives the "how common is this shape" count the next
step needs), then greedy in descending count order — a shape joins the
FIRST existing cluster whose seed curve it matches at Pearson correlation
≥ 0.97 AND mean absolute difference ≤ 0.08 (both, not either: a flat
curve's correlation against anything is undefined by convention, scored
1 so it defers to the difference test rather than refusing to merge — an
early version of THIS scored it 0 instead, which is what left a genuinely
flat pulse split from a barely-decaying near-copy of itself at a mean
difference of 0.03, well under the bar), else starts a new cluster. Once
merging is done, each cluster's envelope comes from its TRUE medoid — the
distinct curve among those that built it, weighted by how many notes
each represents, with the least total distance to every other — not
whichever note happened to seed the cluster or hold longest. Because a
cluster's membership is now a similarity merge rather than a pure
function of one note's own facts, verify.mjs can't recompute an
expected instrument id independently the way SNES's verify recomputes
sampleKeyOf's; instead it finds the best-matching instrument by curve
(`curveFromEnvelope` resamples a stored envelope back to the same
16-frame shape; matched by the SAME two-part test, mean difference
breaking ties among correlated candidates) — see verify.mjs's own header.
Every song's facts are collected into one shared bucket first (mirrors
snes.mjs's two-phase shape), and NES noise / GB noise are always kind
"drum-kit" (one fixedPitch region at the period/shift + mode/width the
album played it at). The "sample": one cycle-accurate loop so play.mjs
needs no new code — pulse: a single-cycle asymmetric on/off square at
the duty's exact percentage, through the SAME DAC law apu-render.mjs's
mixer applies (`pulseLevel`/`noiseLevel`: NES's mixer is concave, not
linear vol/15) and AC-coupled (a duty's real asymmetry — a narrow duty's
louder peak, quieter RMS — survives, not a plain symmetric ±1 square);
triangle: the chip's own 32-step staircase through its own (also
nonlinear) DAC curve. Both share one `ROOT_KEY`/`SAMPLE_RATE`: a
synthesized oscillator has no native pitch to get wrong, so instead of
fitting a root per instrument (SNES's job, for real recordings) every
32-sample loop uses the exact key at which `SAMPLE_RATE/32` IS that
key's frequency — resampling then reproduces any target frequency
exactly, not approximately (verified: `nesPeriodForKey`/
`gbPulsePeriodForKey`/`gbWavePeriodForKey` round-trip). GB wave reuses
the same relationship, but its 32 samples ARE the real captured nibbles,
content-hashed like a SNES BRR sample, because two songs can and do
reuse the same wavetable. Noise: one-shot, `fixedPitch`, the LFSR
literally simulated at the captured period/width; rootKey = fixedKey so
playback never resamples it. GB's mixer additionally scales every
channel by its own NR50/NR51 (master volume + panning) — a song fact,
not this instrument's — so GB samples bake in the reference gain a full-
stereo, max-volume song defaults to (`GB_REF_GAIN`), the same way pan is
left out elsewhere. Envelope points: the cluster's medoid note's own
observed curve, its longest-held member (raw driver writes for a
software envelope, the simulated hardware-envelope decay otherwise, most
real data either way), normalised to 1 at onset same as the clustering
curve — an earlier version stored the representative note's own
unnormalised level and double-counted its accent against velocity, since
fixed. Release: every channel here cuts
essentially at once at key-off (a driver just disables the channel or
zeroes it) — `releaseCurve` is a flat 5ms exponential throughout.
Verify (`verify.mjs`'s `verifyNes`/`verifyGb`): a picked real note's own
onset registers replayed alone through `renderApu`/`renderApu` (NES/GB
already keep every channel in its own buffer, so no isolation trick
beyond "no other channel is ever enabled" is needed) against the SAME
note played from the library — at the ROUNDED key's own period
(`nesPeriodForKey` etc.), not the raw captured one, so semitone
quantization (a captured frequency is essentially never an exact
semitone of A440, and reconstruct() rounds to one anyway) doesn't read
as a pitch bug; with a release write at the hold boundary so a still-
sounding driver is never compared against an already-releasing render.
Checked against 3 real NES albums and 1 GB album (Mega Man 2, Contra,
Castlevania, Link's Awakening): pitch is reliably within a few cents;
shape correlation for an as-played note is good (0.8–0.99) for most
picks but lower for one whose own decay differs from its cluster's
medoid, or for extrapolating a software-envelope instrument 2 seconds
past a note only ever observed for a fraction of a second — expected
variance from choosing one representative per cluster, not a bug (tests
assert the MEDIAN across several picks, not every one; the similarity-
merge rewrite barely moved these medians — MM2 0.90, Contra 0.75,
Castlevania 0.67, Link's Awakening 0.91 before and after — because the
DOMINANT curve in a group was usually already the pick either design
would have chosen; what the rewrite fixed was instrument COUNT, not
per-note fidelity). Counts, total (melodic/kits), before the
similarity-merge rewrite → after: Mega Man 2 140 (86/54) → 109 (57/52);
Contra 175 (167/8) → 123 (115/8); Castlevania 228 (190/38) → 164
(126/38); Link's Awakening 111 (98/13) → 88 (75/13) — the exact-
match bug (see above) was really two bugs, a too-fine quantization grid
and a correlation formula that flatly refused to compare a constant
curve against a near-constant one; fixing the second alone (before even
touching thresholds) is what did most of this work. Contra, Castlevania
and Link's Awakening still sit above ~60 melodic instruments — checked
by hand (a handful of pulse-channel groups on each), and it's real
variety, not fragmentation: e.g. Contra's pulse1 duty-75% notes include
curves from flat-at-full to decaying to 14% to a RISING envelope
(values above 1.0, an attack shape) with correlations against the
dominant curve ranging −0.72 to 1.0 and mean differences from 0.03 to
2.96 — a rich, varied instrument program across 11 songs' worth of
music, not a clustering defect; loosening the 0.97/0.08 bar further
risks merging genuinely different envelopes together, which is the
thing this whole feature exists to keep apart. What doesn't fit: NES
DPCM (a real sample channel) — the
2A03 capture (`tools/nsf/nsf.mjs`) never logs $4010-$4013 in the first
place, so no capture this module has seen carries DPCM facts to
extract; a future capture adding that would need real sample extraction
like PSX/N64, not this module's synthesis (open-items.md). An NSF using
an expansion chip (VRC6/VRC7/FDS/MMC5/N163/5B) is rejected by the
capture itself (`nsf.mjs`'s documented refusal), same as everywhere else
in this repo — Gimmick, Just Breed and Lagrange Point in the archive all
skip this way. GB pulse/noise's envelope is a plain multiplicative scale
over a fixed on/off sample, which is exact for NES (off is always 0) but
only approximate for GB at low volume (the DMG DAC's "off" state is
dac(0) = −1, not 0, independent of the current volume — a minor timbral
softening at quiet accents, not fixed).

## Stereo — pan per track (2026-09-28)

Josh: "are we getting … stereo information?" — pan was read and never
applied. Three layers, all optional per song:

- **The .mid carries pan.** A chip capture's MIDI writer emits each
  channel's pan as CC10 at the track's start (the N64 drivers' `pan`
  fact, PS1 AKAO's pan op); `parseMidi` keeps it as `track.midiPan`
  (−1 … +1). Nothing in the roll changes; the track menu's pan fader
  starts there.
- **The `track:` directive's `pan=`** (−1 … +1) overrides it — the
  fader under the volume in the voice & color menu writes it on
  release, exactly as `vol=` (`saveVoices`); `finalizeNotes` applies
  it; `trackPan(ti)` = directive, else midiPan, else 0. Written as 0
  too, so centring an imported track sticks.
- **The audio graph**: `trackGain(ti)` → a `StereoPannerNode` per
  track (`trackPanners`, pan = `trackPan`) → master; `updateTrackGains`
  moves it live. Synth notes pan there. Chip audio: a renderer may hand
  back a stereo pair `{l, r}` per track instead of a mono Float32Array
  (`chipIsPcm`); `chipBuffers` makes a 2-channel AudioBuffer, the
  worker transfers both halves, `chipSilent` checks both. The pair
  passes through the centred panner unchanged; a `pan=` on a chip
  track pans on top. Pan law in the renderers: equal-power, −3 dB per
  side at centre, so the mono sum keeps its level.

Test: "pan: the track: directive and the .mid's CC10 …" in
tests/night-roll.test.mjs; the renderers' own tests cover the pair.

## Mixer — a real DAW mixer window (open-items.md DAW CONVENTIONS REVIEW
item 11, 2026-09-30)

"a mixer with every channel side by side (fader, pan, M/S, a level meter)
and drag-to-reorder tracks" (advisor round, 2026-09-29). `#mixersheet`
(`renderMixer` in index.html) is a `makeWindow("mixersheet", {dockable:
true})` window — Dock left/right/bottom like any of the six other migrated
windows (Window manager, above); View ▾ → 🎚 Mixer or the hardware key
<b>X</b> (Logic's mixer key, guarded the same way K/C/R already are — not
while typing) call `toggleMixer()`. `#mixerstrips` holds one
`.mixerstrip` per `song.tracks[ti]` plus a `.mixermaster` strip, laid out
in a single row that scrolls HORIZONTALLY INSIDE the window (`overflow-x:
auto` on `#mixerstrips`, not on `#shell`/the page) — the phone-width
requirement from the DAW review.

- **Nothing new to persist.** A strip's fader/pan write `tr.vol`/`tr.pan`
  live on `input` (same 0–1.5 / −1…1 ranges as the voice & color menu's own
  fader/pan) and `saveTrackDir(ti)` on `change` — the exact function the
  voice menu and the track chips' M/S/H already call. `mixerStripEl(tr,
  ti, canReorder)` builds the DOM once per `renderMixer()`, no separate
  state shape; a fader/pan/M/S/H change re-renders the whole Mixer (cheap:
  a handful of tracks) rather than patch just the one strip, the same
  tradeoff `renderTrackbar()` already makes.
- **Meters.** An `AnalyserNode` per track, tapped AFTER `trackGains[ti]`
  (`trackGains[ti].connect(an)` — a second destination; `connect()`
  doesn't remove the node's existing route to its panner/master, so
  tapping never changes what you hear) plus one on `master`. Built lazily,
  ONLY while `#mixersheet` has `.on` (`ensureMixerMeters`, idempotent —
  safe to call from the meter loop itself, a track added mid-session, or
  `ensureAudio()` finally firing on the first tap after the Mixer was
  already open) and torn down the instant it closes
  (`teardownMixerMeters`, hooked into `SHEET_TOP`'s existing closing
  branch — the same choke point that already stops a live 🎤 dictation, so
  ✕/backdrop/Esc/re-docking all tear the meters down, not just
  `closeMixer()`). `ensureMixerMeters` also calls `trackGain(ti)` itself
  (idempotent) so every strip gets a meter the moment the Mixer opens, not
  only the tracks that have already played. RMS at ~30fps
  (`mixerMeterLoop`, a `requestAnimationFrame` loop throttled by
  timestamp delta, not a `setInterval`) sets each `.mixermeterfill`'s CSS
  height. `mixerMeterRunning` (not "is the rAF id truthy") is the loop's
  own on/off flag — a real `requestAnimationFrame` id can be validly 0,
  and the vm harness's inert stub always returns 0, so id-as-boolean would
  re-schedule a duplicate loop on every call.
- **Track reorder — the .mid's own order.** `reorderTrack(from, to)`
  drags a strip (by its name — future: a track chip too) to move
  `song.tracks[from]` to index `to`, i.e. this changes playback/export
  order, unlike mute/solo/color/pan/hide which live in the name-keyed
  `track:` annotation and never depend on array position. Only on
  `editableSong()` — a capture or a published-not-local song has no drag
  handler on its strips at all, so the order shows read-only, per spec.
  ONE ⟲ step: a full snapshot of every `ti`-indexed array a reorder
  touches — `song.tracks`, `trackState`, `trackGains`, `trackPanners`,
  `song.rawNotes` — shallow (`.slice()`; no note array is cloned, just the
  per-track SLOTS) and reused as-is for undo/redo (`applyEditEntry`'s
  `"trackReorder"` case just reassigns the four arrays from the stored
  snapshot, rather than re-deriving the move), the same LIFO trick
  `trackRemove`/`trackInsert` already lean on (`addTrackUndoable`'s own
  comment): nothing OLDER on the undo stack is reachable until THIS entry
  is undone first, so an older entry's own `ti`s are still valid once that
  happens. `selTrack`/`selNote.ti`/`selClip.ti` are remapped (not just
  cleared) so the selection follows its track across the move; `multiSel`
  (transient lasso selection) is safely cleared, same as every other
  track-structure change. `saveDraft()` runs directly inside both
  `reorderTrack()` and the undo/redo branch (not left to `saveEdits()`,
  whose own `saveDraft()` call is composition-only) — reorder is spec'd to
  work on a local draft too (`isLocalDraft()`), and `saveDraft()` itself
  already no-ops for anything that isn't a composition or a local draft.
- **`ti`-indexed state found while building this, and how reorder handles
  each:** `trackState`/`trackGains`/`trackPanners` — REWRITTEN in
  lockstep (`moveInSameOrder`, a splice-move: remove at `from`, reinsert
  at `to`; self-inverse via `moveInSameOrder(arr, to, from)`) and also
  captured whole in the undo snapshot; `song.rawNotes` — same, when
  present; `selTrack`/`selNote.ti`/`selClip.ti` — REMAPPED (not cleared)
  via a small `ti => …` closure so the user's selection stays on the same
  track; `multiSel`/`multiSelKey` — SAFELY CLEARED (lasso selection is
  transient everywhere else in the app too); `editUndo`/`editRedo` older
  entries — left alone (the LIFO argument above); `pendingEdit`, `selNote`
  set mid-drag, `recTake` — none of these can be live during a Mixer
  strip drag (no note-edit or recording gesture runs at the same time as
  a pointer-drag on a Mixer strip's name), so they're untouched by design,
  not by omission.
- **Tests** (`tests/night-roll.test.mjs`, "Mixer …"): strips reflect
  tracks (fader/pan/M/S/H write `track:` as one ⟲); reorder is one ⟲,
  refuses on a non-editable song, and keeps voice/color with their track
  by object identity (not swapped in place); meters build nothing while
  closed and tear down on close; View ▾ and the hardware key X both
  toggle it; a source-string check that `#mixerstrips` (not the sheet or
  the page) carries `overflow-x: auto`. FEATURES keywords "Mixer window",
  "Drag a strip by its name". The vm harness's `innerHTML = ""` now
  clears `.children` too (a real assignment replaces the subtree) —
  needed once Mixer tests re-render and re-query the same container
  twice; one pre-existing instruments-sheet test that had worked around
  the old stale-children behavior (its own comment named the bug) lost
  that workaround since it's no longer needed. `createAnalyser()` was
  added to both `tests/harness.mjs`'s and `tests/e2e/helpers.mjs`'s
  fake `AudioContext` (silence in, silence out — `getByteTimeDomainData`
  fills 128, the DC midpoint).

## PlayStation chip audio — the console's own samples (2026-09-27)

Josh, FF7 Opening ~ Bombing Mission against the OST: "they just don't
sound like the same instrument … hopefully the information should be
there." It is: the psflib carries INSTR.ALL, the SPU-ADPCM sample bank,
loaded contiguously into SPU RAM. `tools/psx/spu-render.mjs`:
`findSampleBank(ram, table)` finds the RAM offset where every
instrument's address lands on a valid block and an end-flag block sits
right before the next instrument's start (FF7: 93/93, base 0x800ef000,
first sample at SPU 0x1010); `renderSpu(result, {ram, table, bank,
sampleRate, keepSeconds, onProgress})` decodes each instrument's sample
once (`decodeAdpcm`; loop from the block flags or the table's loop
address), plays every note of the capture at SPU pitch
base[key % 12] × 2^(floor(key / 12) − 6) (VGMTrans's rule: degree 0 at
octave 6 = the table's base pitch; not verified by ear per instrument —
autocorrelation and spectra disagree on these samples), through a
streamed SPU ADSR (`Envelope`: attack/decay/sustain/release with the
rate → shift/step math), at the score's velocity, linear interpolation,
mono and dry (no pan, no reverb, no in-note volume slides). Output: the
SNES contract — `{sampleRate, seconds, [name]: Float32Array}` with one
channel per MIDI track, named by `channelGroups(result)` (notes.mjs;
makeMidi now emits through the same helper, so names match). App:
`CHIPS.psf` gained `parse` (bytes + `src.libs`), `run` (chain → RAM →
AKAO → table → bank), `lead` (0), `render`, `renderRate` 44100;
`chipRender` passes `src` to parse, takes a chip's own `lead`, and reads
channel names off the render when `channels` is empty; `chipSource`
adds the session's `libs`; `chipRenderInWorker` ships them
(transferred copies); `tools/chip-worker.mjs` has a `psf` runner and
takes `libs`. Persistence (same evening): `CHIPS.psf.keepBytes` is true, so each
track's mini lands in the device's chip record like SPC's per-file
bytes, and the set's library is stored once per album in the same
record (`idbNsfPut(slug, null, {}, kind, libs)` from `impCapture`;
`rec.libs = {name: bytes}`). `chipSource` returns `libs` from the
record, else fetches them from the archive by `meta.nsf.libs`
(`[{name, file}]`, file = the slugified library name) and caches them.
`commitImports` uploads the library once per album (check-before-PUT,
`<slug>/<file>`) and writes `nsf.libs` into album.json. So after one
import + Publish, every device plays the PS1 songs with the console's
sound, like SNES. Not rendered yet: SEQ/VAB games. Test:
tests/psx-render.test.mjs (a synthetic rip: table, bank, one note).

**Volume inside a note (same day, later).** The driver moves a sounding
voice's volume — Anxious Heart's pad swells up over one bar and back
down over the next by expression fades (0xA9) under held notes. The
parser keeps each track's loudness as breakpoints and hangs the slice a
note sounds through on it (`n.gain`, ticks from the note's start; an
unrolled copy keeps the shape); `renderSpu` follows it sample by sample,
`vel` being that curve's start. Before this each note froze at its
note-on level: bar 1 near silent, bar 2 loud (Josh: "way louder … every
other bar"). Test: "renderSpu: a volume change inside a held note …".

**Pitch slides inside a note (same day, later).** 0xA4 slides the
sounding voice by N semitones over L ticks; a whole melody can ride one
held note (Cry of the Planet: a D held 37 bars, slid +7 +5 −4 −3 +2 −7
every eighth — the motif Josh found missing). `akaoNotes` hangs the
slides that fall inside a note on it (`n.slide`: tick offset, len, the
cumulative semitone target; the offset restarts at each key-on, an
assumption), before the loop unroll. `splitSlides` (tools/psx/notes.mjs)
turns such a note into one note per landed pitch for the MIDI and the
.notes.txt — the split is at the slide's start, so a long glide shows
its target from the moment it begins; the roll has no bend. `renderSpu`
bends the one voice per sample, no new attack. Bends are still counted
in `bends`; a channel whose bends fall inside no note says so. The N64
path still ignores its bends (capture warning "pitch bend"). Tests:
"pitch slides: …" in tests/psx-render.test.mjs.

## PlayStation captures: envelopes from the instrument table (2026-09-27)

Josh: "why isn't it looking at the instrument table?" Now it does.
`tools/psx/instr.mjs`: `findInstrDat(ram)` locates FF7's INSTR.DAT in
the assembled RAM by shape (64-byte records — u32 SPU address, u32 loop,
8 ADSR bytes ar/dr/sl/sr/rr/a-mode/s-mode/r-mode, twelve u32 base
pitches — a run of ≥ 16); `readInstr` reads a slot; `envelopeAt(rec,
seconds)` is the SPU's ADSR as psx-spx states it (rate → shift/step,
exponential decrease scales the step by level) through decay and
sustain, attack taken as instant (FF7's table: ar 0 everywhere). FF7's
table sits at 0x80166000: 93 slots used; most sustain (sr 0x7f), the
bells fall (47: sr 0x3b → 8% in 3 s). `akaoNotes(akao, {instr})`
carries `{ram, offset}`; `makeMidi` writes each melodic note's `ve` as
its own instrument's level at the note's end (polyphonic aftertouch,
the convention chip captures use), so a bell rings and fades and a pad
holds. Only when no table is found does a generic decay apply (long
notes → 12%), and the warnings say so. The dumper prints the table's
address. Test: tests/psx-instr.test.mjs (synthetic table by shape; a
sustaining and a bell envelope).

## PlayStation captures: percussion by rhythm (2026-09-27)

Josh, FF7 Bombing Mission on the iPad: "all the correct notes are there
in the right timing but there's some other noise going on". Two causes,
both in tools/psx/notes.mjs → `kitify(result)` (called by `makeMidi`,
so the CLI and the app agree): AKAO drum-mode notes carry degree keys
24–35, which the app's kit (and any GM player) reads as twelve kicks;
and FF7's kit sounds are mostly ordinary programs played at one pitch
(hi-hat = program 36 at 72–79 in 24 songs; a 90-song survey is in
open-items). Rules, per song, no game table: a note in drum mode is
percussion, and so is every note of a program that appears in drum mode
anywhere in the song; a program played at exactly one pitch over ≥ 12
notes is percussion (two pitches is an ostinato — Bombing Mission's bass
runs on two, and stays a bass); each percussion voice (program + source
key) gets a GM key from its rhythm — backbeats → snare 38, downbeats →
kick 36, the busiest rest → closed hat 42, open hat 46, ride 51, toms by
source pitch, a sparse voice on beat 1 → crash 49. A VAB kit already in
GM range keeps its keys. The guess lands in `result.kitGuess` and in the
capture's warnings ("kit guessed from rhythm: prog 37 K71 → snare, …"),
so a wrong guess is visible in the row's ⓘ. N64 sequences already put
drums on channel 10 with GM-ish keys (50–59); untouched.

## PlayStation 2 import (milestone 3, 2026-09-28)

PS2's PSF2/minipsf2 is PSF's container reshaped as a small virtual
filesystem (`tools/ps2/psf2.mjs`: a directory of 48-byte entries, files
as a per-block zlib table) instead of PS1's flat RAM image — so there is
no `assembleRam` step; the mini + its `.psf2lib` merge into one file
list, `tools/ps2/capture.mjs`'s `ps2Song()` picks the driver from the
FILES THEMSELVES (no per-game table): a mini's own `psf2.ini` (a literal
command line, `-s=/-h=/-b=`) is Sony's stock driver, a `.bgm` file is
Square Enix's own driver. `CHIPS.psf2` (index.html) mirrors `CHIPS.psf`
almost line for line — magic `PSF`+0x02, `.psf2` ext, `perFile`/`tagged`/
`keepBytes`, the same `capture`→bar/beat/loop math, the same
`PSX_SOUNDING_ON` flag (not a separate one) — because BOTH drivers reuse
PS1 SEQ's own event shape byte for byte (`tools/ps2/sq.mjs`'s own header
comment lists Sony's SQ differences: one-byte note-off, a "no delta
next" bit trick, a padded tempo meta, no time-signature meta, CC99 0/1
loop points; `tools/ps2/bgm.mjs`'s own header comment lists Square's own
BGM opcode table — 0x10-0x1A note variants, 0x20 program change, 0x5C
pitch bend, one-byte BPM at 0x08, no degree/length-index encoding at
all, NOT an AKAO variant as first guessed), so `tools/psx/notes.mjs`'s
whole note pipeline (`seqNotes`/`makeMidi`/`channelGroups`) runs over
either one unmodified. BGM's pitch bend is honored: `tools/ps2/bgm.mjs`'s
own `bgmNotes()` wraps `seqNotes()` and attaches each bend inside a held
note as a `note.slide` entry — the SAME representation
`tools/psx/akao.mjs`'s pitch-slide opcode already produces, so
`splitSlides()`/`renderSpu()` need no PS2-specific code either; the bend
range (±2 semitones) is an assumption, flagged in the warnings, since
nothing in BGM encodes a real one. Streamed-audio-only sets (Ico: GENH;
XIII: Ubisoft's SShd/SSbd) are refused BY NAME at import
(`streamedAudioMagic()`) before reaching any parser — neither format
ever carried sequence data to begin with.

Chip audio needed no new renderer: `tools/ps2/hd.mjs`'s and
`tools/ps2/wd.mjs`'s `toBank()`s both reshape their own bank (Sony's
HD/BD pair; Square's self-contained WD) into the exact object
`tools/psx/vab.mjs`'s `parseVAB()` returns, so
`tools/psx/spu-render.mjs`'s `renderSpu()` — unmodified, PS1's own tests
unaffected — runs over either PS2 format. SPU2's two 24-voice cores
turned out not to matter: the renderer never modeled discrete voices to
begin with. Real bugs turned up only once real audio was actually
rendered end to end (scratch/ps2-app-render.mjs), not from reading the
format docs: Sony's HD/BD (milestone 2) needed its per-sample native
rate threaded through (`toBank()` parsed it but dropped it) and its
panpot fields un-double-offset (every real program's panpot read exactly
64, which a true per-program *offset* would never do by default).
Square's WD (milestone 3) needed its unity-key byte read as SIGNED, not
unsigned (a real Final Fantasy X file's higher key splits carry raw
bytes past 127 — read unsigned, the derived unity key goes wildly
negative and the note's pitch ratio explodes, decaying to nothing within
a handful of samples: a whole track read RMS 0.0 until this was found by
rendering it); its pan byte is read as `raw & 0x7F` uniformly, NOT
VGMTrans's own `>127`-only formula, which collapses every raw byte 0-127
to a flat centre — real FFX regions carry genuine, varied pan bytes
below 128 too, which that formula would have discarded (CLAUDE.md "the
file wins"); and any BGM track past channel 15 that never sends its own
program-change opcode now gets an implicit program 0 at tick 0, matching
channels 0-15's own default in `tools/psx/notes.mjs`'s `seqNotes()`
(which stays unmodified — the default is supplied by `bgm.mjs` itself,
since one real Final Fantasy X song has 37 tracks and would otherwise
render one silent). All fixed; each has a regression test. Full
findings, the sweep numbers across all 92 real Final Fantasy X songs,
and what's still unverified: tools/ps2/INTEGRATION.md.

## Sounding-pitch offsets — the roll shows what you hear (2026-09-28)

The sequence consoles (PS1 AKAO/SEQ, N64 EAD and Rare) write the key the
composer TYPED into the roll, but some instruments' samples were recorded
an octave — occasionally two — from that key, so the console sounds a
different pitch than the roll shows (SM64 Title Theme inst 3/4,
INTEGRATION.md §9.3; Cave Dungeon inst 0/6, §9.6; Rare's keyBase-shifted
programs, §10.6). Josh's ruling: "the roll should show the sounding
pitch." `tools/sounding.mjs`'s `soundingOffsets(groups, renderOne)`
measures it — one held note per non-kit group (median played key, 1 s,
velocity 100) through the console's own renderer, f0 by normalized
autocorrelation over the sustained part (first 60 ms skipped, peak
correlation ≥ 0.8, an octave-only round — a few cents of tuning drift is
not this bug), a gap over two octaves reported as unclear rather than
applied (autocorrelation latching onto a harmonic, not the sample's
root). `applySoundingOffsets` shifts the WRITTEN field only (`pitch` for
PS1, `midi` for N64 — the note field the MIDI writer reads) and returns
one capture warning per shifted group ("ch 0 inst 0: written an octave
above what sounds — the roll shows the sounding pitch (−12)"); the
renderer's own fields (`key`, `semitone`) are never touched, so chip
audio keeps rendering exactly as before. Applied at CAPTURE time, in
`CHIPS.psf.capture` and `CHIPS.usf.capture` (index.html) — before the
MIDI is written, so `tools/import-set.mjs` (which runs the app's own
capture in the vm harness) gets it too, no second pipeline. Kit/drum
groups never shift (a kit's "pitch" is a slot index, not a note).

The one-held-note render (a one-note copy of the parsed sequence,
rendered by renderSpu/renderN64) is the same recipe the tap preview
already used (`previewOne`, 2026-09-27) — extracted into
`tools/note-preview.mjs` (`renderOneNote`) so the capture-time probe and
the tap preview share it rather than carrying two copies. The tap preview
now needs to convert back: it receives the ROLL's pitch (already
shifted), so it feeds the renderer `roll pitch − offset`. The offset
rides from capture to a live tap session as a per-track MIDI Text meta
event (`0xFF 0x01`, "sounding:-12" — unused elsewhere in this repo, so
not the track name, which stays the renderer's own group name for the
tap-preview/console-render name match); `parseMidi` reads it into
`track.offset`, `writeMidi` re-writes it on every save so it survives
edits and Publish (commitImports re-serializes a captured draft through
the same `writeMidi`), and `chipPreviewBuffer`/`previewOne` (chip-worker.mjs)
carry it through to the one held-note render.

Verified against the real rips (tests/n64-real.test.mjs,
tests/psx-real.test.mjs, N64_USF_DIR/PSX_PSF_DIR): SM64 Cave Dungeon ch
0/6 an octave below written (ch 7's DIFFERENT sample, tuning 0.281 not
1.0, measures unshifted at corr 0.98 — INTEGRATION.md §9.6 only computed
the fundamental for inst 0/6, so this is reported, not forced), Title
Theme inst 3 an octave below and inst 4 an octave above, Main Theme's
melody and Dire Dire Docks correct; FF7 "You Can Hear the Cry of the
Planet" prog 62 an octave above on all three of its channels. A full
survey (all 38 SM64 + 90 FF7 captures) found 36/204 SM64 groups and
409/1091 FF7 groups shifted — most FF7 programs' offsets repeat exactly
across every song that uses them (32 distinct programs shift, each at
ONE consistent offset everywhere it appears — prog 46 +12 in 35 songs,
prog 32 +12 in 24, prog 28 −24 in 14, prog 49 −12 in 14, etc.), which is
strong cross-song corroboration that these are real per-instrument
sample quirks in FF7's bank, not measurement noise — including on
Bombing Mission (prog 49/40 shifted), which disagrees with an earlier
informal spot check ("all 0") Josh should ear-check. Added time: ~0.4 s
per capture (one render + autocorrelation per non-kit group).

**The 2nd-harmonic guard, and why native PS1 ground truth is still
open (2026-09-28, the coordinator's review).** N64's numbers above are
checked against lazyusf2, a real player — PS1's were only checked
against OUR OWN renderSpu, so a renderer bug or an autocorrelation
error could put a wrong octave in the roll and nothing would catch it.
Tried: booting kode54's Highly Experimental core (scratch/
Highly_Experimental/Core — the engine behind foo_psf/Audio Overload)
directly from our own assembled RAM image (scratch/psf-ram-dump.mjs
reuses tools/psx/psf.mjs's loadPSFChain + assembleRam byte-for-byte,
scratch/psf2wav.c uploads it and runs psx_execute). It builds clean
(pure portable C, no dynarec) and boots — but `mkhebios_create()`
(the HLE BIOS synthesizer) turns out to need a REAL, copyrighted Sony
PS2 BIOS dump as its input canvas: its "pin tbin/pin sbin/pin iopboot"
steps extract genuine kernel modules from it by name
(`master_bios_modinfo` → `find_romdir`), which fails outright on an
empty buffer. Not attempting to get one. So: no native ground truth
for PS1 this round — the files above are left in scratch/ (gitignored)
for a future session that has a legitimately-owned dump.

Instead, hardened `soundingOffsets` against the specific failure a real
renderer bug would masquerade as: a bright/buzzy sample whose 2nd
harmonic outweighs its fundamental can make normalized autocorrelation
peak at HALF the true period even after the shortest-lag-first scan —
the harmonic's own periodicity is a clean, high-correlation peak, not
noise, just the wrong one. Fix in `autocorrelate`: after picking a lag,
check lag×2; if ITS correlation is at least as high (not just close —
a plain tolerance also over-fires on ordinary pure/simple tones, which
correlate just as well at 2× their own true period, an equality that
must NOT move the pick), prefer the longer period. Synthetic test:
a tone at key with a 3×-louder 2nd harmonic on top now measures offset
0, not +12 (tests/sounding.test.mjs). Re-run: SM64 unchanged (36/204,
N64 was never exposed to this failure mode); FF7 changed by 3 groups —
Bombing Mission's ch 10 (prog 55, +12) was exactly this false positive
and now measures 0; program 55 does not appear shifted anywhere else in
the catalog either, so the fix generalizes rather than papering over
one case. Ground truth still matches exactly (Cave Dungeon, Title
Theme, Main Theme, Dire Dire Docks, Cry of the Planet). Bombing
Mission's remaining disagreement (prog 49 −12, prog 40 +12) stands —
both offsets repeat identically in 14 and 9 other songs respectively,
which the guard does not explain away.

## Jobs (footer ⏳) — captures and publishes in the background (2026-09-27)

Design: docs/design/capture-jobs-design.md (advisor), generalized at Josh's ask —
"we need a general job system, and captures are just the first job".
A job is a plain record, no bytes, no DOM: `{id, kind, title, state:
queued|running|done|failed|cancelled|interrupted, items: [{label, st,
pct, msg, key}], note, started, ended, err, …extra}`; `jobs` in memory,
mirrored to localStorage `ff1roll-jobs` on every state change (pct
throttled 250 ms via `jobsSave()`; `jobsSave(true)` is immediate).
`JOB_KINDS[kind] = {label(job), open(job), retry(job)}` is the whole
kind contract. API: `jobStart(kind, title, items, runner, extra)` (the
runner gets `api`: `update(i, patch)`, `note(text)`, `done()`,
`fail(err)`, `cancel()`, `aborted`), `jobsFind(kind, slug, live)`,
`jobCancel(id)` (flips `aborted`; the runner ends the job),
`jobsDismiss`, `jobsClearFinished`, `jobsOnChange(fn)`, `jobProgress(job)`
("12/92 · Frog's Theme 40%"). UI: `#jobsbtn` in the footer beside ⚠
(gold + count while running, dim when only finished, hidden when none),
`#jobssheet` (`renderJobs`: Open / ✕ / ↻ per row, Clear finished). Boot:
`jobsLoad()` turns anything still running in the mirror into
`interrupted` (items too) and the boot line names it — this replaced the
sessionStorage capture beacon. Producers: **capture** —
`captureJobStart(ns, statusFn)` (Capture all = every track, a row's
capture = a one-item job; one capture job at a time); `impCapture(n,
api, i)` reports into its item and throws "cancelled" at the next
progress tick when ✕ was tapped; the panel's rows keep painting (the
panel is only hidden by ✕, `nsfSess` lives on); Open shows the panel
while `nsfSess.slug` matches, ↻ re-runs the items not `done` in the same
session and otherwise says to Import the same files again. **publish** —
`publishJobStart(slug, keys, statusFn)` wraps `commitImports` (its
status line is the job's `note`), one per folder at a time; Open opens
the publish dialog (below); ↻ re-publishes the drafts still there
(`impCommitLive` is gone). **publishall** — `publishAllJobStart(statusFn)`
wraps the Publish sheet's "Publish all": one item per `pendingSongs()`
— SONGS only since Terminal #111 (2026-10-04; see "Publish window:
songs vs chats" below) — same per-song flow as before (`commitCompositionNow` for the open
composition, `publishDraftSong` for another edited one, annotations +
`askCommitLog` otherwise) — just checked against `api.aborted` between
songs so ✕ stops it before the next one; one Publish-all job at a time
(`jobsFind("publishall", null, true)`); `#ghsaveall`'s click handler
starts it and opens the dialog. A Publish-sheet row's own **Publish**
passes `onlyKeys: [key]` — the same job, one item, titled "Publish
<song>". Each row also has **Open** (draft → `openDraft`, else
`loadSong`) and **Revert** (`revertSongToRepo`: appConfirm — the label
and body name what's being dropped, e.g. "Revert — drops 2 chat
messages" or "…your edits and 2 chat messages" — then `dropLocalSong`
— pushes the current state as a "Before going back" version first,
Model B below, then discards; hidden on a never-published song, which
has no repo copy). Revert drops EVERYTHING unpublished for that song,
chat included (Josh, 2026-09-30 — Revert used to leave unsaved chat
behind while claiming "this device now has the published copy"):
`askRevertToSaved(key)` truncates the song's local chat store back to
its first `saved` messages (exactly what `<song>.ask.md` already holds;
`saved` itself is untouched), same idea as `dropLocalSong` for
music/notes — no published chat (`saved === 0`) means this empties the
log, like Clear chat. Not jobs: Download audio (an offline
bounce, faster than real time — see "Audio export" below — or its
real-time fallback), chip renders (already off-thread; a row per song
open would spam the list). Later: captures in the worker.

**Publish window: songs vs chats** (Terminal #111, Josh 2026-10-04:
"don't want chat to show up in the count of the songs that need to be
published"; docs/plans/2026-10-04-publish-window.md). Two lists in
src/ui/chrome.js: `pendingSongs()` — songs with a dirty draft or
unsynced `ff1roll-notes-` — is the footer's **Publish (N)** and the
song rows; `pendingChats()` — `general`, `terminal`, then any song
whose ONLY pending item is chat — is the **Chats** section;
`pendingAll()` is songs then chats. A song with edits AND unsaved chat
is one song row (its "✦ N chat messages unsaved — ships with the song"
line; `publishSong` → `askCommitLog`), never listed twice.
`renderSyncPending` draws the songs, then `renderSyncChats`: a
`.pchats` block with a fold row (`.pchatstoggle`, "▸/▾ Chats (M)",
`aria-expanded`), a **Publish chats (M)** button at M > 1, and — only
when open — a `.psong.pchat` row per chat with its own **Publish
chat** (`askCommitLog(h, "ff1roll-ask-" + key)`). The fold is the
device-local pref `ff1roll-pubchats-open` (`PUBCHATS_OPEN_KEY`; absent
= folded — a UI toggle, never song state). **Publish all (N)** is
songs only (its `title` says so); `publishAllJobStart(statusFn,
onlyKeys)` filters `pendingAll()` when keys are named, so Publish
chats / one chat row run the same job — a chat key goes through
`askCommitLog`, never `publishSong` (a chat-only song has no
.rollnotes to write; "terminal" once got a terminal.rollnotes.json
that way). Labels: `pendingChatLabel` ("General chat", "Terminal
chat", "<title> chat"); a job of chats only is titled "Publish chats".
`#syncsheet` is a dockable window now (`makeWindow("syncsheet",
{dockable: true})`, `#syncsheet-h2`, `#syncsheet-home`,
`#syncsheet.docked #syncpending` scrolls); `#pubjobsheet` (the job
dialog) is registered `{dockable: false}` and `initWm1` purges a saved
dock for it (`wmPurgeId`, the moresheet purge generalized). A publish
started from the Publish window goes through `syncSheetRelease()`:
floating, it closes and the job dialog takes over; docked, it stays
(closing would collapse the dock mid-job) and re-renders as the job
runs. Tests: "Publish lists: …", "Publish window: songs first…",
"Publish all: …", "Window manager: the Publish window (syncsheet) is
dockable…" in tests/night-roll.test.mjs; tests/e2e/docking.spec.mjs
WINDOWS (syncsheet in, pubjobsheet out).

**One song, one motion (Josh, Terminal #112, 2026-10-04 — "when that's
done the whole thing should be done"):** a ONE-song job (a row's
Publish, `publishAllJobStart(fn, [key])`) does NOT release the Publish
window at launch — the dialog opens over it (`#pubjobsheet-home` sits
after `#syncsheet-home` in index.html so it paints on top and Esc
closes it first; no z-index rule) — and `pubJobOneMotion(job)`
(sheets.js) subscribes once via `jobsOnChange`: job `done` → the dialog
drops `on` (if it still shows that job), `syncSheetRelease()` (floating
closes; docked stays — a place, not a step — its list already
re-rendered without the song), and `setInfo("Published <song> ✓")`
since the window's own `#syncstatus` goes with it (the runner's summary
for a one-item job says the same, not "Published 1 ✓"). Any other end
state: nothing closes. Jobs keep their selection: `publishAllJobStart`
stores `keys` on the job (`jobStart`'s extra; null for Publish all), and
`JOB_KINDS.publishall.retry` re-runs `j.keys` (what is still pending of
them — everything pending only when the job had none) and re-arms the
one-motion close when the retry is one key. The dialog has
`#pubjobretry` (`renderPubJob`: shown when the job is over and not
`done` and its kind has a `retry` — the Jobs list's rule; the note line
falls back to `"⚠ " + job.err` for a job that failed before any item
ran, e.g. no token). Publish all / Publish chats are unchanged: release
at launch, the dialog stays until auto-clear. ⇪ Publish song's two
branches end in `syncPublishedOne()`: `setInfo` + the 900 ms
`syncSheetRelease` (+ notes list when `syncReturnToList`) — the
composition branch used to leave the window open. Test: "One song, one
motion (Terminal #112): …".

Auto-clear (2026-09-29): a job that ends `done` or `cancelled` calls
`jobsAutoClear(id)` from `jobApi`'s `finish()`, which `setTimeout`s
`JOBS_AUTOCLEAR_MS` (10 s) then dismisses it IF it's still in that state
(a `↻`/manual dismiss in between is a no-op on the stale timer). `failed`
and `interrupted` jobs never auto-clear — those are the ones to look at;
`jobsClearFinished()` (the sheet's "Clear finished" button) still sweeps
everything not running/queued by hand. `#jobsbtn` already hides at
`jobs.length === 0`, so it disappears on its own once the list empties.

Progress bars: `jobFraction(job)` — finished items (done/silent/failed/
cancelled) plus the running item's own `pct`, over the item count (0 if
running/queued with no items yet, 1 if already finished with none) —
drives a `.jobbar` (a `<div>` with one child `<div>` whose `width%`
`jobBarSet(bar, frac)` sets; self-healing — it appends the fill child on
first use if the markup didn't already have one, so a bar built fresh in
JS or read from static HTML both work). `renderJobs` draws one per row,
beside the existing `jobProgress` text; `#jobsbtn` does NOT show a
running job's percentage (left out: Josh's ask flagged it optional
"only if clean", and it would fight the existing "⏳ N" running-count
reading an existing test already locks in).

Publish dialog `#pubjobsheet` (Josh's ask, 2026-09-29: the old Open
"brought me to a weird page" — File → Open → that folder): one open
sheet, `pubJobShown` holds the id of the job it's showing.
`openPubJobSheet(job)` sets it and calls `renderPubJob()`, which reads
the CURRENT job from `jobs` (so `jobsOnChange` keeps it live while
open) — title (`job.title`, bare, no "Publish · " prefix), an overall
`.jobbar`, a row per item (`pjname` + a `pjstate`: a small `.jobbar.sm`
while `running`, else `pubItemIcon(it)` — `…` queued, `✓` done/silent,
`⚠ <msg>` failed, `✕ cancelled`/`⚠ interrupted`), the job's `note` line
(or `⚠ job.err` when there is no note — a job that failed before any
item ran), `Cancel` (`jobCancel`) shown only while running/queued,
`Retry` (`#pubjobretry` → `JOB_KINDS[kind].retry(job)`, Terminal #112)
once the job is over and not done, `Close` always
— the generic `.overlay` backdrop-tap/pinned-✕ close it too, and none of
those touch the job (closing never cancels). Opened by: `JOB_KINDS.publish.open`
and `JOB_KINDS.publishall.open` (so the jobs list's Open on either kind
lands here), the folder Publish button in `fsubImportAlbum` (closes the
File menus first — they sit at a higher z-index than `.overlay`), and
`#ghsaveall`'s click handler. Capture jobs are unchanged: `Open` still
shows the capture panel.

## Terminal import (tools/import-set.mjs) — 2026-09-27

Import → Capture all → Publish for a whole chip-music set, from the
terminal, so a batch of games lands in albums/ without a hand import per
game on the iPad. NOT a second pipeline: the script runs index.html's
inline script in the vm harness (tests/harness.mjs) and calls exactly
what a tap would — `openPickedFiles` (the picker's sniff: the chip file
plus every .m3u playlist, or a per-file .spc set), `captureJobStart`
(one job, every listed track, `impCapture` per row: the same secs
sizing, jingle rule, 300 s no-loop retry, loop: note, name-collision
guard) and `commitImports` (`writeMidi`, `serializeNotesList`,
`computeImportAlbumJson`). Four seams are stubbed because the vm has no
browser: the chip modules are imported from tools/ and handed to
`chipModules.cache`; IndexedDB is a Map (`idbNsfPutNow`/`idbNsfGet`);
`fetch` serves the albums/ tree on disk so a second batch into an album
merges album.json the way the app's GET does; `batchCommit` hands the
batch back and the script writes the files. The fake clock is swapped
for the real `setTimeout`. Titles, slugs, secs, loop notes and the
`nsf:` block are therefore the app's own — re-importing an album this
way and in the app gives the same files.

    node tools/import-set.mjs <zip|dir|file> --slug <slug> [--title "Game Title"]
                              [--console nes|snes|game-boy] [--publish] [--secs N] [--out <root>]

One line per track (n, title, ok/failed/silent, notes, seconds, loop
anchor → target, warnings), then the files written and, with
`--publish`, the archive uploads: the chip files go to cfg().nsfRepo
(Night-Roll-App/nsf-archive) at the paths `chipVaultFile` reads — `<slug>.nsf`
/ `<slug>.gbs` whole, `<slug>/<track-slug>.spc` per file — through
`gh api`, check-before-PUT, message "archive: <slug>". `--title` only
rewrites album.json's title (the app's Rename would do the same); the
manifest is rebuilt with build_manifest.mjs when writing into the repo.
The script downloads nothing and never writes a chip file under the
repo (*.nsf/*.gbs/*.spc/*.zip are gitignored). Captures are CPU work:
one process at a time, a per-game `perl -e 'alarm 1200; exec @ARGV'`.
Expansion-chip NSFs (header byte 0x7B: VRC6/VRC7/FDS/MMC5/N163/Sunsoft
5B) are refused by `parseNSF` — the 2A03-only capture of one is missing
its lead voices, and a half-song published is worse than none — and the
refusal surfaces as the import error both here and in the app.

## ✦ Ask — in-app AI (P1a + P2a + P3 shipped 2026-09-25; P2a's ✦ Fill button removed 2026-10-02 in favor of the write_notes tool, below; design: docs/design/local-llm-design.md)

The tutor half of the AI plan. `✦ Ask` in the top bar (hidden in listener
mode) opens `#asksheet`: a per-song conversation with any
OpenAI-compatible server. Code lives under `// ---- ✦ Ask (in-app AI)`.

- **Adapter:** `aiRemote()` — `listModels()` (GET `/v1/models`) and
  `chat({system, messages, signal, onDelta, schema})` (POST
  `/v1/chat/completions`, `stream:true`). `aiSSE(state, chunk)` is the
  SSE parser as a named global over STRING chunks so the vm suite can feed
  it; it ignores everything but `choices[0].delta.content`. Qwen-style
  `<think>…</think>` blocks are hidden while streaming and stripped from
  the saved reply. `schema` → `response_format: json_schema` (P2a).
- **Prefs:** flat `cfg()` fields `aiUrl` (default `http://localhost:1234`),
  `aiModel` (blank = the server's first), `aiWindow` (tokens, default 8192
  — LM Studio's usual loaded context; his 35B loaded at 8192). The key
  lives apart under `ff1roll-aikey`, like the GitHub token. One Save.
- **Test connection** (`aiTest`): five outcomes with the fix in the line —
  not a URL · mixed content (https page + http non-local URL, checked
  before any fetch) · HTTP status (401/403 → key) · reachable but CORS off
  (a `no-cors` opaque fetch succeeds where the real one failed) ·
  unreachable · OK + model list into the `<datalist>`.
- **Consent per host** (`aiHostOk`): `localhost`/`127.0.0.1` never prompt;
  any other host gets one `appConfirm` naming what leaves the device
  (annotations + notes), remembered in `ff1roll-ai-hosts`.
- **ONE frame:** every bar/beat in the protocol is the RULER's — display
  (chop-relative) bars, the declared meter's counted beat (`effTs()`,
  `beatTicks()`), durations in the same unit. `askSpanNotes(t0, t1,
  maxChars)` is `notesTxtFor()`'s shape with three deltas: declared meter,
  display beats, one speller — `pitchName(p, sfDeclaredAtRaw(t))` (null →
  sharps; a key-dial preview never leaks: `sfDeclaredAtRaw` is the
  keyRegions scan without `previewSf`, `sfDeclaredAt` wraps it). The key
  header line is conditioned on a key DECLARED over the span, not on the
  album. Committed `.notes.txt` files keep their quarter-based shape.
- **Span** (`askSpan`): the ruler selection (`rangeSel`) if armed, else the
  bars in view (`view.x`, `wrap.clientWidth`, `pxPerTick()`), bar-aligned.
  Frozen at Send (`askSpanFrozen`).
- **Context block** (`askContext`): sent ONCE per request on the current
  user turn, never stored. Song + composition flag (`isComposition() ||
  isLocalDraft() || songKey === null`), meter/tempo/bars, tracks with
  drums/muted flags, view + cursor, the key-state line, lasso pitches,
  annotations (capped), span notes (capped, "cut at bar N").
- **Budget:** `ASK_CPT = 2` chars per token — measured 7.3k chars → 3839
  tokens on Qwen 3.6 (note dumps are digits, not prose). Two profiles by
  `aiWindow`: ≤8k → anno 1000 / span 2000 / history 1000 tokens; larger →
  6000 / 8000 / 3000. Trim order: history (newest-first fill), annotations,
  span last. The status line shows the estimate and flags the small
  profile.
- **History** (`askSave`, rewritten 2026-09-25 — Josh: "I want it to just
  be forever until I save the session"): per song under
  `ff1roll-ask-<songKey>` as `{msgs, saved, trimmed, lastUsed}`, context
  stripped AT SAVE. No turn cap. `saved` counts, from the front, the
  messages the repo file already holds; only those are ever shed — past a
  256 KB soft cap per song, on quota, or (other songs' logs, LRU, 512 KB
  total) when the log has nothing unsaved. `trimmed` makes `askRender`
  show the shed part from the repo file (`askRenderEarlier`, one dim
  `.earlier` bubble). When even the unsaved ones don't fit, the oldest go
  and the status line says so. Every write try/caught.
- **The log file** (`askCommitLog`): the chat is part of the song's Save.
  Both commit doors (`commitCompositionNow`, the analyzed-song `ghsave`
  branch) append `askLogMarkdown(unsaved)` to `<song>.ask.md` — beside
  the .mid in the songs repo for compositions, beside the .rollnotes.json
  in the analysis repo for analyzed songs, in the folder in folder mode —
  then bump `saved`. Format: `### <when> · <bars>` per question,
  `**Josh:**` / `**AI (model):**` lines; messages carry `t`, `at`, `m`
  for this. Commit message "Ask log <path> from Night Roll". The
  contents API omits bodies over 1 MB, so the read falls back to
  `download_url`. The breadcrumb ● lights for unsaved chat
  (`askUnsavedCount`), the Publish sheet lists it per song, the
  publish button reads "⇪ Publish song", and Clear chat asks first only
  when something is unsaved (Clear = new session; the file keeps what was
  saved — `localStorage.removeItem`, the whole store, since nothing of it
  needs keeping once a fresh session starts). The Publish sheet's
  **Revert**, by contrast, keeps the `saved` messages and only drops the
  unsaved tail (`askRevertToSaved`) — see "publishall" above. `ghsaveall`
  (annotation sweep) does not carry chat — Save the song for that.
  Purpose: session logs for code sessions — read `<song>.ask.md` the way
  you read a handoff.
- **Prompt** (`ASK_SYS`): a closing paragraph (2026-09-26, from the first
  real .ask.md) tells the model what it is inside the app — the context
  is attached by the app, it sees nothing else, it writes only through the
  tools below and only on explicit request, what loop:/key:/section/chord
  lines mean, and to drop the music when the user says they are testing
  or not ready (Qwen kept steering back). Before that: the web-session rules — hints and direction
  first, confirm/refine a guess, one strong hint when asked, tell plainly
  when the user insists or gives up; concepts answered directly; the
  key-state line governs; never invent notes. Same rules on his own
  compositions (his ruling: no flip).
- **Dictation:** segments are joined by `micJoin` (2026-09-26): Safari
  returns one final segment per pause with no space or period and a
  capitalized first word; the join adds a space, and a period first when
  the next segment starts with a capital and the last ended without
  punctuation. vm-tested. Also the shared `micToggle` (🎤 Speak), as the annotation
  editor and ✦ Ask use. `micStop` detaches the recognizer's handlers
  BEFORE `stop()`: Safari delivers one more result after stop, which used to
  refill the Ask box Send had just cleared (2026-09-26). Dictation fires
  `input` on the box, so `askGrow` sizes `#askinput` to its text (CSS cap
  33dvh, the log gives way) and keeps the end in view.
- **Measured (2026-09-25, Mac, Qwen 3.6 35B-A3B via LM Studio):** 17 bars
  of Overworld = 3.8k prompt tokens; reply 39 s of which ~34 s hidden
  thinking at 60 tok/s. Slow but usable; a no-think switch is a candidate.
- **write_notes (2026-10-02) — replaces the removed ✦ Fill button.**
  Josh found Fill's separate sheet (target picker, take chips, a second
  send button) confusing, and a take still landed the wrong pitch/track/
  rhythm once (open-items.md 19:02/19:05 — "I don't know what this Fill
  button does… I don't like it"). The replacement is an ordinary `ASK_TOOLS`
  entry (`ASK_SONG_ONLY_TOOLS`): the user just types the request into the
  normal chat ("insert a gallop on C3 on the triangle") and the model calls
  `write_notes({track, notes, replace?})` like any other tool. No separate
  UI, no take chips, no target picker — the model spells out EVERY note
  itself (bar, beat, dur_beats, pitch, optional vel); the prompt is
  explicit that a shorthand term like "gallop" means nothing to the app and
  must be expanded (an eighth plus two sixteenths) before the call.
  `track` is matched against the song's own track names — exact
  case-insensitive first, then `askNormChip` (a small shorthand table:
  square→pulse, sq→pulse, tri→triangle, punctuation/case stripped) so
  "square 1"/"sq1" still hit a track literally named `pulse1`; zero or
  more than one match is a thrown error naming the song's real track
  names — **never the selected track** (`askFindTrackIndex` never reads
  `selTrack`). Gate = `askWritableGate()` (Fill's `editableSong()` rule,
  carried over, with a reason per cause: no song, a link-viewed song, the
  compare-repo swap, or a locked capture/starter — naming **✎ Edit** as
  the fix). Never a drums/noise track (`trackIsDrums`, same rule Fill's
  target picker enforced by omission). `askWriteNotesValidate` checks
  EVERY note before anything is written — bar ≥ 1, 1 ≤ beat < beats+1,
  dur_beats > 0, `parsePitch` (pinned to `pitchName`'s octave, double
  accidentals, or a bare MIDI number) in the playable window 24–108, ≤ 256
  notes — and returns every failing note's own error joined together (not
  just the first), so a single bad note in a list never lands the good
  ones beside it. Velocity defaults through `askNoteVel` (ex-`askTakeVel`:
  the same metric rule, 96 downbeat / 88 near-beat / 78 off-beat, no
  jitter) when the model omits `vel`. An optional `replace: {from_bar,
  from_beat, to_bar, to_beat}` erases that track's existing notes in the
  range BY ONSET first (a note sustaining in from before the range
  survives) — same rule `applyTake` already enforced for Fill and the
  generators; omitting `replace` erases nothing (`t0 === t1`, which never
  satisfies `applyTake`'s `t >= t0 && t < t1`). Landing is the SAME
  `applyTake(ti, t0, t1, hits)` Fill and the Bassist/Drummer use — one
  `{kind: "group"}` undo step, erase-by-onset + add, never a splice. The
  reply is one short line: `"wrote 6 notes on triangle, bars 3–4"`.
  Removed along with Fill: `#fillbtn`, `#emAskFill` (Edit ▾ → Fill with
  AI…), the Ask sheet's `#askfill` button and `#asktargetrow` ("fill
  onto")/`#asktakes` rows, `openFill`, `askFill`, `askFillable`,
  `askRefreshTarget`, `askRenderTakes`, `askTakePrompt`, `ASK_TAKE_SCHEMA`,
  `askSchemaMode`, `askParseTake`, `askValidateTake`, `askTargetOptions`,
  `askDefaultTarget`, `askTargetStatus`. Kept (still generic, still used
  elsewhere): `parsePitch`, `trackIsDrums`, `editableSong`, `applyTake`,
  `addTrackUndoable`/`undoTrackAdd` (the Bassist/Drummer still make
  tracks; write_notes never does — the user names an EXISTING track).
- **copy_bars / insert_bars (2026-10-02, open-items 21:50) — Josh via Ask:
  "repeat bars 5–6 after bar 6 and shift everything else over two bars";
  the model tried a ~130-note `write_notes` call and it came back one
  closing brace short (fixed separately in the bridge's tool-call repair —
  see below). A dedicated tool is the right size for "repeat/copy music
  that already exists" — the prompt tells the model to prefer it over
  `write_notes` for exactly that request shape. Both tools are built on
  `openGapShift(T, delta)`, extracted out of `insertTime` (Insert bars…'s
  own apply code, index.html ~L6757): every note and annotation at/after
  tick `T` slides later by `delta` ticks, including the straddling-
  annotation stretch rule (an annotation open PAST `T` stretches; one
  ending exactly at `T` stays put) — `openGapShift` returns the raw pieces
  instead of pushing its own undo, so a caller can fold them into a BIGGER
  group. `insertTime` itself is unchanged (calls `openGapShift` then
  pushes its own two-entry group, same as before — Edit ▾ → Insert bars…
  behaves exactly as it did).
  - **`insert_bars({at_bar, count})`** (`askInsertBars`) is a thin
    wrapper: validates, then calls `insertTime` directly — empty bars,
    nothing copied, "falls out for free" once `insertTime` is just a
    `(T, delta)` function. Undo: the same `{kind:"group", entries:
    ["mod","anno"]}` Insert bars always made.
  - **`copy_bars({from_bar, to_bar, at_bar})`** (`askCopyBars`) snapshots
    every track's notes in `[from_bar, to_bar]` (ticks stored RELATIVE to
    the source's own start, so the copy lands correctly at `at_bar`
    whatever the source/gap relationship — before it, after it, or
    overlapping) BEFORE calling `openGapShift` (which mutates live note
    objects in place), then adds the snapshot back at `at_bar` on each
    note's own track — drums included, nothing filtered (unlike
    `write_notes`, which refuses a drums track; copying existing drum
    hits is fine, dictating new ones isn't). The shift's `{mod, anno}`
    pair plus the copy's own `{addBatch}` land in ONE `{kind:"group",
    entries: ["mod","anno","addBatch"]}` — one ⟲ undoes the whole thing,
    reversed in order (un-add the copies, restore annotations, restore
    shifted note positions). Annotations are NEVER duplicated into the
    copied range — Learning mode is the law, they're Josh's own analysis
    — only shifted, exactly as Insert bars already shifts them (an
    annotation inside `[from_bar, to_bar]` with no open end neither
    shifts nor duplicates). `askBarsCount()` (`Math.ceil(songEndTick /
    barTicks())`, the same basis `read_bars`'s `nBars` uses) backs
    validation: `from_bar ≤ to_bar`, both within the song's current bar
    count, `at_bar` in `1..(nBars + 1)` — every check runs before any
    mutation, so a rejected call changes nothing. Reply:
    `"copied bars 5–6 to bar 7; everything after moved 2 bars later"`.
  - Gate = `askWritableGate()` (write_notes' rule — only the user's own
    editable songs, naming ✎ Edit on a locked capture/starter). Wired
    into `ASK_TOOLS`/`ASK_SONG_ONLY_TOOLS`/`askRunTool` and the ✦ Ask
    system prompt's tool count (now eleven) and one sentence each, same
    as every other tool. Tests: "copy_bars: repeats bars 2–3 at bar 4 …"
    (3-track scratch song, drums included, later notes + the bar-5
    section shift, the bar-2 chord neither shifts nor duplicates, one ⟲
    restores exactly), "copy_bars: bad ranges error with nothing
    changed; refuses on a locked capture…", "insert_bars: empty bars,
    same shift as copy_bars, no notes added…".
- **Delete bars (2026-10-02, open-items 22:20) — Josh in the terminal:
  "Is there a way to delete a bar? I wanna delete bar 8 from this song"
  … "we have Insert bars in the Edit [menu], it would be next to
  that". Edit ▾ → Delete bars… (`#emDeleteBars`, right under Insert
  bars…, same small sheet: from bar — defaults to the cursor's bar —
  and how many) and the Ask tool `delete_bars({from_bar, count})`
  (`askDeleteBars`), both built on **`closeGap(T, len)`**
  (index.html ~L6824) — the inverse of `openGapShift`, the same way
  `deleteTime` is the inverse of `insertTime`: removes the time span
  `[T, T+len)` on every track. A note starting inside is deleted
  outright (`n.gone = true`, same soft-delete `eraseBatch` undo kind
  `deleteSelection` uses — the notes stay in the array, just hidden,
  so one ⟲ is `setGone(false)`); one that starts before `T` but
  sustains into the span is clipped to stop exactly at `T`; one
  at/after `T+len` shifts earlier by `len`. A note ending exactly at
  `T` (not past it) is untouched either way — no special case needed,
  it falls out of the same strict `>` test `openGapShift`'s straddle
  rule uses.
  - **Annotations never die** (Learning mode — they're Josh's own
    analysis): a single tick-mapper, `clamp = x => x < T ? x :
    Math.max(T, x - len)`, leaves anything before `T` alone, collapses
    anything inside `[T, T+len)` to `T` (so an anchor in the deleted
    span MOVES to the cut point instead of being destroyed), and
    shifts anything at/after `T+len` earlier by `len`. Applying the
    SAME mapper to both `n.start` and `n.end` means a range straddling
    the cut shrinks by exactly the overlap (its end maps the same way
    the anchor does) with no separate case needed, and the mapper is
    continuous at both boundaries (`x === T` and `x === T+len` land on
    `T` either way it's computed) so there's no off-by-one seam.
  - **One deviation from `openGapShift`'s own convention, deliberately**:
    whether an annotation "has an end" is tested by `n.b2 !== undefined
    && n.b2 !== null` here, NOT `n.end !== null` the way `openGapShift`
    tests it. Reason: `finalizeNotes`'s depth-stacking pass (the `secs`
    block, ~L4189) gives every chord/section with no declared `b2` a
    SYNTHETIC one-bar `n.end` (`start + bt`) purely for the editor's
    row-stacking math — `resolveNote` itself only derives a real `end`
    from `n.b2` (`n.end = n.b2 ? … : null`). `openGapShift`'s `n.end`
    check is blind to this and — dormant today only because no shipped
    test moves a touched point-type chord/section through it — would
    clamp that synthetic box independently of the anchor and bake a
    fake partial-bar range into a plain point annotation the moment it
    got shifted. `closeGap` checks `n.b2` instead, so a plain chord or
    section that moves (shifted, or moved to the cut) stays a point
    annotation; `openGapShift` itself is UNCHANGED (out of scope here —
    it's shared, shipped code another change didn't ask to touch).
  - Wired into `ASK_TOOLS`/`ASK_SONG_ONLY_TOOLS`/`askRunTool` and the
    ✦ Ask system prompt (tool count now twelve, one sentence: "only
    when the user explicitly asks to delete/remove bars"). Same gate
    as copy_bars/insert_bars/write_notes. Reply: `"bar 8 removed —
    everything after moved 1 bar earlier"` (+ `"; N annotations moved
    to bar 8"` when any did). Edit ▾'s sheet status line matches.
    Icon: `playlistRemove` (Google Material Icons, outlined,
    @material-design-icons/svg, Apache-2.0 — same source as the rest of
    the `ICON` table, 2026-10-02 icon audit). Tests: "delete_bars:
    deletes bar 3 — notes starting inside gone on every track (drums
    included), a note sustaining into it is clipped at its start (one
    ending exactly there stays put), everything after shifts 1 bar
    earlier; an annotation anchored inside moves to the cut, one after
    it shifts, a straddling one shrinks; one ⟲ restores notes +
    annotations exactly", "delete_bars: deletes 2 bars …", "delete_bars:
    bad ranges error with nothing changed; refuses on a locked
    capture; hidden from the general (no-song) chat". Drift keyword
    "Delete bars" (FEATURES).
- **drummer (2026-10-05, open-items "Ask tool for the Drummer") — Josh
  via Ask on ambush: "rerun the A part with slightly less energy
  settings than the maximum I used for the entire thing"; "redo the
  intro, probably to match pulse one and pulse two rather than
  following the triangle".** Plan: docs/plans/2026-10-05-ask-drummer-tool.md.
  `drummer({from_bar, to_bar | section, energy, busy, hard, fills,
  feel, parts, follow, seed})` (`askDrummer`, src/ask/tools.js) runs
  the SAME `drGenerate` the Drummer sheet runs — Ask never hand-writes
  hits. `section` is the exact text of ONE of the user's section
  labels, resolved to its bar span the way the sheet prefills it (a
  point section is one bar; a label on two spans, or none, errors
  naming them — never a guess). `energy` is the generator's legacy
  mapping (busy = hard = energy, bit-identical to the positional call);
  `busy`/`hard` override it apart; `fills` 0–5, `feel`, `parts` as the
  sheet's knobs; `follow` = track names (`["pulse1","pulse2"]`, matched
  like write_notes' track — never the selected track), `["chords"]` or
  `["off"]`, default the detected bass; `seed` optional (omitted =
  random, the reply names it so "that one again, quieter" replays).
  Everything is validated BEFORE the one call — including the meter-
  change refusal drGenerate would otherwise report through setInfo
  with a 0 return — so a rejected call changes nothing and pushes no
  undo. drGenerate makes the kit track when none (folded into its
  undo), erases only kit notes in the range, pushes exactly one group
  undo, saves and redraws; non-drum tracks and annotations are only
  read. The take is pushed onto `S.drTakes` (from/to as the sheet's
  own exclusive-end fields), so the Drummer sheet's chips show and
  replay it. Gate = `askWritableGate()`; in `ASK_SONG_ONLY_TOOLS`;
  schema kept short on purpose (tool schemas ride with every Ask
  message — a test caps it; the logic is a plain function so a later
  registry-backed action tool can call it). Reply: `"Drummer: 61 hits
  in bars 5–12 · busy 2 · hard 2 · fills 3 · following pulse1+pulse2 ·
  seed 123 (one undo restores what was there)"`.
  - **Generator: `followTis` (src/gen/drummer.js).** `follow` used to
    be one track (`followTi`, else `drBassTrack()`). `followTis: [ti,
    …]` is a SET: one entry is the `followTi` path exactly; two or more
    merge the tracks' notes into one follow line — one candidate per
    onset tick (the longest note there: both pulses striking together
    is one kick, not two), in time order — and every followed track
    counts as "the bass" for break detection (`followSet`). Absent (the
    sheet, legacy calls), the code path is byte-identical to before: the
    golden tests and the hard/legacy bit-identity test pin it. The
    sheet's take-chip replay passes `followTis` through and shows the
    first followed track in the picker.
  - Tests: "drummer: runs the generator on bars 2–3 — hits land only
    there, out-of-range drums, every other track and the annotations
    untouched; energy E is the legacy call; ONE undo restores every
    track exactly", "drummer: follow picks the tracks the kick listens
    to — pulse1+pulse2 kick the pulses' offbeat onsets (one kick per
    shared tick); the triangle default has none; followTis of one track
    equals followTi", "drummer: a section label resolves to its bars …
    all error with nothing changed", "drummer: refuses on a locked
    capture with nothing changed; hidden from the general (no-song)
    chat; listed as a song-only tool". Help: AI entry; drift keyword
    "run the Drummer" (FEATURES). Ask system prompt: thirteen tools.
  - **Folded into `act` the same day (Josh via Ask #449):** the standalone
    `drummer` schema cost ~350 tokens on every message — exactly what the
    act design exists to avoid — so its `ASK_TOOLS` entry, its
    `ASK_SONG_ONLY_TOOLS` line and its sentence in the system prompt went;
    `drummer` is now an entry in `ASK_ACTIONS` (src/ask/actions.js) whose
    `run` calls the same `askDrummer(a)` (same args, gate, undo, reply),
    reached as `act {do: [{action: "drummer", section: "A", energy: 4}]}`.
    The four drummer tests still call `askDrummer` directly; the
    general-chat test now checks the action's index line instead of a
    schema, and "act: undo reports what it undid…" drives it through `act`.
- **act — the action registry (2026-10-05; docs/ai-parity.md §2, batch 1
  of §5; Josh #435 "cheap, and it stays cheap", #443 local models too).**
  One tool, `act`, is appended to `askToolsNow()`'s list (never to
  `ASK_TOOLS`, which stays pure data); every app action lives behind it as
  an entry of `ASK_ACTIONS` in src/ask/actions.js. Shipped actions:
  `go_to`, `play`, `stop`, `select` (quiet), `undo`, `drummer` (edits),
  `help`. The design, and what every later batch inherits:
  - **The index is the menu, and it never changes shape per message.**
    `act`'s description = a fixed header + one line per action, `name args
    — gloss`, in name order (`askActIndex`) + a fixed footer; its JSON
    schema is one `do` array of `{action, ...args}` items. Two variants
    only — song chat, and the general chat (`song: false` actions only:
    today just `help`) — and a vm test pins that `askToolsNow()` is
    byte-identical after the cursor, the ruler selection, the song key and
    the annotations all change. Measured as the bridge pastes it
    (`toolInstructions`): the act tool is **1,202 chars ≈ 325 tokens for 7
    actions** (~70 chars/action + a ~700-char fixed header/footer/schema);
    the whole song-chat menu is 12,122 chars ≈ 3,276 tokens, against
    12,286 (13 tools) on main the hour before and 10,919 (12 tools) before
    the drummer. The test prints both numbers every run and caps act's at
    `650 + 110 × actions`.
  - **Full text only on demand.** An action's `spec` is sent in exactly
    two places: `help {name}` and the error of a rejected call ("step 2
    (go_to) failed: bar must be … \n done before it: 1. cursor at 3.1 \n\n
    go_to {bar, beat?}: …"). An unknown action's error carries the index
    instead. So a wrong guess costs the one round help would have.
  - **Lists run in order and stop at the first failure**, naming the step
    and what ran before it; every editing action lands its own undo step
    (so "undo" undoes the last thing, as expected).
  - **Quiet actions end the exchange** (`quiet: true` — navigation,
    playback, view). When every item of a call is quiet and succeeds,
    `askAct` returns `{final: "1. cursor at 13.1\n2. ▶ playing from
    13.1"}` and the AI library shows that text as the reply and makes
    **no second model round** (`aiToolFinal`/`aiFinalText`,
    vendor/ai/web/backends.js — the live loop — and client.js `aiResume`
    — the resumed one; a mixed round goes back to the model as usual).
    Anything answered (edits, help) is a plain string the model words.
    tests/ai.test.mjs proves the one-request path against the fake
    server; the library's own tests cover both loops.
  - **Model-neutral, and forgiving (Josh via Ask #443).** Plain text index,
    plain text help, no Claude-only feature: the same declaration goes to
    LM Studio/Ollama as an OpenAI `tools` entry and to the Claude Code
    bridge as pasted prompt text. `askActItems` accepts what sloppy models
    emit — args as an object or a JSON string, `do` (or the whole call) as
    a JSON string, one item where a list was meant, a list nested one deep,
    `args` as a one-item list, args under `args`/`arguments`/`params`/
    `parameters`/`input` or flat beside `action`, the action under
    `name`/`tool`, a bare action name, numbers and booleans as strings,
    `{_parse_error}` from the library when the arguments weren't JSON at
    all (→ the shape wanted + the index, so it can retry). One vm test per
    tolerance ("act tolerance 1–7").
  - **Callable without a model** (docs/ai-parity.md §7): `runActions([{
    action, args}], general)` → `{lines, quiet, failed}` is the plain door
    a cheap dispatcher model or a no-model fast path would use; `askAct`
    is only the wording layer on top.
  - **Learning mode is the law** for result lines too: facts ("cursor at
    13.1", "selected bars 2–5 — ▶ loops them", "undid: 22 notes added"),
    never a key, chord, meter or verdict; the quiet test sweeps them.
    `play` before the audio context exists (no tap yet this session)
    answers "tap Play once, then ask again" instead of failing silently;
    `select` writes `S.rangeSel` exactly as a ruler drag does (cycle on
    unless `cycle: false`), persisted per song through `draw()`.
  - **How to add an action (the whole procedure):** push one entry onto
    `ASK_ACTIONS` — `{name, args: "bar beat?", gloss, spec, example, say,
    quiet?, song?, run(a) → one line}` (an editing `run` starts with
    `askWritableGate()` and lands one undo step; throw to reject); then
    `node tools/build_ask_help.mjs && node tools/build_help.mjs` (the Help
    sheet's "AI commands" rows and docs/HELP.md are generated from the
    registry; the vm test "act: the Help sheet's AI commands rows…" fails
    while they are stale); then a vm test for the action through `askAct`.
    Nothing else: no schema, no prompt sentence, no `ASK_SONG_ONLY_TOOLS`
    line — the index, help, errors, the general-chat variant and the
    stability pin follow from the entry. Standalone tools that still exist
    (until batch 3 folds them) get their Help row from `ASK_TOOL_PHRASES`.
  - Help: the AI entry's new sentence ("And it can **act** in the app…"),
    "Asking it to act", and the generated **AI commands** rows between
    `<!-- ask-commands:begin/end -->` in help/help.html; drift keywords
    "go to bar 13 and play", "AI commands", "(act: go_to". Tests:
    tests/night-roll.test.mjs "act: …" (menu stability + cost, list
    semantics, quiet/{final}, undo + lock + general chat + runActions,
    tolerance 1–7, Help rows), tests/ai.test.mjs "act: a call made only of
    quiet actions…". Next: docs/ai-parity.md §5 batch 2 (`open_song`), then
    batch 3 (fold the 12 tools in — the menu drops to ~400 tokens).
- **open_song — switching songs and chats (2026-10-05; docs/ai-parity.md
  §4, batch 2 of §5; open-items Q13's default).** "Open Graveyard and play
  it from bar 9." The action (`askOpenSongQueue`, src/ask/actions.js)
  opens NOTHING itself: the AI library runs tool rounds inside one exchange
  and stores the whole reply under the chat it started in, so a switch
  mid-reply would read Graveyard's context into Ambush's chat. It finds the
  song (`askSongPath`, rewritten: the catalog AND this device's drafts,
  `askSongMatches` — an exact path/title/file-name match wins, else titles
  containing the words; more than one survivor is an error naming each with
  where it lives, never a guess), remembers `S.askSwitch = {path, title,
  then, from, fromTitle, said}` and answers one quiet line ("opening
  Graveyard — the album run ends; Ambush's changes are kept on this device
  (not published) · then: play it from bar 9"). From then on, in the same
  reply, every other action (`runActions`) and every song tool
  (`askRunTool`, bar list_songs/read_song/read_notes) refuses: "the song is
  changing — ask again in Graveyard's chat" — so open_song is the last item
  of its call and opening costs one model round. `askLanded`
  (src/ask/client.js) takes the switch when the reply that asked lands on
  its own chat key (a failed or stopped reply drops it) and runs
  `askSwitchRun` on a 0 ms timer (after aiRun's own `finally`, so the box
  is not busy): `openRecentSong` (now async → "is it open now?", and it
  ends an album run for a local copy too — Open…'s own rule, skipped there
  before), then, only once `S.songKey` really is the new song: the ♪ tab
  (`askSetMode("song")` if the ask came from the general chat), a gold
  `{role: "note", m: "handoff"}` line "↪ from Ambush: <the message as
  typed>" pushed into the NEW chat's store only (`askNoteLabel` draws no ✉
  for it; it is the one thing Graveyard's AI knows of Ambush's chat), and
  `then` sent as the user's own next message there (`askSend(text)` — the
  carried path leaves the box, its draft and pending shots alone) with
  `S.askHopKey` = that chat, so a carried-over request can't open another
  song (one hop; a typed message clears the mark, and `S.askSwitch`/
  `S.askCarry` with it). If the new chat holds an unsent draft
  (`askDraftText`), sending would wipe it (afterSend clears the box): the
  words wait as a one-tap chip (`S.askCarry`, `askCarryChip` in
  src/ask/sheet.js, `.askcarry`; not stored — the ↪ line keeps the words).
  A load that fails (`loadSong` returns false and says why in the info
  strip; a draft that is gone) stops everything: no handoff, no send, the
  chat stays. Edge cases and what you see: docs/ai-parity.md §4. Help: the
  "Asking it to act" entry; drift keyword "Open Graveyard". Tests:
  tests/night-roll.test.mjs "open_song lookup/queues/landing…" (lookup,
  refusals, the switch after landing with the album, the handoff, the
  follow-on, the draft chip, a failed load), tests/ai.test.mjs "open_song
  end to end" (one request in the old chat, a second in the new song's
  session with the ↪ line in its history).
- **In-browser backend (P3) — WebLLM.** Settings → AI model → "in this
  browser": `aiBackend = "browser"`, `aiBrowserModel` from
  `AI_BROWSER_MODELS` (curated from WebLLM 0.2.85's prebuilt list, 0.4–3.9
  GB, all 4096-token windows → `askBudget` forces the 4k tier: anno 500 /
  span 1200 / history 300). `aiBrowser()` lazily `import()`s
  `AI_WEBLLM_URL` (jsdelivr, pinned 0.2.85, self-contained ES module —
  the first third-party-hosted runtime dependency, his §10.8 call; weights
  come from HuggingFace and cache in the browser's Cache API), creates one
  `MLCEngine` per model (`aiEngineFor`, progress into the status line),
  streams `chat.completions.create`, maps `schema` to WebLLM's
  `response_format: {type: "json_object", schema}`, sends `extra_body:
  {enable_thinking: false}` (Qwen3 there), aborts via
  `interruptGenerate()`. `aiProvider()` dispatches by backend; the
  browser path skips host consent (nothing leaves the device).
  **`aiBrowserTest` IS the device probe** (no separate probe page): WebGPU
  present → adapter limits (maxBufferSize, storage binding, shader-f16) →
  runtime loads → `hasModelInCache`. Verified on the Mac in Chrome with
  SmolLM2-360M: download + load + reply ≈ 25 s; the tiny model's answer
  was nonsense (it is labeled "for testing"). New web APIs are referenced
  only inside functions (the vm harness has no `navigator.gpu`).
- **Thinking models:** LM Studio streams Qwen 3.6's reasoning as
  `delta.reasoning_content`, apart from `content`; `aiSSE` counts it
  (`state.think`) and the adapter reports "thinking… (N words)" through
  `onStatus` so a 30 s wait is visible. No request-level switch turns it
  off — tried `chat_template_kwargs.enable_thinking`, `reasoning.effort`,
  top-level `enable_thinking`, `think:false`, `/no_think` (2026-09-25, LM
  Studio + Qwen 3.6 35B-A3B: reasoning came back every time). Thinking is
  a model setting in LM Studio, and the status line says so.
- **Settings sheet (rebuilt 2026-09-25 — Josh: "this settings dialog is
  starting to suck").** No Save button: a delegated `change` listener on
  `#settingssheet` calls `settingsPersist(id)` per field (token/key/dev
  topics to their localStorage keys, everything else through `saveCfg`),
  so Close/✕/backdrop/Esc never lose anything. AI section first (`runs` /
  `server` + Test / result line / `model` / `key` + context), then GitHub
  token, folder, and the three data-location rows inside a native
  `<details>`. Test writes to its own line `#cfgaitestout` via `aiSay`
  (✓ → `.ok` gold bold, ⚠ → `.err` red bold), disables the button while
  running, and aborts after `AI_TEST_MS` = 8 s with its own diagnosis (the
  sixth failure class). On ✓ it fills the `#cfgaimodel` `<select>`
  (`aiModelMenu`), picks `aiPickModel(ids, saved)` — the saved id if the
  server still lists it, else the first id without "embed" — and saves
  URL + model at once ("· saved" in the line). The saved model stays in
  the menu when unlisted ("(not on this server)"). Enter in the URL field
  runs Test. The adapter's blank-model fallback survives as a safety net
  but the UI never advertises it. Tests: none reference the sheet's ids
  (2026-09-25); browser-verified on the Mac.
- **Tools (2026-09-26 — Josh: "if I propose putting an F sharp minor
  chord annotation on 21.1, then it should just be able to do it").**
  `ASK_TOOLS` (OpenAI function schemas) ride every ✦ Ask request to the
  remote backend; `aiRemote().chat` runs up to five tool rounds: it
  accumulates streamed `delta.tool_calls` (`aiSSE` slots them by index),
  appends the assistant tool_calls message plus one `tool` result per
  call (`askRunTool`), shows "⚙ name…" in the status line, and continues.
  The APP runs every tool, so they behave identically on LM Studio, the
  Claude bridge, or any OpenAI-compatible server. Tools: `add_annotation`
  (kind chord/section/key/tempo/loop/note, text, bar, beat, optional
  end_bar/end_beat/comment — `askAddAnnotation` builds ONE line in the
  .rollnotes TEXT grammar and runs it through `parseRollnotes` +
  `dropSupersededBy` + `resolveNote`, exactly the editor's path; lands
  `added` = unsynced, with the ✕ in Save & Commit; a loop replaces a
  local loop as the editor does), `list_songs` (CATALOG), `read_song`
  (path/title → `readData("songs")` → `parseMidi` → `notesTxtForDoc`,
  6000 chars, optional bar range), `read_notes` (the .rollnotes.json as
  "[b.q - b.q] type: value — note" lines), `write_notes` (the user's own
  spelled-out notes onto a track they name — see below). `askSongPath`
  accepts a path, a title, or a bare file name. The prompt's closing
  paragraph limits add_annotation/write_notes to what the user asked for
  in words — his rule: the model never volunteers a reading, it writes
  what he dictates. The browser (WebLLM) backend ignores tools entirely.
  - **edit_annotation / delete_annotation / publish_song (2026-10-01,
    open-items).** Same "only on explicit ask, never guesses" rule as
    add_annotation. Targeting an EXISTING annotation: `askFindAnnotation`
    takes either `id` (an index into `rollnotes`, the same one the
    `<context>` block's annotations listing now carries per entry — see
    below) or `bar`+`beat`(+`match_text` to disambiguate); zero or more
    than one match is a thrown error ("more than one annotation at bar …
    — say which"), never a guess. `askEditAnnotation` rebuilds the line
    through the SAME grammar as add_annotation (so kind/comment default
    to the existing note's own, only what's given changes), then
    `retireEdited` (tombstones a synced original so it can't come back on
    reload) + push the fresh one — net annotation count is unchanged, so
    an edit changes text IN PLACE, never leaves a duplicate beside it.
    `askDeleteAnnotation` calls `tombstone` + filters it out — the exact
    path the note editor's own ndelete button uses. Both refuse a
    structural directive (meter/chop/track/audio/lane —
    `askAnnotationStructural`): those carry side effects (re-barring,
    anchor-shifting every other annotation) this tool scope doesn't
    attempt; the app's own editor is still the way to change them.
    `askPublishSong` is literally the footer Publish button's own
    sequence for the open song (`publishSong` +, for his own songs,
    `writeSongsReadme` + `initCatalog`/`updateSongBtn`/
    `renderSyncPending`), gated on `connected()` (a GitHub token or a
    local folder) and `songKey`/`LINK_SONGS`, so a tool-run publish and a
    tapped one behave identically. None of the three push an undo entry
    — neither does the note editor's own Save/Delete today, so this
    doesn't add a new asymmetry.
  - **Context ids (2026-10-01):** `dedupedNotesWithIndex` (factored out
    of `serializeNotesList`, which now calls it too — same dedup, same
    output) tags each surviving annotation with its index into
    `rollnotes`; `askAnnotationsText` (what `askContext` now sends
    instead of `serializeRollnotes`) is that same JSON with one `"id": N`
    per entry. The id is only good for the ONE turn that read it — an
    edit/delete re-sorts `rollnotes` (`finalizeNotes`), so a second
    edit/delete in the same reply should target by `bar`+`beat`+
    `match_text` instead of a now-stale id.
- **The AI bridge (`tools/claude-bridge.mjs`, `npm run bridge`; 2026-09-26,
  generalized the same day — Josh: "I want to make sure everybody can run
  this with LM Studio or Claude Code or both, or Ollama").** A
  dependency-free Node server (Node 18+) speaking the OpenAI protocol,
  meant to be THE server Settings points at. **Where it lives now**
  (docs/ai-library-plan.md §2 step 2, 2026-10-04): the server itself —
  every flag, endpoint, job/session/compact/backup mechanism described
  below — moved verbatim into the `Night-Roll-App/claude-bridge` library
  (`bridge/server.mjs`, `startBridge(opts, profile)` + `main(argv,
  profile)`), vendored here read-only at `vendor/ai/bridge/` by
  `tools/ai-sync.mjs`. Night Roll's own system prompts (the Learning-mode
  convention, `NIGHT-ROLL.md`/`CLAUDE.md` pointers), the `.night-roll-bridge`
  state-directory name, the `/shapes` mount, and the startup-banner text
  all live in `tools/ai-profile.mjs` instead — the library itself carries
  no app vocabulary (`tests/lint.test.mjs`, library repo). `tools/claude-bridge.mjs`
  is now a 10-line shim: `import {main} from "../vendor/ai/bridge/server.mjs";
  import {profile} from "./ai-profile.mjs"; main(process.argv, profile);`
  — every flag below, `npm run bridge`, the launchd plist, and every
  `node tools/claude-bridge.mjs --say "…"` call keep working unchanged.
  **Update flow**: `node tools/ai-sync.mjs --ref vX` (pulls the library's
  tag into `vendor/ai/`) then `launchctl kickstart -k
  gui/$UID/com.nightroll.bridge` (restarts the live launch agent on the
  new code) — both run from the terminal session, after Josh's merge,
  never from a build/worktree session. `tests/bridge.test.mjs` here is
  now the shim test (profile wiring only); the server's own behavior is
  tested in the library. Flags/env in the file header:
  `--port/--host/--token`, `--upstream name=url` (repeatable; without any,
  LM Studio :1234 and Ollama :11434 are probed and listed only while
  running), `--no-claude`, `--claude read|full` (default read), `--repo`,
  `--jobs-dir`, `--keep-hours`.
  - **Models:** `GET /v1/models` = `claude-code` when the `claude` CLI is
    installed, plus every model each upstream lists right now (a shared id
    becomes `<upstream>/<id>`); the app's Test/dropdown just work. A turn
    for an upstream model is forwarded with `stream: true` and the app's
    `tools` as-is; a turn for `claude-code` runs `claude -p
    --output-format stream-json --include-partial-messages
    --append-system-prompt …` in `--repo`, with `--tools Read Glob Grep
    WebFetch WebSearch` in read mode and no restriction in full mode
    (full = whatever this machine's Claude Code may do; Josh's global
    permission mode is "auto", so his bridge edits, tests, commits and
    pushes on his "go" — the first session did, c2f0bcf and 9cc232a —
    and the full-mode prompt binds CLAUDE.md: announce first, vm tests
    under an alarm, never Playwright, push and report the hash, never
    touch albums/compositions/ unasked). App tools reach Claude as a
    one-line `{"tool_call":{…}}` convention; the bridge holds the first
    characters until prose and JSON can be told apart and emits OpenAI
    `tool_calls`; `tool` messages return as "TOOL RESULT" lines.
  - **Jobs** (the iPad problem: Safari suspends a backgrounded tab and
    drops the connection): every turn is a job keyed by the app's
    `x-nr-job` header; it runs to the end with or without a listener,
    keeps every chunk, replays them to a second POST with the same id,
    answers `GET /v1/jobs/:id` (status/text/notes/result) and `DELETE`
    (kill → error "stopped"); `GET /v1/jobs` is the capability probe.
    Finished jobs are written to `--jobs-dir` (default
    `~/.night-roll-bridge/jobs`) and kept until fetched + `--keep-hours`
    (24; 7 days unfetched), so a restart keeps answers. Claude's own tool
    uses stream as `reasoning_content` notes (the app's thinking
    counter). 20-minute cap per turn.
  - **App side of a job** (2026-09-26, Josh: "scroll away … work on a
    song … get a notification"): the question is saved at Send with a
    `pending: <jobId>` marker; `askResume` polls `/v1/jobs/:id`
    whether or not the sheet is open (only a hidden tab pauses it);
    `askFinish`/`askFail` take the store key captured at Send, so the
    reply lands in the song that asked even if another song is open.
    `askLanded`: sheet open on that song → `askRender` (the live
    bubble may be a stale node after a close+reopen); otherwise the
    footer's gold `#askreplybtn` ("✦ reply", the ⚠ pattern: stays until
    tapped, opens Ask) plus one info-strip line naming the other song
    when it differs. `openAsk` clears it. Test: "Ask reply badge".
  - **📷 screenshots + 🖼 Photos picker (2026-09-29, several-per-message
    and 🖼 added 2026-10-02):** `#askshot`/`#askpick` are the two items of
    `#askattachmenu`, a fixed-position drop-up opened by ONE ＋ button
    (`#askattach`, beside Speak — Josh 2026-10-02: one attach button, the
    iMessage/ChatGPT pattern). `askShotShow` toggles the ＋ (and closes its
    menu) once the bridge's inbox answers (only the bridge has one). The
    menu lives outside #songregion because the AI window docks beside it. `askShotCapture`: the iPad shell's native
    `Screenshot.capture()` (a Capacitor plugin in the shell's
    AppDelegate.swift — WKWebView `takeSnapshot`, JPEG) or, in a
    browser, one frame of `getDisplayMedia` on this tab. `#askpickfile`
    (hidden `<input type=file accept="image/*" multiple>`) instead picks
    existing pictures via `askPickFiles` — the OS offers Photo Library /
    Take Photo / Choose File. Each picked file goes through
    `askPrepImage`: HEIC/HEIF, anything over `MAX_SHOT_SIDE` (2752px
    longest side), or anything over `MAX_SHOT_KEEP_BYTES` (2MB) is drawn
    to a canvas and re-exported as JPEG @0.85 (canvas decodes HEIC in
    Safari/WKWebView); a plain PNG/JPEG already under both limits rides
    as-is. Both paths end at `askShotUpload`, which POSTs the bytes to
    `/v1/shot` (bridge: 25MB cap, `SHOT_MAX`; sniffs PNG/JPEG magic
    bytes only — HEIC must already be converted client-side by the time
    it arrives) and gets back a path.
    `askShotPending` is an array (cap `ASKSHOT_MAX` = 4, not a single
    slot — 2026-10-02: Josh tapped 📷 twice meaning to send both, and
    the old single-slot design silently dropped the first). `askShotAdd`
    appends with a per-shot thumbnail (`askShotRender`, one `.askshotcell`
    per pending shot with its own ✕ via `askShotRemove`); `#askshotx`
    (`askShotClearAll`) drops them all at once. `askShotOutgoing` appends
    one `(screenshot: <path>)` line per pending shot to the outgoing
    message; `askShotDisplayText` collapses those lines back to one 📷
    per shot in the on-device bubble. The composer draft (`askDraftSave`/
    `askDraftLoad`) persists `{text, shots: [path, …]}`; an old draft
    saved before this (`{shot: path}`, singular) restores as a one-shot
    array (`askShotRestore`). The bridge saves every upload under
    `<state-dir>/shots`, passes `--add-dir` so Claude can Read there, and
    its system prompt says what the line means. Both the ♪ this song /
    ✦ Ask chat and the ⌨ Terminal tab share this one composer, so 📷/🖼
    work identically in both.
  - **📋 Paste (2026-10-04, Terminal #113–114; docs/plans/2026-10-04-ai-paste-button.md):**
    `#askpaste` beside Speak (CONTROLS `askpaste`, ICON `contentPaste`).
    `askPaste` (src/ask/sheet.js) calls `navigator.clipboard.readText()`
    first thing in the tap (user activation; iOS shows its own Paste
    bubble; the shell has no Capacitor clipboard plugin, so this is the one
    path) and `askPasteInsert` puts the text at the caret when the box
    already has focus, else at the end, with a space where the join would
    run words together — it NEVER calls focus() (Superwhisper leaves its
    transcript on the clipboard; the keyboard would cover half the screen),
    stops a live 🎤 first (`askMicOff` — the mic's onresult rebuilds the
    box from its own base and would erase the paste), then `askGrow()` +
    `askDraftSave()` so the draft is written at once. No API / empty /
    NotAllowedError / other → one `#askstatus` line, never a dialog; never
    sends. Test: "📋 Paste".
  - **"Now:" status (2026-09-29, Josh: "I wish I had a way to see what
    Claude Code was working on from here").** `--status "text"` (or POST
    `/v1/status {text}`) sets one current line + keeps the last 10 with
    timestamps in `status.json` beside `inbox.json`; `--status ""` /
    `--status-clear` blanks the current line only. `GET /v1/status` →
    `{now, recent}`. Piggybacked on `askInboxPoll`'s 60 s/on-open cadence
    (`askStatusPoll`, same host gate, same 404-once): a strip atop the
    general chat only (`askStatusRender`), a "Now:" row in ⏳ Jobs always,
    tap for Recent (`askStatusToggle`) plus the last 3 commit subjects
    from origin/main (unauthenticated GitHub API, cached 5 min).
  - **Sessions + the inbox (2026-09-27, Josh: "I can't message you back
    without getting out of bed, which is why I want the bridge to be
    able to have the model then talk to you").** Each song's chat is ONE
    Claude Code session: the app sends `x-nr-song` (song key, or
    `draft:<name>`), the bridge maps it to a uuid in
    `~/.night-roll-bridge/sessions.json`, runs the first turn with
    `--session-id` and every later one with `--resume`, and sends only
    the tail after the last real reply (`flattenTail`: the new question,
    or this round's tool call + results) — Claude remembers the rest. A
    session Claude Code no longer has (stderr mentions session/
    conversation) is started over once with a new id. Proven live:
    a word remembered across two `claude -p` processes. `BRIDGE_SYS_LINK`
    tells that Claude it can reach "the terminal" — with full tools a
    `-p` session HAS ListAgents/SendMessage (restricted `--tools` drops
    them), and its note arrives in the terminal session as a
    cross-session message mid-turn. The way back is the inbox:
    `node tools/claude-bridge.mjs --say "text" [--from who]` posts to
    the running bridge (`POST /v1/inbox {text, from}`, kept in
    `inbox.json`, last 200); the app polls `GET /v1/inbox?since=<id>`
    every 60 s while visible, on Ask open and on visibility change (only
    a host already allowed for Ask; a 404 marks the server inbox-less),
    stores each note in the open song's chat as `role: "note"` (saved
    like any message; the log writes `**Mac (from):**`), shows a gold ✉
    bubble, and lights ✉ on the Ask button until opened. The song's
    session also gets unseen notes at the top of its next prompt
    ("NOTES FROM THE TERMINAL"), so "did the terminal answer?" is
    answerable. `GET /v1/jobs` now says `inbox: true`. Tool rounds get
    their own job id (`<job>-r<round>`) — the same id replayed round
    one's tool call forever through the bridge.
  - **AI session controls (2026-09-30, open-items.md, Josh via Ask: "the
    same Claude session keeps being resumed and growing").** Clear chat
    used to only clear the device's local log — the bridge kept resuming
    the same underlying Claude Code session, unbounded. `DELETE
    /v1/sessions/:key` drops that key's row in sessions.json, so the next
    turn's `runClaude` sees no session and starts fresh (`--session-id`,
    never `--resume`); `.ask.md` and the inbox are untouched. The app's
    Clear chat calls it (best-effort, after its usual confirm) whenever
    the backend is the bridge.
    **Usage:** every turn's stream-json already carries a `"result"` event
    with `usage.input_tokens/output_tokens/cache_read_input_tokens/
    cache_creation_input_tokens` and `total_cost_usd` — the real field
    names, read straight off a live turn against a throwaway session
    (`claude -p --session-id <uuid> "say hi" --model haiku`) before
    building this. `runClaude` sums them into each session's row
    (`tokensIn/tokensOut/cacheRead/cacheCreate/costUsd`); `GET
    /v1/sessions/:key` → `{turns, tokens, cost}`. App: a line under ✦ AI's
    tab strip, "N turns · ~Nk tokens · $N.NN" (`askSessionRefresh`,
    refreshed after every reply and on tab switch), "— long, Compact saves
    tokens" past 40 turns.
    **Compact:** `POST /v1/sessions/:key/compact` runs the REAL `/compact`
    slash command non-interactively — `claude -p --resume <id>
    --output-format stream-json … "/compact"` — confirmed against a live
    throwaway session first (it works; no summarize-into-a-new-session
    fallback was needed). Its stream emits `{"type":"system","subtype":
    "compact_boundary","compact_metadata":{pre_tokens,post_tokens,…}}` —
    the EXACT before/after context size Claude Code itself measured — plus
    a closing `"result"` line with that compaction's own `total_cost_usd`.
    `runCompact` (tools/claude-bridge.mjs) parses both and the endpoint
    resets that session's running usage counters to a fresh baseline
    (turns → 1) while `costUsd` keeps accumulating (money actually spent
    doesn't un-spend). App: a **Compact** button beside Clear chat
    (`#askcompact`, in-app confirm via `appConfirm`, never a native
    dialog), status line "compacted: 172 → 1 turns · ~24k → ~3k tokens"
    using the exact numbers back from the endpoint.
    **Plan-quota %:** turns out every turn's stream-json (and `/compact`'s)
    already carries a top-level `{"type":"rate_limit_event","rate_limit_
    info":{"unifiedWindows":{"five_hour":{utilization,resetsAt},
    "seven_day":{…}}}}` line for free — no extra `/usage` call needed (a
    `claude -p --resume <id> "/usage"` call was also tried and DOES work
    non-interactively, returning a structured `usage_report.rate_limits`
    too, but the free per-turn event makes a dedicated call unnecessary).
    The bridge keeps the last one seen as `lastQuota` (`recordQuota`,
    module-scope — this account's own usage, not per-song) and returns it
    as `quota` on `GET /v1/status`. App shows it once, in ✦ AI's Recent
    (tap the Now: strip): "plan usage: N% this session · N% this week".
    **Visibility:** `askCaps.sessions` (from `/v1/status`'s new `sessions:
    true`, echoed on `/v1/jobs` too) gates the usage line, Compact button,
    and the plan-quota line — off for LM Studio/Ollama, and never on the
    ⌨ Terminal tab (it has no per-chat Claude Code session of its own).
    Tests: tests/bridge.test.mjs's second (fake-claude) test — usage sums
    across turns with the real field names, a chat nobody's asked
    anything in yet reads as zeros not a 404, DELETE really starts the
    next turn on a fresh `--session-id`, and Compact's response carries
    the fake `compact_boundary`'s exact pre/post tokens.
  - **Token-efficient Ask, steps 0–1 (2026-10-01, docs/ask-token-plan.md,
    Josh: "the MOST TOKEN-EFFICIENT way to talk about songs in Ask
    overall").** Two bridge bugs the plan measured first:
    - **Cost was over-counting (step 0a).** `total_cost_usd` on a stream-json
      `"result"` event is a RUNNING total for the whole resumed Claude Code
      session, not a per-turn figure — summing it every turn made a long
      session's `cost` stat grow ~quadratically with turn count. Each
      session row now keeps `lastCumCost` (the last total seen); `costUsd`
      grows by the DELTA since then, and a total that drops below
      `lastCumCost` (a restarted/lost session, a fresh underlying counter —
      see "session restarted" above) is treated as a fresh total rather than
      subtracted as negative.
    - **A per-session ring (step 0b).** Every turn now appends one row —
      `{t, gapS, in, out, cacheRead, cacheCreate, ctxTokens, apiCalls,
      parts}` — to `ring` (capped at the last 50) in that song's
      `sessions.json` row. `gapS` is seconds since the session's previous
      turn (`null` on its first). `ctxTokens` is input + cache_read +
      cache_creation from the LAST `"assistant"` stream event's
      `message.usage` (not the closing `"result"` event's usage, which is
      this turn's own in/out/cache only, nor output tokens — the LAST
      assistant event is the one that reflects what's actually sitting in
      context right now). `apiCalls` counts `"assistant"` message events
      that turn. `parts` is the optional `x-nr-ctx-parts` request header
      (JSON `{part: chars}`, e.g. the app's notes-window/annotations split)
      — recorded as-is, uninterpreted. `GET /v1/sessions/:key?turns=1` adds
      a `ring` array to the usual `{turns, tokens, cost, lastCompact}`
      shape; plain `GET` (no query) is unchanged.
    - **Tool-round duplication (step 1).** `flattenTail` (the resumed-session
      tail-only sender) used to stop at the last assistant message WITHOUT
      `tool_calls` — but mid tool-round, the LAST assistant message HAS
      `tool_calls`, so it fell through to an earlier turn's boundary and
      re-sent the user's whole `<context>` message every round. Fixed to
      stop after the last assistant message of ANY kind, so a tool round now
      sends only the `TOOL RESULT` lines (and anything after). A fresh
      (non-resumed) session still uses `flatten()` (full history) and is
      unaffected.
    - Tests: tests/bridge.test.mjs's third test — a fake-claude stand-in
      that emits a distinct `message.usage` + `total_cost_usd` per call (a
      counter file) confirms a running total 0.002 then 0.005 → session
      cost 0.005 (not 0.007), a 2-row ring with `gapS`/`ctxTokens` that
      differ per row, and `x-nr-ctx-parts` round-tripping; the same test's
      tool-round case confirms a resumed session's prompt carries the TOOL
      RESULT and not `<context>`, while a fresh session's first turn still
      carries `<context>`.
    - Steps 5–6 (compact per-track encoding, skip-already-sent bars) are
      still open — docs/ask-token-plan.md. Steps 2 and 4 (mode-separated
      sessions, the change-only gate) shipped in 0701a7f. Step 3 (a lean base: `--strict-mcp-config`,
      empty `--mcp-config`, `--disable-slash-commands` in both modes) and
      step 7 (warm auto-Compact) are done — see below.
  - **Warm auto-Compact, ask-token-plan.md step 7 (2026-10-01).** The bridge
    used to only compact a song's session when the app's Compact button was
    tapped — a long session just kept growing until then. Now: the instant a
    turn's job ends SUCCESSFULLY (never on error) with that turn's `ctxTokens`
    (the per-turn ring's own figure) over `--compact-at`
    (`BRIDGE_COMPACT_AT`, default 90000; `0` disables), `runClaude` fires the
    existing `runCompact` for that song's session right away, in the
    BACKGROUND (`startAutoCompact`, tools/claude-bridge.mjs) — the reply has
    already gone out (never delayed by this), and the prompt cache the turn
    just warmed is still hot, the cheapest possible moment to compact.
    Recorded exactly like a manual Compact (`sessionUpdate` `turns: 1`,
    running token counters reset, `lastCompact {at, preTokens, postTokens,
    cost}`) except the cost is the delta against `lastCumCost` (step 0a's own
    logic), not `/compact`'s raw `total_cost_usd` — that figure is a running
    total too, and using it raw next to the triggering turn's own delta would
    double-count. A per-song `compacting` Map holds the in-flight promise:
    a second trigger for the same song while one is running is a no-op (two
    compacts never overlap), and `runClaude` checks the same map before
    spawning Claude Code for a turn, deferring the whole turn behind the
    in-flight compact rather than racing it on the same `--resume` session
    id. One `console.log` line per completed or failed auto-compact.
    **The epoch header:** every chat-completion response (stream or not) now
    carries `x-nr-session-epoch: "<session-id>:<lastCompact.at||0>"`
    (`epochHeader`; exposed via `access-control-expose-headers` for the
    app's `fetch` to read cross-origin) — it changes the instant a compact
    (manual or automatic) lands on that song's session, the same signal the
    app already watches for after a manual Compact. A non-stream reply
    computes it lazily, when the response actually goes out (after its own
    job — and any compact it waited behind — has finished), so it can
    reflect a compact this very turn triggered or waited on; a streamed
    reply can only carry it as of stream START (HTTP headers can't change
    mid-stream), so it reflects an earlier turn's compact — either way the
    app sees a same-turn auto-compact by its NEXT turn. **The app side
    (2026-10-01, docs/ask-token-plan.md step 7/#4).** `aiRemote().chat`
    reads `x-nr-session-epoch` off the fetch `Response` the instant it
    comes back (headers land before the body, so this works for a streamed
    reply too) and calls `askEpochNote(askStoreKey(), epoch)`: kept per
    chat in localStorage right beside the sent-hash record
    (`askEpochKey`/`askEpochGet`/`askEpochSet`, `askStoreKey() + "-epoch"`)
    — unchanged from what this chat last saw, nothing happens; changed (a
    manual or automatic compact landed, or the session restarted), it
    calls `askSentReset`, the SAME reset Clear chat/a manual Compact
    already trigger, so the very next turn resends annotations/the visible
    notes window in full instead of a stand-in the resumed session no
    longer backs verbatim. The first epoch ever seen for a chat has
    nothing to compare against, so it just gets recorded. Harmless (and
    absent — `r.headers.get` returns `null`) against a non-bridge
    provider. Test: the "epoch:" test in tests/night-roll.test.mjs (a
    fake streamed SSE response built as vm source, since the harness's
    sandbox is a separate `vm` realm from the test file — see its
    comment) — a changed epoch resets the cached hashes, an unchanged one
    doesn't.
    Tests: tests/bridge.test.mjs's fourth test, a dedicated fake-claude
    written as a Node script rather than `/bin/sh` (so it can log
    `Date.now()` millisecond timestamps, proving a turn genuinely WAITED for
    a running compact rather than merely running later) — a turn over
    `--compact-at` triggers exactly one `/compact` call, which a turn fired
    immediately after it only starts once the compact's full (artificial
    400ms) run has actually finished; `lastCompact` carries the delta cost;
    a turn under the threshold never compacts; `--compact-at 0` never
    compacts even with a huge `ctxTokens`; the epoch header differs
    before/after a compact and carries its exact timestamp.
  - **General chat (2026-09-27, Josh via the bridge: "some sort of main
    ask section that's not per song").** `askGeneral` (device pref
    `ff1roll-ask-mode`) is picked by the ♪ this song / ✦ general toggle at
    the top of the sheet. In general mode: store key `ff1roll-ask-general`
    (`ASK_GENERAL_KEY`), bridge session name `general` (so it is one more
    entry in sessions.json), `askContext` is one sentence saying no song
    is attached, `askToolsNow()` drops add_annotation/edit_annotation/
    delete_annotation/publish_song/read_bars/write_notes
    (`ASK_SONG_ONLY_TOOLS`), the span row hides, and the log is the
    repo-level `ask/general.ask.md`
    (`ASK_GENERAL_LOG`; `askLogPath/askLogHeader/askCommitLog` take a key).
    Publishing: `pendingSongs()` lists "general" when it has unsaved
    messages; the PUBLISH sheet renders it as its own block with a
    Publish chat button, and Publish all ships it first. The Terminal
    chat (`ASK_TERMINAL_KEY`) is the same shape: log `ask/terminal.ask.md`
    (`ASK_TERMINAL_LOG`), its own header, "terminal" in `pendingSongs()`
    with its own PUBLISH block, never `syncable()`/`publishSong()`. Until
    2026-10-04 it fell through the per-song branches: the log landed at
    the repo root as terminal.ask.md and Publish all wrote an empty
    terminal.rollnotes.json (docs/plans/2026-10-04-repo-tidy.md U1). In
    folder mode the first append seeds `ask/terminal.ask.md` from a legacy
    root `terminal.ask.md` and leaves that file in place. A song's Publish
    still ships the SONG's chat even while the general tab is showing
    (`askCommitLog` picks the song key unless given the general one).
    Test: the general-chat block in the "Ask: history is whole…" test.
  - **"New since your last message:" bridge context (2026-09-30, Josh via
    the iPad Ask)** — every message to a Claude bridge backend (♪ song,
    ✦ general, ⌨ Terminal) carries what changed since Josh's last message
    in THAT chat, so he never copies/pastes an error or a status line by
    hand: (1) a compact **open song** line — title, path, published/local,
    view, cursor — on ✦ general/⌨ Terminal only (♪ song's own `askContext`
    already carries the full song); `askOpenSongLine`/`askViewCursorLine`
    (the view+cursor wording is shared with the song chat's own context
    line, never duplicated) and `songWhereLabel` (also shared with the
    `#songcrumb` breadcrumb's Published/Local wording). (2) NEW `⚠`
    messages since then (`logLines()`, so debug lines only join with
    Settings → Debug log on, same gate as the ⚠ sheet/chip). (3) NEW
    status lines — `setInfo` had no history before this; it now keeps a
    capped ring buffer (`statusHistory`, last 50, `{id, t, text, mode}`).
    `askNewSinceLines(key)` builds the "New since your last message:"
    block (omitted entirely when nothing's new); each section caps at 20
    lines, newest last, then `(+N older)` (`askCapLines`). Appended inside
    `askContext` (♪ song and ✦ general both call it); the ⌨ Terminal tab
    has no model call at all, so `askTerminalContext()` is its own
    builder, prepended to the POSTed `/v1/terminal` text as
    `<context>…</context>` — same wrapper as every other chat, but the
    STORED/shown message stays the plain typed text (never the context;
    `askStripContext` already did this for the others).
    **Seen-cursor:** per chat (`askSeenKey` = `askStoreKey() + "-seen"` —
    one localStorage scalar per song key / general / terminal, `{err,
    status}` ids). `askNewSinceLines` STAGES the watermark it just read
    (`askSeenStage`, in-memory only, keyed by chat) every time it builds a
    block — including `askResume` rebuilding the SAME question's context
    mid-tool-round, which just restages a newer snapshot, never commits
    one early. It is only COMMITTED (`askSeenSet`, via `askSeenCommit`)
    once that exact context's send actually lands: `askFinish` (♪ song/✦
    general) or a successful POST (`askTerminalSend`). A send that never
    lands (`askFail`, or `askTerminalSend`'s catch) drops the staged
    watermark (`askSeenDrop`) instead — a context shown in a failed send
    must not be marked seen, or a retry would never mention it again
    (2026-10-01, docs/ask-token-plan.md #4). `askSeenAdvance` itself still
    exists (sets the watermark immediately) — tests call it directly to
    simulate "a send just landed" without going through the full
    stage/commit plumbing. Device-local localStorage is correct here: it's
    UI state (what THIS device has told the bridge), not song state.
    **Mark-as-read:** a second
    watermark (`askSeenMaxKey`/`askSeenMax`, the high-water mark across
    every chat's own cursor) drives the ⚠ badge (`errChip` now shows
    UNREAD, not total) and greys out already-sent lines in the ⚠
    Messages sheet — a line is "read" once ANY chat has sent it, not
    only the one Josh has open. (The Status window, `#infosheet`, keeps
    its existing single-message reveal — a 2026-09-29 test
    (`"status line: a message with no copy action…"`) pins tapping it to
    show `infoFull` byte-for-byte; giving it the same history/grey
    treatment would need that contract renegotiated first — queued in
    open-items.md, not done here.) **Learning mode is the law:** both
    `logPush` and `setInfo` tag each new entry with `appMode()` at push
    time; `askNewSinceLines` drops every Normal-tagged line while
    building a Learning context, whatever the text says — a Normal-mode
    chord/key/meter estimate shown once on this device must never
    surface in a Learning bridge message later in the same session, even
    after a live mode switch. Tests: the "P7 bridge context" block in
    tests/night-roll.test.mjs (new ⚠/status returned, a send's cursor
    advance clears them, a fresh error afterward shows alone, the
    debug-pref gate, the mode-leak guard, the 20-line/`(+N older)` cap,
    the open-song line, and `askTerminalContext`'s own POSTed text).
  - **Bridge-session caching (2026-10-01, Josh via open-items: "make the
    ✦ Ask context cheaper").** The bridge's Claude Code is a RESUMED
    session, one per `askSessionName()` (`sessionFor`/`runClaude`) — it
    remembers every earlier turn, so resending the two big, slow-changing
    sections of `askContext` (the annotations block, the visible
    "notes in bars a–b" window) unchanged every turn is pure waste.
    `askCachedBlock(key, field, label, header, text, count?)` hashes
    `text` (fnv1a32) and compares it against what was last CONFIRMED sent
    for that chat (`askSentGet(key)[field]`, localStorage
    `askStoreKey() + "-sentctx"`); unchanged, and the backend is the
    bridge (`askCaps.bridge` — the same flag `askTabsApply`/
    `askSessionRender` use to detect the bridge at all), it returns a
    one-line stand-in (`"<label>: unchanged since your last message (N
    entries)"`, count omitted for the notes window) instead of the full
    `"<header>:\n<text>"`. Annotations are hashed WITH their `id` field
    (`askAnnotationsText`'s re-sorted index) — if the hash matches, the
    ids are identical too, so the stand-in is safe even though ids are
    "this turn's handle for edit_annotation/delete_annotation". Staged,
    not confirmed, at build time (`askSentStage`, in-memory, keyed by
    chat) — `askContext` runs synchronously before the network
    round-trip, so it can't know yet whether this send will succeed;
    confirmed only by `askSentCommit`, called from `askFinish` (never
    `askFail`, which drops the staged hash instead — a failed send must
    not claim the bridge holds content it may never have gotten). Full,
    always: a fresh chat (new `askStoreKey()`, e.g. a song-key change —
    no stored hash yet), right after Clear chat or Compact
    (`askSentReset`, since those are exactly the bridge's own session
    controls and the resumed session's memory just changed under it),
    and any non-bridge backend (`askCaps.bridge` false — a local model
    server has no memory of its own; today's full-every-turn behavior,
    unchanged). Tests: the "P8 bridge-session caching" block in
    tests/night-roll.test.mjs (unchanged → stand-in, an edit → full
    again, a failed send never confirms, non-bridge always full, Clear/
    Compact reset, a different chat's empty record). Measured on a small
    sample (2 tracks, 5 annotations, a 4-bar visible window): the context
    block drops from 1847 to 437 chars once both sections are cached
    (−76%, ≈350 fewer tokens at 4 chars/token) — on top of the fixed
    Claude Code base (≈45–50k tokens, docs/ask-token-plan.md), so the win
    compounds with turn count rather than being a one-off.
  - **Compact encoding, step 5 (2026-10-01, docs/ask-token-plan.md).** The
    BRIDGE only (`askCaps.bridge` — same gate as the caching above; a
    local/LM Studio provider keeps `askSpanNotes`/`askAnnotationsText`,
    full, unchanged) gets two denser encodings instead of the full
    text/JSON `askContext` builds for everyone else:
    - **Notes: `askSpanNotesCompact(t0, t1, maxChars)`.** Same facts as
      `askSpanNotes` (same window, same cut-to-fit, same speller), one row
      per bar, no word "bar": `"T<n> name [drums]? [muted]?"` starts a
      track, then `"<bar>|<beat><Pitch><oct>/<dur> <beat><Pitch>…"` — a
      note's octave and duration are written only when they differ from
      the PREVIOUS NOTE IN THAT ROW (reset every row/bar; the first note
      of a row always carries both, so a row decodes standalone). A drum
      track gives the raw note number `"#"`-prefixed (`"2.5#38"`) instead
      of a pitch letter — plain digits would be indistinguishable from
      another beat. The key-spelling comment line (declared key / Normal
      estimate / sharps-no-key-stated) is factored into
      `askKeySpellComment(t0, t1)`, shared with `askSpanNotes`, so
      Learning's gate on `estimateKey()` (appMode() === "normal" only)
      can never drift between the two call sites — it stays on EVERY
      turn (content, not boilerplate); the two purely-notational "# Format
      .../# duration is GATE TIME..." lines move to the one-time legend
      instead (below).
    - **Annotations: `askAnnotationsTextCompact()`.** The SAME
      `dedupedNotesWithIndex` ids `askAnnotationsText`'s JSON already
      carries (`edit_annotation`/`delete_annotation`'s "id"), written in
      the `.rollnotes` TEXT grammar's own span instead of JSON: `"<id>
      [bar.beat-bar.beat] kind: value — comment"` (no spaces inside the
      brackets — compactness). `kind`/`value` reuse `askNoteKind`/
      `askNoteValue` (the same split `askEditAnnotation` already computes
      for an existing note — one place decides what a note "is", never
      duplicated). Structural `track:`/`lane:`/`audio:` directives
      (`askAnnotationStructural` — song-structure, already out of scope
      for edit/delete_annotation) are left out entirely: the model never
      needs them to discuss the music, and they're UI state, not
      analysis; `askContext`'s annotation count line reflects what's
      actually shown (the non-structural count) in this mode, the full
      `dedupedNotesWithIndex` count otherwise.
    - **Legend, once per session (`askLegendText()`).** Explains both
      formats above. Tied to the SAME sent-hash record `askCachedBlock`
      uses (`askSentGet(cacheKey).legend`): a fresh chat, or one right
      after Clear chat/Compact/a changed session epoch (`askSentReset` —
      see both above), has no `legend` field, so `askContext` pushes it
      and stages `legend: true` (committed only by `askSentCommit`, from
      `askFinish`, same success-only rule as the annotations/notes
      hashes); any later turn in the same session omits it.
    - Tests: the "P9 compact encoding" block in tests/night-roll.test.mjs
      — a decoder pair (`decodeFullNotes`/`decodeCompactNotes`, local to
      the test file) parses both formats down to the same flat `{track,
      bar, beat, pitch, dur}` tuples and asserts they're IDENTICAL for a
      fixture exercising all four octave/duration carry-forward cases
      (first note: both shown; same octave: omitted; changed octave:
      shown; everything unchanged: both omitted); a drums test confirms
      the `"#"`-prefixed raw number and duration carry-forward; an
      annotations test confirms ids/span/kind/value/comment and that
      `track:`/`lane:` directives are dropped; an `askContext` test
      confirms the switch is `askCaps.bridge`-only; a legend test confirms
      present/absent/present-again across a reset; a spy test confirms
      Learning never reaches `estimateKey()` from the compact path either,
      and that Normal's estimate wording matches `askSpanNotes`'s exactly.
      **Measured** (a real 7-track, 8-bar window, n64/banjo-kazooie/
      boggy-s-race.mid, plus a representative 9-entry annotation set):
      notes window 4608 → 2390 chars (−48%); annotations 589 → 171 chars
      (−71%); the one-time legend costs 870 chars. First message in a
      session: 5197 → 3431 chars including the legend (−34%); every later
      message: 5197 → 2561 chars (−51%) — and this is BEFORE the
      bridge-session caching above collapses unchanged sections to a
      one-line stand-in on top of it.
  - **Skip already-sent bars + read_bars, step 6 (2026-10-01,
    docs/ask-token-plan.md).** The bridge-session caching above hashes the
    visible notes window as ONE block — any single edit anywhere in view
    makes `askCachedBlock` resend the WHOLE window. Step 6 moves that to bar
    granularity for the bridge (`askCaps.bridge`; non-bridge keeps full
    `askSpanNotes` every turn, unaffected, same gate as every other step
    here):
    - **`askBarRow(tr, ti, b, bt, qt, est)`** factors ONE track's one-bar row
      out of `askSpanNotesCompact` (identical math — octave/duration carried
      forward within the row, reset every bar) so this and `read_bars`
      (below) never re-derive that rule in a second place that could drift.
      It assumes a bar-aligned window, which `askSpan`'s own `t0`/`t1`
      (always floor/ceil'd to a bar) guarantees.
    - **`askBarFingerprint(b, bt, qt, est)`** is the "compact rows" for ONE
      bar across every track, in order — `""` (no content, never cached,
      never staged) when nothing sounds in that bar.
    - **`askSpanNotesCompactCached(t0, t1, maxChars, key)`** hashes
      (fnv1a32) each bar's fingerprint and compares it against
      `askSentGet(key).bars` — a per-bar companion field living in the SAME
      sent-hash record (`askStoreKey() + "-sentctx"`) the whole-block
      "anno"/"legend"/`askCachedBlock` fields already use, so one
      `askSentReset` (Clear chat, Compact, a changed session epoch) clears
      all of them together. A bar whose hash matches joins its run of
      likewise-unchanged neighbors into one `"bars A–B: as sent earlier"`
      line (`"bar A: as sent earlier"` for a run of one); a new or edited
      bar renders in full, grouped by track exactly as `askSpanNotesCompact`
      always has, for just that run. Returns `{text, allCached}` —
      `allCached` (every bar in the window already sent, at least one of
      them with real content) lets `askSpanCachedBlock` fall back to the
      EXISTING whole-window `"unchanged since your last message"` stand-in
      instead of one collapse line per bar, so a steady, fully-cached view
      costs exactly what step 4 already made it cost — the per-bar
      granularity only shows up for a MIXED window (some bars new or
      edited, some not). Staged (`askSentStageBars`, a per-bar merge —
      `askSentStage`'s plain overwrite would lose bars an earlier call in
      the same turn didn't touch), committed only by `askSentCommit`, from
      `askFinish`, success-only, same as every other field (a failed send,
      `askFail`→`askSentDrop`, leaves nothing recorded — the next turn
      sends those bars in full again). `askSentCommit`'s merge for the
      `bars` field is a DEEP merge (`{...cur.bars, ...p.bars}`), unlike
      every other (scalar) field's plain overwrite, and it caps the record
      at `ASK_SENT_BARS_CAP` (2000) by dropping the LOWEST bar numbers
      first once exceeded — a sensible bound, not a precise one; no real
      song's view gets near it.
    - **`askSpanCachedBlock(key, label, t0, t1, maxChars)`** is `askContext`'s
      own "notes in bars a–b" field now — replaces the old
      `askCachedBlock(key, "span", …)` call. Non-bridge: unchanged.
    - **`read_bars({from_bar, to_bar, tracks?})`** (`askReadBars`, a new
      `ASK_TOOLS` entry, `ASK_SONG_ONLY_TOOLS` — the OPEN song only, unlike
      `read_song`/`read_notes`, which name another one): re-reads bars from
      LIVE `song` state (an unsaved edit shows up immediately), in the SAME
      compact row format — with no `tracks` filter it is byte-identical to
      calling `askSpanNotesCompact` for that span, built on the same
      `askBarRow`. Capped to `ASK_READ_BARS_MAX` (32) bars regardless of the
      window's own (much larger) char budget — a deliberate "show me more"
      lookup should stay small — and says so, with where to continue from,
      when truncated. The system prompt (`ASK_SYS_BASE2`) now lists it and
      explains the "as sent earlier" bars it may see, and no longer claims
      the model "cannot open other songs, files, the repo or the web" —
      false on the bridge, where Claude Code actually can — in favor of
      telling it to prefer the context block and these tools over reading a
      song's file directly, since they reflect live state a file on disk
      does not.
    - Tests: the "P10 skip-already-sent bars"/"P10 read_bars" blocks in
      tests/night-roll.test.mjs — a mixed window collapses its already-sent
      run and renders only the new bars; two SEPARATE earlier sends
      (different windows) accumulate so a later window covering both falls
      back to the whole-block stand-in; editing one note resends only that
      bar, its unchanged neighbors still collapsed; a failed send stages
      nothing; Clear/Compact/epoch reset the per-bar record with the rest;
      the 2000-bar cap drops the lowest numbers first; `read_bars` matches
      `askSpanNotesCompact` exactly, sees a live edit immediately, is hidden
      from `askToolsNow()` in the general chat, and truncates a too-wide
      request. **Measured** (a 64-bar synthetic song, one note per bar,
      scrolled in 8-bar steps to the end and back — 16 turns, `askSpanCachedBlock`
      called directly so the number is step 6 alone, isolated from the rest
      of `askContext`): total notes-window chars 3026 → 1990 (−34.2%). The
      forward pass (8 windows, every bar genuinely new) is IDENTICAL either
      way, 1615 chars — there is nothing to cache yet; the saving is all on
      the way back: the backward pass (the same 8 windows, now already
      sent) drops from 1411 to 375 chars (−73.4%), each one collapsing to
      its single "unchanged since your last message" stand-in (every bar in
      THAT window had already been sent, so `askSpanNotesCompactCached`'s
      `allCached` shortcut applies — see above). Before step 6, revisiting
      an earlier window after several others cost full price every time
      (the old whole-block hash only remembers the SINGLE most recently
      sent window); after it, the per-bar record remembers every bar ever
      confirmed sent in the chat, however long ago.
  - **Mode-separated bridge sessions (2026-10-01, docs/ask-token-plan.md
    #2 — SAFETY).** `askSessionName()` appends `#normal` whenever
    `appMode() === "normal"`. Without this, flipping the SAME song's chat
    between Learning and Normal would resume the SAME bridge session
    either way — and since that session remembers every earlier turn
    verbatim, a later Learning-mode turn would inherit Normal-mode
    content (a key/chord estimate, `mode: normal`) straight out of the
    session's own memory, a leak no check on what the CURRENT turn's
    context carries could ever catch (CLAUDE.md: nothing from Normal may
    leak into Learning's AI context). A different mode is a different
    bridge session, period — same song, two rows in sessions.json. Test:
    the "askSessionName is mode-separated" case in the P8 block above.
  - **Mode-tagged on-device history (2026-10-01, SAFETY — the other half of
    the above).** `askSessionName` walls off the BRIDGE session by mode, but
    the on-device transcript (`askStore`/`askStoreKey`, `msgs`) is one
    shared log per song/general chat across both modes, and
    `askBuildMessages` — the one place that history reaches a model
    request — used to send it all regardless of the CURRENT mode, local
    backends included (every turn, not just the first). Fixed: every
    pushed message now carries `mode: appMode()` at push time (`askSend`,
    `askFinish`, `askFail`, `askNotesArrived`); `askMsgMode(m)` reads it back, treating an
    untagged (pre-2026-10-01) message as `"learning"` — the older, default
    mode, never the newer Normal — since there's no way to know which mode
    wrote it. `askBuildMessages` now skips any stored message whose mode
    doesn't match `appMode()` before it ever reaches the length budget, so
    a Normal-mode turn (which may carry a key/chord estimate) can't enter a
    Learning request's messages, and vice versa, even though both turns
    live in the same `localStorage` entry. The sheet (`askRender`) still
    shows the other mode's turns — dimmed (`.askmsg.othermode`) and
    prefixed `[Normal mode]`/`[Learning mode]` — so Josh can tell why a
    bubble looks different, never silently drops it from the log, just
    from the AI's context. Tests: four new "Ask: …mode…" cases in
    tests/night-roll.test.mjs (filtering both directions, the untagged-is-
    Learning default, each push site's tag, and the dimmed/tagged render).
  - **Security:** binds 127.0.0.1 unless `--host`; `--token` requires
    `Authorization: Bearer` (the app's Settings key); CORS open (the app
    is a static page). TLS is someone else's job: Josh uses `tailscale
    serve --bg --set-path /claude 8787` → `https://<mac>.<tailnet>.ts.net/claude`
    (tailnet-only); Caddy or any reverse proxy works the same.
  - **Tests (split 2026-10-04):** the server's own behavior — model merge
    with prefixing, a job outliving a dropped client, replay on
    re-attach, tool_calls assembly, non-stream on a finished job, kill,
    404, the token gate, the inbox (POST/GET/since, the `--say` client,
    token), sessions/compact/deploy-safeguards — is now
    `Night-Roll-App/claude-bridge`'s own `tests/bridge.test.mjs`, run
    there against a neutral test profile. Night Roll's
    `tests/bridge.test.mjs` is the shim test: spawns
    `tools/claude-bridge.mjs` with `--no-claude`, checks `/health`,
    `/v1/models`, the `/shapes` mount, that `--repo` defaults to this
    repo's root with no flag passed, and that the system prompt a fake
    `claude` binary receives carries the Learning-mode convention and
    `NIGHT-ROLL.md`/`CLAUDE.md` pointers (`tools/ai-profile.mjs`'s own
    text, not the library's neutral one). Both run in `npm test`.
  - **Always on (2026-09-26; installer moved to the library 2026-10-04):**
    `sh tools/launchd/install.sh --claude full --upstream
    lmstudio=http://localhost:1234` is now a shim onto the claude-bridge
    library's own installer (`vendor/ai/bridge/launchd/install.sh --entry
    tools/claude-bridge.mjs --label com.nightroll.bridge`, template in
    `vendor/ai/bridge/launchd/`), which installs
    `~/Library/LaunchAgents/com.nightroll.bridge.plist` (absolute
    node/entry/PATH filled in, RunAtLoad + KeepAlive, log
    `~/Library/Logs/com.nightroll.bridge.log` — the log file is now named
    after the launchd label, not hand-picked; `--uninstall` removes it.
    Installed on Josh's Mac 2026-09-26. LM Studio's own start-at-login is
    separate (`lms server start --cors` otherwise).
- **iPad route (P4) — done 2026-09-25.** Josh's iPad asks the Mac's LM
  Studio over Tailscale, verified end to end (Test listed the models,
  ✦ Ask answered). Exact recipe on the Mac: `lms server start --cors`
  (not persistent across reboots); Tailscale on both devices, same
  account; admin console → DNS → MagicDNS + HTTPS Certificates on, and
  Serve approved once from the link `tailscale serve` prints;
  `tailscale serve --bg 1234` (persists; undo with
  `tailscale serve --https=443 off`). That proxies
  `https://<mac>.<tailnet>.ts.net` → `localhost:1234` with a real cert;
  LM Studio's CORS headers pass through the proxy unchanged (preflight
  from the Pages origin returns `access-control-allow-origin: *`).
  Settings on the iPad: URL = that https address, model = the id LM
  Studio loaded (blank picks the server's FIRST listed model, which was
  the wrong one — a Settings redesign is queued in open-items.md).
  Never run the Tailscale CLI without a timeout — it hung the shell
  while the system extension was down.
- **Not yet:** the in-browser path's Test on the iPad (WebGPU limits are
  the unknown), the P0 Safari-on-Mac probe. Tests: SSE
  parser, 6/8 frame + speller + key line, storage caps + quota, host
  classing, `parsePitch`, write_notes validator fixtures (one per rule,
  6/8 + chop, nothing written on a bad note), track-name matching (never
  `selTrack`), replace-by-onset, the locked-song/no-song/general-chat
  refusals, `applyTake` undo/mirror, Bassist golden fixture, FEATURES
  keyword `✦ Ask`, and a dedicated test asserting `#fillbtn`/`#askfill`/
  `#emAskFill` are gone from index.html's own markup (the vm harness's
  `getElementById` lazily creates any id, so that check reads the raw
  HTML text instead).

## ✦ Annotate this song… — AI estimates as annotations, Normal mode only (2026-10-04)

docs/plans/2026-10-04-annotate-song.md (Fable-reviewed), closing open-items'
"QUEUED IDEA (Josh, 2026-09-27)". View ▾ → Mode → **✦ Annotate this song…**
(`#vwAnnotate`, right under `vwAnalyze`) opens `#annotatesheet`: Sections /
Chords / Key checkboxes, **Run**, **Clear AI annotations**, a status line.
Code: `src/ask/annotate.js`; tests: tests/annotate.test.mjs (fake
OpenAI-SSE server, tests/ai.test.mjs's shape).

**Learning mode: the feature does not exist.** The menu item is ABSENT
(`renderViewMenu`: `style.display = analysisAvailable() ? "" : "none"` —
the identical mechanism as `vwAnalyze`, not dimmed), `openAnnotateSheet`
and the hidden button's handler return in Learning, `annotateGate()` answers
"Normal mode only" and `annotateRun` throws it before any request. Nothing
reaches the chat: there is NO ASK tool for this — `ASK_TOOLS`, `askToolsNow`,
`askSys` and `askContext` are untouched by construction, because the job
calls `aiProvider().chat({system: ANNOTATE_SYS, messages, tools: []})`
itself, never `askRun`. The Learning test proves all of it (item absent,
sheet never opens, runner refuses, zero requests on the fake server,
tool list / system prompt / context block free of it).

**Learning hides what Normal wrote — never deletes it.** AI-tagged
annotations (`n.ai`) are song state (they ride the file, the local store
and the undo snapshot), so a user who flips back to Learning would
otherwise still see them — the leak CLAUDE.md forbids ("nothing from
Normal mode may leak into Learning mode's UI, AI context, or repo files").
ONE choke point in `model/rollnotes.js`: `visibleNotes()` (S.rollnotes
minus `n.ai` entries unless `appMode() === "normal"`) and its per-note form
`annoShown(n)` (for readers that must keep S.rollnotes indices — the ✦ Ask
annotation ids). Every reader that PRESENTS or FORWARDS annotations goes
through them: `finalizeNotes` (section/chord lanes — a hidden band gets
`lane = null`, folded — and `keyRegions`, so the staff signature, the LCD
key, `keyLabelState`, `sfDeclaredAt` and `askKeyDeclared` never see an AI
key), the roll's `activeNoteAt`/`sectionPathAt`/band and flag drawing, the
instrument view's chord lines, `governingAt`, the LCD's partial-key read,
the subtitle's `hasNotes`, `renderNoteList` (so no ✦ AI badge either) and
`updateChordStale`, the band tap and flag tap in gestures, the lasso
(`lassoedAnnos`, the annotation clipboard), the Bassist/Drummer readers and
the Drummer sheet's section/chord defaults, `factsDocFromState` (the FACTS
behind Analyze/Annotate/the ✦ Ask grounding), `askAnnotationsText`/
`askAnnotationsTextCompact`/`askContext`'s count, `askFindAnnotation` (a
hidden id or bar.beat is "no annotation"), `read_notes` (another song's
file: entries with `ai` dropped in Learning), and tools/query-lib.mjs (the
harness runs in Learning). Storage, sync, undo, the anchor-moving edits
(whole-song move, insert/delete bars, meter conversion) and `annotateClear`
read `S.rollnotes` whole, so nothing is lost: flip back to Normal and
`applyMode`'s `finalizeNotes` + `draw` show all of them again. The in-app
notes.txt writer (`notesTxtFor`) never carried annotations. Test: the
"Learning mode hides ✦ AI-tagged annotations…" case in
tests/annotate.test.mjs (draw spy, All notes, LCD, context, tools,
generators, lasso, store/file round-trip, three flips).

**Normal mode: the Run tap is the approval.** Gate (`annotateGate`):
`analysisAvailable()`, a song with a `songKey`, not `LINK_SONGS`, not
`rollnotesReadOnly` (docs/annotations-v2.md P3), at least one pitched
(non-audio, non-drum) track with notes. Per-host consent runs first
(`aiHostOk(aiUrl())`, the chat's own gate). The request per window:
`song:`/`bars a–b of N · meter: k beats per bar`/`wanted: …`, the user's
own annotations in those bars (fixed — never restated), a **FACTS** block
from the theory toolkit (`formFacts`, `bassFacts`, `melodyFacts`,
`rhythmFacts` on `factsDocFromState()` — docs/theory-toolkit.md §3.0's
adapter, now in src/model/song.js — each formatted and cut to a third of
`askBudget().span`), then **NOTES** = `askSpanNotesCompact` for the window.
`ANNOTATE_SYS` asks for ONE JSON object
`{"sections":[{from_bar,to_bar,label}],"chords":[{bar,beat,end_bar,end_beat,symbol}],"keys":[{bar,name}]}`
(end_beat = the last beat the chord still sounds on, inclusive) and restates
the compact-row format.

**Windowed runs (required, not optional).** `annotateBarCosts()` sums each
bar's `askBarRow` lengths (the one place the row format lives, so the split
cannot drift from `askSpanNotesCompact`); `annotateWindows(costs, cap)`
cuts `[from, to]` runs under `annotateWindowCap(budget)` (= `budget.span`
minus the track heads; 4k window → 1200 chars). Every window is asked in
turn inside ONE `jobStart("annotate", …)` job (footer ⏳, ✕ aborts via
`api.aborted` → `AbortController`); `S.annotateBusy` allows one run at a
time; a song change mid-run (`S.songKey !== key`) writes nothing.

**Validate, then write — nothing lands on any failure** (the write_notes
discipline): `annotateParse` (outermost `{…}`, `<think>` stripped; anything
else is "no usable reply"), `annotateValidate` (bars within
`askBarsCount()`, beats within the meter, `parseChordSym` non-null,
`keyNameToSf` defined, labels ≤ 40, sections non-overlapping, kinds not
ticked dropped — every failure named, the window named when there are
several). Then `annotateOverlaps`: an estimate whose span overlaps a NON-ai
annotation of the same kind (section band / chord band / key at that bar)
is **skipped** and reported ("skipped N (yours)"); one overlapping an
estimate already accepted in this run is **merged** (dropped). Then
`annotateWrite`: each item through the editor's own text grammar
(`[b.q - eb.eq]` + `kind: text` → `parseRollnotes` → `resolveNote`),
`added = true`, `ai = {model: askModelName(), at: ISO}`, an earlier AI
estimate of the same kind on the same span replaced (no twins), ONE
`pushUndo({kind: "anno"})` for the whole run (the adoptAllChords pattern),
`finalizeNotes`/`saveLocalNotes`/redraw. The user's own band on an
estimate's exact span replaces it when HE writes (dropSupersededBy — the
editor's rule, unchanged). **Clear AI annotations** (`annotateClear`,
appConfirm first — never a native dialog): every `n.ai` note through
`tombstone` (a published one stays deleted across reloads) and out, one
`pushUndo`.

**The tag.** `n.ai = {model, at}` is song state, not a device pref: it
round-trips through `noteToJSON`/`jsonToRawNote` (so the v2 file, the undo
snapshot `annoSnapshot`, and copy/paste carry it), through `saveLocalNotes`'s
unsynced store, and is documented in docs/annotations-v2.md + the schema's
note object. All notes shows a gold **✦ AI** badge (`.aitag`, src/ui/notes.js)
on tagged rows, in either mode — they are song state once written, and the
badge is what keeps them identifiable. Claude sessions with Josh never run
this on his songs without his per-instance ask (CLAUDE.md).

## Window manager (shell + docks) — phase A of the windowing plan, 2026-09-29

open-items.md's "a real windowing system" (QUEUED IDEA, 2026-09-27,
REOPENED 2026-09-29). **Attempt 1 (commit c322e3c) broke on the iPad**:
it reserved width with `<html>` `padding-right` and made `#asksheet`
`position:fixed` — the panel didn't span full height, the roll canvas
and footer ran under it, header buttons were cut off, the ⇥/⇤ glyphs
rendered empty on iOS. Steps 1-2 replace that mechanism entirely with a
real shell. Josh's rule that shaped the redesign: the main panel (roll /
score / tracks — the song) is ALWAYS in the center; windows dock only
left, right or bottom around it.

### Step 1 — the shell (no behaviour change)

`#shell` (body markup, right after `<body>`) is a 3-column x 2-row CSS
grid:

```
#shell { display:grid; grid-template-columns: var(--dl-w,0px) 1fr var(--dr-w,0px);
         grid-template-rows: 1fr var(--db-h,0px); flex:1; min-height:0; }
#songregion { grid-column:2; grid-row:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
#dockleft   { grid-column:1; grid-row:1/3; position:relative; }   /* FULL-height side dock: edge to edge */
#dockright  { grid-column:3; grid-row:1/3; position:relative; }
#dockbottom { grid-column:2; grid-row:2; position:relative; display:flex; flex-direction:row; } /* inner width — see Phase A */
```

(Phase A, below, adds `#songcenter` — `#rollwrap` plus `#dockleftinner`/
`#dockrightinner` — nested inside `#songregion`'s own flex column, for the
INNER side-dock mode. The grid above is otherwise unchanged from step 1.)

`#songregion` wraps the app's existing top-level song flow — `header`,
`#trackrow`, `#albumstrip`, `#cmpbar`, `#rollwrap`, `#editrow`,
`#instpanel`, `#subtitle`, `footer` — unchanged internally (still
`display:flex; flex-direction:column`, the same rules `#rollwrap { flex:
1 }` etc. that used to hang off `<body>`). Grid items stretch to fill
their cell by default, so `#songregion` needs no explicit height/width
of its own: with every dock's CSS var at its `0px` default the layout is
pixel-identical to the old body-is-a-flex-column page. `#panelshow` (the
floating "show controls" button, `position:fixed`) moved out to a body
sibling of `#shell` — fixed positioning doesn't care about DOM ancestry
here (no transform/filter/perspective on `#shell` or `#songregion`
creates a new containing block), it only needed to stop breaking up the
song-flow element list. `.overlay` sheets/menus (`#asksheet`,
`#settingssheet`, `#viewsheet`, the voice menu, …) stay body children
outside `#shell` for now, positioned as before (`position:absolute;
inset:0` for modals, or JS-anchored `style.left/top` for dropdowns) —
true full-viewport modals are meant to cover the docks too.

### Step 2 — the right dock

Docking a sheet moves ITS OWN NODE into `#dockright` and sets `--dr-w`
(px, clamped `[280, 60vw]`, default 380) on `#shell`; floating moves it
back to a `display:contents` "home" wrapper at its original body
position (`<id>-home`, e.g. `#asksheet-home` — invisible to layout, so
floating restores the exact original DOM slot) and clears `--dr-w` back
to `0px`.

- **wm state.** `let wm = {right: {id, w}}` (or `{}`), flat localStorage
  key `ff1roll-wm`, migrated once from the old `ff1roll-aidock`
  (`{docked, width}`, asksheet-only) — `wmLoad()` reads the new key
  first, and only on a miss reads the old key, migrates it via
  `wmMigrate()`, saves under the new key, and (whether or not it had
  `docked: true`) removes the old key so it's never read again.
- **Pure helpers — no DOM, directly unit-tested:** `wmClampSize(w,
  innerWidth)` bounds a width to `[280, 60% of innerWidth]` (falls back
  to `innerWidth = 1024` for a bogus/missing value); `wmAllowed(innerWidth)`
  is `innerWidth >= 700` (the phone-width cutoff — below it there's no
  "what's left" to give the song); `wmMigrate(oldPref)`,
  `wmSetRight(state, id, w, innerWidth)`, `wmClearRight(state)` are pure
  state transitions on the `{right: {id, w}}` shape.
- **`wmLayoutRight()`** is the one function that touches the DOM — moves
  nodes, sets classes/CSS vars, and redraws. It tracks `let wmRightEl`
  (module state: the node currently parented in `#dockright`, or
  `null`) as the source of truth for "what's docked right now" — once
  `wm.right` is cleared there's nothing in `wm` left to say which
  element to float back out, so the element reference itself is kept
  separately. Safe to call any time (open, close, toggle, drag, or a
  live window resize) — idempotent; float-then-dock only actually moves
  nodes when the wanted element differs from `wmRightEl`.
  - `dockright.classList.toggle("occupied", !!wmRightEl)` shows/hides
    the dock's divider (`#dockright.occupied #wmdivider`).
  - the width reservation (`--dr-w`) only applies while the docked
    sheet is actually shown (docked AND `.on`) — closing it (✕,
    backdrop, Esc) sets `--dr-w` back to `0px` (the song gets the width
    back) but `wmRightEl`/`wm.right` are untouched, so the node stays
    parked in `#dockright` and reopening needs no re-dock.
  - `resize()` — the exact function `window`'s own `"resize"` listener
    calls — runs at the end of every `wmLayoutRight()`. It reads
    `wrap.clientWidth`, which in a real browser already reflects the
    grid's new column width by the time `resize()` runs (synchronous
    layout), so the roll/score/tracks canvas, the ruler, the lanes, and
    the follow-the-playhead math all follow with zero extra wiring. The
    existing `new ResizeObserver(resize).observe(wrap)` (from "subtitle
    strip toggling resizes the roll") also fires on its own in a real
    browser whenever the grid track actually changes size —
    `wmLayoutRight()` calling `resize()` directly is belt-and-suspenders
    (and the ONLY path in the vm suite, where `ResizeObserver` is a
    no-op stub).
- **CSS.** `.overlay.docked` (generic — any future docked sheet reuses
  it unmodified): `position:static; background:transparent; padding:0;
  width/height:100%; z-index:auto`, `.overlay.docked.on { display:flex }`,
  `.overlay.docked .sheet { width/height:100%; max-width/max-height:none;
  border-radius:0; ... }`, `.overlay.docked .sheetgrip { display:none }`
  (the dock's divider resizes it instead). A sheet with its own
  floating-width override at ID+class specificity (`#asksheet .sheet.ask`,
  "three quarters of the screen") needs its own matching docked override
  too (`#asksheet.docked .sheet.ask`) — the generic class-only rule can't
  outrank an ID selector.
- **Divider:** `#wmdivider`, a *permanent* child of `#dockright` markup
  (not of whatever sheet is docked in it — so a future sheet reusing the
  cell needs no divider of its own), `position:absolute; left:-4px` —
  dragging it left (toward center) widens the dock. Same
  pointerdown/pointermove/pointerup shape as `sheetDrag`'s own `◢` grip;
  width applied live on every `pointermove`, saved once on release.
- **Dock control:** a text button, `id="askdock"`, inside `#asksheet`'s
  `<h2>` — "Dock" / "Float" (no exotic glyphs; ⇥/⇤ rendered empty on
  iOS, attempt 1's bug). The sheet's title reads "AI" (it said "ASK" on
  the iPad even after the button itself was renamed to "✦ AI").
- **`sheetDrag()` stays out of a docked sheet** — `.overlay.docked`
  early-return in its `pointerdown` handler (generic, was already this
  way from attempt 1) plus a button exclusion in `handleFor` so the
  Dock/Float button inside `<h2>` doesn't start a title-drag.
- **Close paths:** `SHEET_TOP` (the existing per-overlay
  `MutationObserver` that resets scroll position on open) calls
  `wmLayoutRight()` on any `#asksheet` class mutation — the one choke
  point every close path already runs through (✕, backdrop tap, Esc, or
  reopening). Real-browser-only, like the rest of that block (guarded on
  `document.querySelectorAll`); tests call `wmLayoutRight()`/
  `wmToggleRight()` directly instead.
- **Phone width (<700px):** the dock control hides; the sheet is always
  floating. Crossing that width live (the `window` `"resize"` listener
  re-runs `wmLayoutRight()`) floats a docked sheet immediately; the pref
  itself is untouched, so widening back re-docks it without asking
  again. Not e2e-verified (no e2e in this repo's workflow) — vm-tested
  via `window.innerWidth`.
- **Anchored menus vs. the dock.** A menu/dropdown positioned from a
  header button (`openVoiceMenu`, the metronome popup, View/Edit menus,
  the file submenu, the capture panel's centering) used to clamp against
  raw `window.innerWidth` — with the right dock open, that let one open
  spilling under it. `songRegionRight()` (defined right after `const
  wrap = …`) returns `#songregion`'s own right edge (falls back to
  `window.innerWidth` if the element or its rect is unavailable, e.g.
  the vm harness) and every such clamp site uses it instead. True
  `.overlay` modals (centered, full-viewport backdrop) are unaffected —
  they're meant to cover the docks too. The `?perf=1` debug HUD's two
  `position:fixed; right:…` elements (a real-browser-only, guarded block)
  compute their `right` offset the same way, so they sit over the song
  region instead of under the dock.
- **Tests:** `tests/night-roll.test.mjs`, "Window manager: …" — pure
  helpers (`wmClampSize`/`wmAllowed`/`wmMigrate`) tested directly with no
  DOM; docking sets the pref/class/`--dr-w` and floating restores it
  (`resize()` ran); phone width refuses and re-offers live on resize;
  the divider clamps and saves only on release; the pref survives a
  reload and migrates once from `ff1roll-aidock`. FEATURES keyword
  "Dock right". The vm harness (`tests/harness.mjs`) grew a
  `setProperty`/`getPropertyValue`/`removeProperty` shim on every
  element's `style` stub — a bare `style.foo = …` object property never
  reflected a REAL CSS custom property (`--dr-w`) the way it does a
  normal IDL one (`paddingRight`), so the stub needed the actual method
  shape.
### Phase A — left/bottom docks, INNER mode, split bottom, makeWindow() (2026-09-29)

Generalizes steps 1-2 to left/right/bottom, a second mode for the side
docks, a split bottom, and a builder function for a window's shared shape.
Josh's model (his words): "a full window manager where I can drag these
windows over to the right hand side or drag them to the bottom … or drag
them to the left … like IntelliJ and VS Code." "The main panel … should
always be in the center, and you can only put stuff around it on the left,
right, or bottom." "We might want a window to take up the entire
right-hand side from top to bottom, or only the portion from the ruler to
the bottom of the roll — basically having a header and footer [of the
song] below it from the outer context." No top dock.

- **Two bands for a side dock.** FULL (the step-1/2 behaviour: the outer
  `#dockleft`/`#dockright` grid cells, edge to edge, beside the header and
  footer too — `grid-row:1/3`) or INNER (beside `#rollwrap` only). INNER
  needed a real structural change: `#songregion`'s `#rollwrap` is now
  wrapped in `#songcenter` (`display:flex; flex-direction:row; flex:1`)
  alongside two new sibling cells, `#dockleftinner`/`#dockrightinner`
  (`flex:0 0 var(--dli-w,0px)` / `var(--dri-w,0px)`, default closed) —
  nested INSIDE `#songregion`'s own flex column, so a window docked there
  narrows only the roll band; the header rows above it and the footer below
  it still span the full song width. Everything else in `#songregion`
  (`header`, `#trackrow`, `#albumstrip`, `#cmpbar` above; `#editrow`,
  `#instpanel`, `#subtitle`, `footer` below) needed no wrapper of its own —
  DOM order in the existing flex column already gives the top/bottom bands
  their shape; only the center row (`#rollwrap`) needed wrapping. A side
  dock's own `wm.<side>.w` is the same value in either mode — switching
  FULL↔INNER just moves the node to the other cell and swaps which CSS var
  (`--dl-w`/`--dr-w` vs `--dli-w`/`--dri-w`) carries the width; the OTHER
  var is zeroed. Only a FULL dock toggles `#shell.hasdock` (the footer's
  one-row-no-wrap treatment) — an INNER dock never touches the footer.
- **Bottom dock: inner width by default.** `#dockbottom` moved from
  `grid-column:1/4` (under the side docks too) to `grid-column:2` (matches
  `#songregion` — between the side docks, under the song only). Chosen so
  the bottom dock reads as an extension of the song's own bottom band
  rather than a strip that runs under a side panel too; a full-width
  bottom (edge to edge like a FULL side dock) wasn't asked for and isn't
  built. It may hold up to two windows side by side —
  `#dockbottom0`/`#dockbottom1`, each `flex:1 1 0` normally, split by
  `#wmdivider-bottomsplit` (`--db-split`, clamped `[0.2, 0.8]`) once both
  are occupied (`#dockbottom.split`). A window docks to the first open
  slot; a third window bumps whatever was in the second, keeping the
  first — `wmDockBottom()` (pure). Height: `--db-h`, clamped `[160, 70vh]`,
  dragged from `#wmdivider-bottomh` along the dock's TOP edge (drag up
  grows it). A closed window's own slot collapses (`.dockslot.shown` off)
  so its sibling gets the space — the same "active = docked AND open"
  rule a side dock already had; the OUTER `.occupied` class (divider
  visibility) tracks "docked here at all," open or not, same as before.
- **`wm` shape:** `{left?: {id, w, mode}, right?: {id, w, mode}, bottom?:
  {ids: [id] | [id, id], h, split}}`, `mode` is `"full"` or `"inner"`.
  Migrated twice on load: once from the pre-shell `ff1roll-aidock`
  (`wmMigrate`, unchanged from step 2), and once more (`wmMigrateShape`,
  pure) from the step-1/2 shape itself — a saved `{right: {id, w}}` had no
  `mode`, and always meant FULL height, so it's backfilled on read; a
  window is docked in at most one place — `wmDockSide`/`wmDockBottomWindow`
  clear it from any other dock first.
- **Pure helpers (new):** `wmClampHeight(h, innerHeight)` bounds the
  bottom dock's height to `[160, 70% of innerHeight]`; `wmClampSplit(f)`
  bounds the split fraction to `[0.2, 0.8]`; `wmMigrateShape(state)`;
  `wmSetSide`/`wmClearSide`/`wmSetSideMode` (side dock state, generalizing
  `wmSetRight`/`wmClearRight`, removed); `wmDockBottom`/`wmClearBottom`/
  `wmSetBottomHeight`/`wmSetBottomSplit`; `wmWhereIs(state, id)` — which
  dock (if any) claims a window, and its mode. `wmClampSize`/`wmAllowed`/
  `wmMigrate` are unchanged from step 2.
- **DOM functions:** `wmLayoutSide(side)` generalizes `wmLayoutRight()` to
  either side and either mode (module state `wmSideEl.left`/`.right`
  generalizes `wmRightEl`); `wmLayoutBottom()` is the equivalent for the
  bottom dock's up-to-two slots (`wmBottomEls`); `wmLayoutAll()` is the one
  entry point everything else calls — runs both sides, the bottom, sets
  `#shell.hasdock` from the combined FULL-side state, refreshes every
  window's Dock button, and calls `resize()` exactly once. `wmToggleRight`/
  `wmLayoutRight` are removed; the action functions below took their place.
- **`makeWindow(id, {dockable})`** registers a window (`WM_WINDOWS[id] =
  {dockable}`) and, if dockable, builds its Dock button into
  `document.getElementById(id + "-h2")` — every migrated window's `<h2>`
  now carries that id (`#asksheet-h2`, `#notelistsheet-h2`, …; where the
  title text itself is set dynamically — `#instsheettitle`,
  `#pubjobtitle` — it's now a `<span>` INSIDE the `<h2>`, so reassigning
  its `textContent` can't wipe out the appended button). makeWindow does
  **not** build ✕, title-drag, or the `◢` grip — those were already fully
  generic (the ✕-injection loop and `addGrips()` skip anything already
  present; `sheetDrag`'s `.sheet > h2` selector matches any sheet's title
  regardless of id) and are unchanged; a window not yet migrated gets
  exactly the same ✕/drag/grip and nothing else. `#importsheet`'s own
  title-row/`.metpanel` special case in `sheetDrag`/`addGrips` is
  unchanged too — it isn't one of the six migrated windows.
- **Migrated (six):** `#asksheet` (AI — already had a right-only dock, now
  generalized), `#notelistsheet` (Notes), `#instsheet` (Instruments),
  `#jobssheet`, `#pubjobsheet`, `#infosheet`. **`#infosheet` (Status) was
  un-migrated to non-dockable in Phase B** (Josh, 2026-09-29) — a one-shot
  reveal for a truncated status line isn't a panel worth pinning open while
  working the roll; it's still registered with `makeWindow` (so it's a known
  window) but `{dockable: false}`, same as the import hub, so it gets no Dock
  control. Five windows are actually dockable now. **2026-10-04 (Terminal
  #111):** `#pubjobsheet` (the publish job dialog, "a very temporary
  window") went `{dockable: false}` the same way — `initWm1` purges a saved
  dock for it via `wmPurgeId` — and `#syncsheet` (the Publish window) was
  migrated dockable (`#syncsheet-h2`, `#syncsheet-home`, its `.docked`
  scrolling body is `#syncpending`). Dockable now: AI, Notes, Instruments,
  Jobs, Publish, Mixer.
- **Not yet migrated** (keep working exactly as before, via the generic ✕/
  drag/grip loops, with no Dock control): `#songsheet`, `#noteeditor`,
  `#aboutsheet`, `#drumsheet`, `#trsheet`, `#insbarsheet`, `#gridsheet`,
  `#divsheet`, `#drummersheet`, `#movesheet`, `#pastesheet`, `#chordsheet`,
  `#helpsheet`, `#midisheet`, `#errsheet`, `#bassistsheet`,
  `#settingssheet`, `#confirmsheet`, `#importsheet` (the one with its own
  drag/grip special case), the voice menu, `#viewsheet`, and the various
  anchored dropdowns/submenus.
- **A resized sheet's extra height has to go somewhere (2026-10-01, Josh on
  `#noteeditor`: "dragging the window's corner makes it bigger but the text
  area stays the same size — only the text area should grow").** `addGrips`'
  `◢` sets `box.style.height` directly on the `.sheet` div (already a flex
  column, `display:flex; flex-direction:column`), but every child defaults
  to `flex-grow:0` — the box grew, the rows inside it didn't, so the extra
  space just sat unused below the Save/Cancel row. Fix is one rule,
  `#noteeditor #ntext { flex: 1 1 auto; }` — `#ntext`'s siblings (the type
  row, bar/beat selects, chord/key/tempo/meter rows, Save/Cancel) keep the
  default and stay put; `#ntext` alone absorbs whatever height the grip
  adds. The existing `.sheet textarea { min-height: 84px }` floor is
  untouched, so the no-resize default size is unchanged. Width already
  tracked the sheet (`.sheet textarea { width: 100% }`); this was a
  height-only gap. Scoped to `#noteeditor` specifically, not every `.sheet
  textarea` — `#askinput` (the Ask composer) has its own JS auto-grow
  (`askGrow`, content-driven, unrelated to window resize) and must not pick
  up flex-grow too. Test: markup/CSS presence in tests/night-roll.test.mjs
  ("Annotation editor (#noteeditor)…") — the vm harness has no real flex
  layout engine to assert the resized pixel height against; browser-verify
  the actual growth before shipping.
- **Dock control:** one shared popup, `#wmmenu` (built fresh on each open,
  same pattern as `#voicemenu`/`#filesub`) — "Left" / "Right" / "Bottom",
  then (once docked to a side) "Full height" / "Beside the roll", then
  (once docked anywhere) "Float". Replaces the one-off `#askdock` text
  toggle ("Dock"/"Float"); a window's own button now reads "Dock" or
  "Docked: Left" / "Docked: Right (beside roll)" / "Docked: Bottom".
  Real-browser-only (`createElement`-built rows, gated the same way the ✕/
  grip/drag loops are) — not unit tested; tests call the action functions
  (`wmDockSide`, `wmDockBottomWindow`, `wmSetSideModeFor`, `wmFloat`)
  directly, the same way the step-2 tests called `wmToggleRight` instead
  of clicking `#askdock`.
- **Dividers:** one pair per side (`#wmdivider-left-full`/
  `#wmdivider-left-inner`, `#wmdivider-right-full`/`#wmdivider-right-inner`)
  — both in a pair drag the SAME `wm[side].w`, whichever cell is currently
  showing it; shown only while that cell is `.occupied`. `wmSideDividerize
  (divId, side)` is the one function instantiated four times. Right's
  dividers sit on the dock's LEFT edge (drag left widens, unchanged from
  step 2); left's sit on its RIGHT edge (drag right widens — the opposite
  sign). Plus `#wmdivider-bottomh` (height, top edge, drag up grows it) and
  `#wmdivider-bottomsplit` (the split, only shown with two windows).
- **Menus/popups vs. an INNER dock.** `songRegionRight()` (unchanged) still
  clamps correctly against a FULL dock (it shrinks `#songregion`'s own grid
  column) and needs no change for an INNER dock either — an INNER dock only
  narrows `#songcenter`'s internal row, not `#songregion`'s own outer rect,
  which is exactly right: header-row menus aren't supposed to avoid a panel
  that only sits beside the roll. No existing menu clamps against the LEFT
  edge (everything anchors from a header/footer button and only ever
  overflows right), so a FULL left dock needed no new clamp site either —
  noted here in case a future one does.
- **Tests:** `tests/night-roll.test.mjs`, "Window manager: …" — the step-2
  pure-helper and integration tests, generalized (`wmDockSide`/`wmFloat` in
  place of `wmToggleRight`; `document.getElementById(id+"-h2")._wmDockBtn`
  in place of `document.getElementById("askdock")`, since the button is
  built by `makeWindow()` rather than static markup — dynamically created
  elements aren't reachable by id in the vm harness, only ones the app
  itself looked up by a STATIC id and decorated in place, which is why the
  Dock button lives at a fixed `id + "-h2"` lookup, not its own id); new
  tests for docking left, FULL↔INNER mode switching (and that only FULL
  toggles `hasdock`), the one-dock-at-a-time invariant, a single- and a
  split two-window bottom dock (including a closed window's slot
  collapsing), the left divider's opposite sign, the bottom dock's height
  and split dividers, and the doubled migration (old `aidock` key, then
  the pre-phase-A shape backfilling `mode`). FEATURES keyword "Window
  controls".

### Docked-short content flexes; the header and input/button rows stay put (2026-09-29)

The bottom dock's default height (240px, `WM_DEFAULT_H`) cut off the ✦ AI
panel's input row, Speak/Send and Clear chat when it docked there — `.sheet`
(and `.sheet.help`) normally scroll AS ONE BLOCK when floating (`overflow-y:
auto`, the ✕ staying visible via `position:sticky`), which is fine when the
sheet has plenty of room, but at a short dock height the block simply
overflowed past the bottom, taking the input with it. `.overlay.docked
.sheet` now adds `overflow: hidden; min-height: 0` — the sheet itself never
scrolls while docked, it's exactly the dock's height — and each migrated
window's ONE scrolling body element gets `flex: 1; min-height: 0;
overflow-y: auto` scoped to `.docked` (`#asksheet.docked #asklog`,
`#instsheet.docked #instrows`, `#notelistsheet.docked #notelistrows`,
`#jobssheet.docked #jobslist`, `#syncsheet.docked #syncpending` (the
Publish window, 2026-10-04 — `#pubjobsheet` no longer docks),
`#infosheet.docked #infosheettext`). Every other row (the header `<h2>`,
chip rows, the input row, the button row) keeps its natural size as an
ordinary flex child of `.sheet`'s existing `display: flex; flex-direction:
column` — the body element is the ONLY one that shrinks, all the way to 0
if the dock is short enough, so the input/button rows are guaranteed to
stay visible at any dock height. `#asklog`'s own `min-height: 80px` (a
sensible floor while floating, where there's room to spare) does not apply
while docked — the docked-scoped rule's higher specificity wins over it,
letting the log shrink past 80px if that's what it takes.

### Phase B — drag-to-dock and tab groups (2026-09-29)

Josh's model, in his words: "a full window manager where I can drag these
windows over to the right hand side or drag them to the bottom … or drag
them to the left." Two pieces: **drag-to-dock** (grab a window's title and
drop it on a dock zone, the way IntelliJ/VS Code do it) and **tabs** (a
side dock cell holding more than one window, only one shown at a time). The
bottom dock is untouched — it stays a two-slot split, never a tab group
("the bottom's two halves stay a split," Josh).

- **`wm` shape, extended:** a side's slot is now a tab group — `{ids: [id,
  …], active, w, mode}` (was `{id, w, mode}`, one window). `ids` is every
  window ever dropped on that side, in tab order, unchanged by opening or
  closing (see "closing a tab" below); `active` is which one is actually
  parented in the dock cell and shown right now. Migrated once more on load
  (`wmMigrateShapeB`, pure) from the phase-A `{id}` shape, chained after the
  existing `wmMigrateShape` (mode backfill) in `wmLoad`. The bottom dock's
  shape (`{ids, h, split}`) is unchanged — it never had a single-id shape to
  migrate from.
- **Pure helpers (new):** `wmSetSide(state, side, ids, active, w, mode,
  innerWidth)` replaces a side's whole group (signature changed from the
  phase-A `(state, side, id, w, mode, innerWidth)`); `wmAddSideTab(state,
  side, id, innerWidth)` adds `id` as a new, active tab to an existing group
  (width/mode carry over), or starts a fresh one-tab group (default width,
  beside the roll) if the side was empty; `wmRemoveSideTab(state, side, id)`
  is the ONLY way a window leaves a group (closing never does — see below);
  it picks a fallback `active` if `id` was on top, and drops the side key
  entirely once its last tab leaves; `wmSetActiveSideTab(state, side, id)`
  brings one tab to the front (a no-op if it isn't a member);
  `wmSetSideWidth(state, side, w, innerWidth)` replaces the old `wmSetSide`
  as the divider drag's own helper (width only, ids/active/mode untouched).
  `wmWhereIs` now checks group membership (`ids.includes(id)`) instead of a
  single `id ===` — any tab in a group counts, active or not.
- **`wmDockSide(id, side, mode)` does double duty.** Dropping a window on an
  EMPTY side starts a fresh group; dropping on an OCCUPIED side (the same
  call, from the Dock menu, a drag, or a tab click) adds it as a new,
  active tab instead of replacing the group — Josh: "drag them... it takes
  up the whole bottom" was about the BOTTOM dock's existing two-slot
  replace behavior; sides now form a growing tab group instead. Tapping an
  existing tab (or re-dropping a window already in the group) is the exact
  same call (`id` already a member → `wmSetActiveSideTab` instead of
  `wmAddSideTab`) — one code path for "join" and "switch." Whichever tab
  becomes active, `wmDockSide` explicitly closes (`classList.remove("on")`)
  whichever sibling was showing before it — exactly one tab may be visible
  in the shared cell at a time.
- **Every group member stays parked in the cell, not just the active one**
  (`wmLayoutSide`, `wmSideMembers[side]` — an array now, generalizing the
  old single-element `wmSideEl`). Only the active one gets `on`; visibility
  is entirely CSS-driven off that (`.overlay.docked.on{display:flex}` vs
  the base `.overlay.docked{display:none}`), so switching tabs is nothing
  more than toggling `on` on two elements already sitting in the cell — no
  reparenting on every switch. Two self-correcting fixups run on every
  layout pass (so reopening a group member through its OWN header button —
  not the tab UI — still behaves sanely): if more than one member is
  simultaneously `on` (two independent header-button opens), the one that
  ISN'T the recorded `active` wins and becomes the new active (reopening a
  background tab brings IT forward, it doesn't just get silently re-closed
  as "a second window opened by mistake"); if `active` itself is closed but
  a sibling is open, that sibling is promoted — otherwise closing the front
  tab would strand the whole group with no way back in except the Dock menu.
- **✕ on a grouped window leaves the group** (`wmCloseWindow`, revised in
  review 2026-09-29). Switching tabs closes the other member, so a strip
  of only OPEN members vanished the moment you switched — the group
  looked like one window. Now the strip lists EVERY member, a chip tap
  opens its window and makes it active, and ✕ on a member of a 2+ group
  removes it from `ids` (the next member shows). A lone docked window's
  ✕ still just closes it and it stays docked for next time.
- **The tab strip** (`wmLayoutTabs`, one persistent element per side —
  `#dockleft-tabs`/`#dockright-tabs`, moved between the full/inner cell the
  same way the windows themselves are) shows one chip per member,
  labelled from the window's own `<h2>` text (`wmWindowTitle`, minus the
  Dock button `makeWindow` appended to it); tapping a chip calls
  `wmDockSide(id, side)` — the same "join/switch" path a drop does. "A
  group of one shows no strip" (`ids.length <= 1`) — refined further: a
  group where fewer than two members are currently open shows no strip
  either, since there'd be nothing to switch to. CSS: the cell became a
  flex column (`display:flex; flex-direction:column`) — the strip
  (`order:0`, natural height) sits above the docked window(s) (`.overlay.
  docked`, `order:1; flex:1 1 auto`, `height:auto` in place of the old
  hardcoded `height:100%` — flex:1 fills exactly the same space when
  there's no strip to share the column with).
- **Drag-to-dock.** `sheetDrag()`'s title-drag (previously blocked entirely
  on a docked sheet — "stays out of a docked sheet," phase A) now also arms
  on a DOCKED window's title; a plain tap still does nothing (an 8px move
  threshold, the app's existing gesture-threshold convention, reused here —
  gates BOTH the undock and the zone highlight, so a tap never rips a
  window out of its dock). Past the threshold: if the drag started on a
  docked window, `wmFloat(id)` undocks it, then the drag re-baselines from
  the box's newly-floating (centered) position so it continues exactly
  under the finger instead of jumping to center. On every move past the
  threshold, `wmZoneFor(x, y, rect)` (pure — `rect` is `#songregion`'s live
  bounding rect) reports which dock zone the pointer is over: `null` in the
  middle (float), `{side: "bottom"}` near the bottom edge, or `{side:
  "left"|"right", mode: "full"|"inner"}` within 15% of a side edge — chosen
  as ">= 15% of the song region's width/height at each edge," Josh's own
  number. **The full/inner split, resolved:** within a side's zone, the
  half nearer the SCREEN EDGE means Full height, the half nearer the roll
  means Beside the roll — chosen (Josh: "or pick a clearer affordance and
  say why") because it reads the same way the drag itself feels: drag
  further out for "more" (the whole height), stop just past the boundary
  for "less" (beside the roll only). A corner resolves to whichever edge
  the pointer is proportionally closer to (compares fractions of each
  axis, not raw pixels). `#wmdropzone` (a single translucent, `pointer-
  events:none` highlight, positioned by `wmShowDropZone` from `wmZoneFor`'s
  result — the outer/inner half of `#songregion`'s rect for a side zone,
  using `#songcenter`'s rect instead for the Beside-the-roll height) tracks
  the live zone; releasing over one docks there (`wmDockSide`/
  `wmDockBottomWindow` — dropping on an occupied side joins its tab group,
  same as the Dock menu); releasing in the middle floats it (today's
  behavior, unchanged).
- **The Dock menu is unchanged** and stays the non-drag way in (its own
  action-function calls — `wmDockSide`, `wmDockBottomWindow`,
  `wmSetSideModeFor`, `wmFloat` — are the same ones drag-to-dock and the
  tab strip call). At phone width every window still floats — no dock
  zones, no Dock control, same as phase A.
- **`#infosheet` (Status) is no longer dockable** (Josh, 2026-09-29,
  alongside this phase): `makeWindow("infosheet", {dockable: false})` — a
  one-shot reveal for a truncated status line isn't a panel worth pinning
  open while working the roll, the same reasoning as the import hub. Five
  windows are dockable now, not six.
- **Tests:** `tests/night-roll.test.mjs`, "Window manager: …" — new pure
  tests for `wmZoneFor` (every zone, the full/inner split, a corner, no
  rect, a zero-size rect) and the tab helpers (`wmAddSideTab`/
  `wmRemoveSideTab`/`wmSetActiveSideTab`/`wmSetSideWidth`), plus
  `wmMigrateShapeB`; an integration test for tab groups (joining, switching
  by re-dropping, the two self-correcting fixups, floating as the only way
  out); every phase-A integration test updated to the `{ids, active}`
  shape. FEATURES keywords "tab group", "Drag-to-dock". The vm harness
  (`tests/harness.mjs`) grew `.id` on every element `getElementById` vivifies
  (a real DOM element's `.id` always matches the id it was fetched by; the
  stub never set it, and tab-group code reads an element's own `.id` back
  to match it against `wm[side].ids`). `tests/e2e/docking.spec.mjs`
  (CI-only) covers the real pointer drag: dragging the AI window's title to
  each edge/zone docks it there; dragging a docked window out floats it;
  two windows on one side make a tab group and switching works; the
  WINDOWS fixture list dropped `infosheet`.
- **A much higher divider ceiling** (Josh, 2026-09-29, iPad: docked Right,
  Beside the roll, he hit the old 60%/70% cap before the panel covered the
  song — he wants to "drag the divider nearly all the way across to hide
  the roll for a minute, then drag back"). `wmClampSize`/`wmClampHeight`'s
  ceiling changed from a flat 60%/70% of the window to `innerWidth`/
  `innerHeight` minus `WM_EDGE_GAP` (32px) — a side or the bottom dock can
  now cover nearly the whole window, leaving only a thin grab strip of the
  song's edge, never so little the divider itself could be dragged
  off-screen. The floor (280px / 160px) is unchanged. **Double-tap a
  divider to reset it** to the default width/height (350ms, the app's own
  double-tap window, reused — same constant as the roll's own tap-vs-drag
  gesture) — cheap to add alongside the width-drag handler, so it rode
  along. **Canvas safety at a sliver width/height:** `pxqFloor()`/
  `rowHFloor()` were already defensive (`Math.max`/`Math.min` clamps, no
  division BY the shrinking dimension — only a numerator that goes
  negative and gets floored) — confirmed, not changed, by a new vm test
  that shrinks `wrap` to 32×32 and calls `resize()`/`clampView()`,
  asserting no throw and finite, sane numbers throughout. FEATURES keyword
  "double-tap the strip". `tests/e2e/docking.spec.mjs` (CI-only) drags the
  right divider nearly to the window's own left edge and back, and
  double-taps it to reset.
- **Also queued:** two timeline views at once (shared `view.x`/
  `playCursor` today); a real close-button ("x") on a tab chip to remove it
  from the group outright (today: drag it out, or Float from the Dock
  menu); reopening an inactive tab's window through its own header button
  bringing it forward is handled (see the self-correcting fixups above),
  but there's no VISUAL cue in the tab strip that a background tab exists
  until it's opened.

## Publish + share links (Phase 1 of the iPad app plan, 2026-09-26)

**"Edited since last save" means "differs from the published copy" (2026-09-29).**
A draft stores `pubSig`, a fingerprint of the published music (ppq and
notes; `musicSig`; not the tempo map, since Publish bakes the heard tempo from a
`tempo:` annotation into the .mid while the draft keeps the file's base
tempo, and tempo is an annotation, listed as one), and `draftDoc` compares against it, so an edit
undone is not an edit. Because a strict fingerprint still left songs
listed whose Compare showed +0 −0 ~0, the Publish sheet does not trust it
alone: `fingerprintOldDrafts` (on sheet open, and once a few seconds after
launch) compares every listed draft with the published `.mid` the way
Compare does (`pubCompareDraft`: `cmpDiff` notes at the draft's ppq). Matching drafts come off the list, and an unstamped
"never saved" one adopts the repo's stamp, since identical music masks
nothing. Drafts that differ show why on their line, for example
"vs published: +2 −1 ~0 notes (lead)". Each check
also leaves a [debug] line. The Publish (N) count recounts on every draft
write and every sheet redraw. Compare (`cmpEnter`) always fetches the
published copy now (Model B, below, superseding the auto-save-dependent
baseline this paragraph originally described).

**Words (step 1, 5add982):** the one deliberate step that sends a song
to the repo is **Publish** everywhere — File → Publish…, the footer
button (`#syncbtn`, "Publish (N)" when several songs are pending), the
PUBLISH sheet, ⇪ Publish song / Publish all, "Publishing…" /
"Published ✓" (folder mode says the same words now — see Model B). Drafts
still land on the device by themselves. Josh's open design point from
this step — "a user who never publishes has no checkpoint — a
Logic-style local Save is queued" — is Model B, below.

**Share links (step 2):** a link = this player + the song + where the
song lives. `?songs=owner/repo` (or a full base URL) puts the page in
**link mode** for that load only: `LINK_SONGS` (declared beside
`APP_BASE`; `linkSongsBase` parses, `linkRepoLabel` shortens a raw
GitHub base back to owner/repo) overrides the songs AND analysis bases
(mirror tree), `readData` skips the folder, `initCatalog` skips the
folder scan, `loadSongInner` skips this device's drafts, `loadNotes`
skips the local notes stash and the last-sync bridge, `setSong` skips
the meter stash, `rememberLastSong` (every last-song write) is a no-op,
`editableSong()` is false, `openEditor` and `askAddAnnotation` refuse,
the Publish sheet says whose songs these are and disables publishing,
the breadcrumb starts "🔗 owner/repo ›". Nothing is written, nothing is
remembered: a listening room. Path-form URLs keep the param
(`reflectSongURL` preserves every param but `song`; 404.html and the
service worker's offline redirect both keep the query), so the address
bar is the link. **🔗 Share link** in the Publish sheet → `shareLinkFor`
(path form; `songs=` only when the song lives elsewhere — a followed
link or a custom `songsBase`) → `navigator.share` on the iPad, else the
clipboard. Test repo: `joshcough/night-roll-test-songs` (a generated
scratch song; safe to delete). vm-tested: parse, label, link building;
browser-verified against the test repo over raw.githubusercontent.com.
Not yet: `analysis=` as a separate base (the mirror tree makes it
unnecessary so far); opening a link in the installed app offline
(cross-origin, so the SW passes it through).

**Connect GitHub (step 3):** Settings → GITHUB is a two-step setup —
"1. repo" (`#cfgsongsrepo`, promoted out of the advanced rows, with a
"create one ↗" button to github.com/new) and "2. token" (`#ghtoken`,
"make one ↗" to the fine-grained-token page, and **Check**). `ghCheck`
GETs `api.github.com/repos/<repo>` with the token; `ghCheckMessage`
maps 200+push / 200 read-only / 401 / 404 / 403 to one line each with
the fix in it, shown gold/red via `aiSay` in `#ghcheckout`; it runs by
itself when the sheet opens with a token stored. Defaults: a new user's
`analysisRepo` follows `songsRepo` (`cfg()` falls back to it, and
`settingsPersist("cfgsongsrepo")` moves analysisRepo along whenever the
two were equal — a deliberate split in the advanced rows stays split).
The Publish sheet's no-token line now says "Connect GitHub first". Josh
generated a new token for the home-screen app the same evening (the
installed app has its own storage; a token is never shown twice).

**The repo's song list (step 4):** after the manifest update,
`commitCompositionNow` calls `writeSongsReadme(h)`: GET the manifest
through the API, `songsReadmeBlock(albums, repo)` renders every album's
songs as player links (`shareLinkFor(path, repo)`; `APP_REPO` =
`Night-Roll-App/night-roll` needs no `songs=`, any other repo gets it),
`spliceReadme(existing, block)` creates the README, appends the block to
one without markers, or replaces only what sits between
`<!-- night-roll:songs -->` and `<!-- /night-roll:songs -->`, and a PUT
follows only if the text changed (one stale-sha retry). Never fatal: a
failure is a parenthetical on the "Published ✓" line. This repo's
README was seeded with the block (84 songs) so the first real publish
just refreshes it. Not run live yet (needs a publish); the block and
splice are vm-tested. Folder mode skips it.

**Settings, simplified (step 5a, same evening — Josh: "do we have a
reason for it to even exist?"):** the "data locations (advanced)"
rows are gone from the sheet. Songs are read from the site (other repos
arrive through links), annotations follow the songs repo, and the
**NSF repo** is now a visible optional field under GITHUB: chip audio
plays the original NSF, so publishing an imported album uploads its
.nsf there (a separate repo keeps game files out of the songs repo — a
takedown cannot touch the songs). Defaults in `cfg()`: `nsfRepo` is
Josh's public archive only when the songs repo is this site's; anyone
else starts with none, and `nsfBase` derives from `nsfRepo` when set.
With no NSF repo the import publish keeps the file on the device and
says so in the status line instead of failing. The cfg keys
`songsBase`/`analysisBase`/`analysisRepo` still exist for stored
values and the mirror-tree fallbacks; nothing writes them from the UI
any more.

## Background playback (2026-09-28, confirmed by ear in the iPad app)

Two halves, both needed. The shell (~/work/ff/night-roll-app) declares
Info.plist `UIBackgroundModes = audio` and sets AVAudioSession `.playback`
in AppDelegate. That alone did not keep playing: WebKit chooses the web
view's own audio session, and plain Web Audio gets an ambient one that iOS
silences off-screen. `ensureAudio()` therefore sets
`navigator.audioSession.type = "playback"` just before it creates the
AudioContext. The engine itself is unchanged. Josh's test: a Chrono
Trigger song kept playing off-screen ("basically good enough"). Synth
songs and album advance off-screen ride the page's timers and were not
reported separately. The August silent `<audio>` keep-alive loop stalled the iPad and
stays gone (c704c43).

## The ⚠ log: two levels (2026-09-28)

`logErr` is for problems Josh can act on and raises the ⚠ chip.
`logDebug` is for diagnostics: audio state changes, engine rebuilds, and
wake-up probes that found the clock not moving. It is kept in `appDebug`
and shown or counted only with Settings → Other → Debug log on (device-local
`ff1roll-debuglog`). A line identical to the previous one becomes ×N.
`askAppState` feeds Ask the last lines of both when the switch is on.
`clockAlive` watches the clock for up to 500 ms; the old 40 ms probe
called a healthy context dead on return from the background, which
logged "audio asleep ×7" while the music played on. On return, a context
that is running and playing is left alone, and only one wake runs at a
time; a rebuild still happens only inside a tap.

## Quiz page (quiz/) — standalone, not linked (2026-10-04)

docs/plans/2026-10-04-quiz.md (Fable-reviewed); the full write-up and the
exact integration points are docs/quiz.md. Josh: "build some quiz stuff
too. Just keep it isolated" — so `quiz/` sits at the repo root, NOT under
src/ (check.mjs rule 8 would force it into the modulepreload list, sw.js
`APP_MODULES` and devtools.js, which imports every module at app boot —
the opposite of isolated). Open it at `/quiz/` (localhost:8000/quiz/ or
the Pages URL); nothing in the app points at it; tools/package.mjs never
copies it (TOP_DIRS), so it is not in the iPad app.

- Files: `quiz/index.html` (own doctype/viewport, no manifest, no SW
  registration, classic `vendor/vexflow.js` then `main.js`), `quiz.css`
  (css/app.css's `:root` tokens COPIED — tests/quiz.test.mjs fails on
  drift — never linked: 65 KB of app layout would fight the page),
  `main.js` wiring, `bank.js` (quizzes.md parser), `srs.js` (five-box
  Leitner), `drills.js` (generators + grading), `tone.js` (WebAudio
  oscillator, created inside the first tap for iOS), `ui.js` (the ONLY
  file that touches `document`).
- Allowed app imports, enforced by test: `src/theory/chords.js`,
  `src/theory/key.js` (pure functions; its `S` import is read only by
  fileKeyAt/checkMeterVsFile, which the quiz never calls), `src/ui/piano.js`
  (DOM-free key geometry — the keys drill draws with `pianoGeom`). Nothing
  from audio/, chrome, session/, ask/, model/, platform/.
- Bank: `fetch("../docs/learning/quizzes.md")`, falling back to
  `../quizzes.md` (whichever the repo tidy has left). Sections = `##`/`###`
  headings (the "## Protocol" section and its ### children are skipped —
  instructions, not questions); questions = `- ` list items, indented lines
  continue them; `[ ]/[x]/[~]` marks are read (starting box 0/2/1) and never
  written; a trailing "(Answered …)" parenthetical with no `?` in it is a
  `note`, shown only after the grade and only on a tap. The id is FNV-1a of
  the normalized text, so progress survives whitespace edits and
  reordering. Pick order = quizzes.md's own: lowest box, then longest since
  asked; Got it = box+1, Shaky (`[~]`) = box 1, Missed = box 0; rest 0/1/3/7/21
  days. No answers anywhere — the page never invents one.
- Drills: generic only (Learning mode — never a song, never his music; the
  test scans quiz/*.js for `ff1roll-notes`, `ff1roll-draft`, `albums/`,
  `S.song`). Interval ear/staff/keys, chord quality ear, scale degree ear,
  key signatures both directions, spelling in a key (the enharmonic twin
  is a distractor and is NOT accepted — `checkAnswer` honours
  `drill.enharmonicOk`, false for spelling). A miss dims the choice and
  says "not that one"; nothing is revealed; the first-try streak drives the
  level (`levelFor`: five in a row per level, three levels).
- Device-local keys `ff1roll-quiz-srs` / `ff1roll-quiz-prefs`, every access
  in try/catch (the footer says when storage is blocked). Verified: the app's
  `askEvictOthers` only touches `ff1roll-ask-*` and `hasExistingNightRollPrefs`
  only checks lastsong/cfg/ghtoken/notes-/draft-, so the quiz keys can
  neither be evicted by nor flip anything in the app.
- **sw.js bypass (the hazard that had to ship WITH the page):** every
  in-scope navigation went through `networkFirst(req, {key: "index.html"})`,
  whose `c.put` would have overwritten the cached app shell with the quiz
  page (privacy.html had the same latent bug). One early return before the
  navigate branch — `if (rel === "privacy.html" || rel.startsWith("quiz/"))
  return;` — `SW_VERSION` nr-v35; tests/pwa.test.mjs pins it before the
  navigate branch and after `rel` is computed. quiz/ is therefore online-only
  (not precached, not served from cache).
- Tests: tests/quiz.test.mjs (`"quiz"` in tools/run-tests.mjs FILES): the
  real quizzes.md parsed and counted independently; Leitner promotion/
  demotion/due/pick order; 500 seeded draws per drill kind and level
  (validity, coverage, every key a real signature by `keyNameToSf`); the
  enharmonic rule; the import whitelist; the Learning-mode scan; no native
  dialogs; the package TOP_DIRS; token drift; a stub-DOM smoke that renders
  every view and plays every drill kind (miss, then hit).
- Integration points (NOT wired; docs/quiz.md has file + function): View ▾
  → Tools → Quiz (index.html `#vwToolsRow` after `#cofbtn`; wiring in
  src/input/gestures.js `initGestures2()`; `CONTROLS` registration), a
  help-sheet `<dt>Quiz</dt>` under `data-hsec="explore"` + build_help +
  FEATURES keyword, an AI "quiz me" hook (src/ask/context.js `askContext`'s
  `S.askGeneral` branch, or a `read_quiz_bank` tool in src/ask/tools.js
  `ASK_TOOLS` + `askRunTool`).

## Installable app — PWA (Phase 0 of the iPad app plan, 2026-09-26)

`app.webmanifest` (NOT `albums/manifest.json`, the song catalog) +
`icons/` (generated by a dependency-free PNG writer — dark tile, three
note bars in the track colours, gold playhead; 192/512/maskable/
apple-touch) + `sw.js`, registered at boot from `APP_BASE` (scope =
the app directory, so `/night-roll/` on Pages). Head carries the
manifest link, `theme-color`, the `apple-mobile-web-app-*` metas and
the touch icon; header/footer already pad by `env(safe-area-inset-*)`.

**sw.js strategy** (same-origin only; GitHub's API, model servers, the
WebLLM CDN pass through untouched):
- navigations: network-first with a 4 s timeout, else the cached
  index.html — so a stale page can never stick while a network exists.
  The network fetch is `cache: "no-cache"` (revalidate): the browser's
  own HTTP cache answered a plain fetch and a reload showed the previous
  build (found 2026-09-26 while checking Settings at iPad width).
  A **path-form song URL offline** is redirected to `./?song=…` (what
  Pages' 404.html does online); serving index.html AT that path made
  the app take the song's directory for `APP_BASE` and every relative
  fetch missed (found in the first browser check).
- `src/**` (docs/split-plan.md §4 step 0b, 2026-10-02 — the ES-module
  cutover, see "Module map" above): network-first with the same 4 s timeout
  and revalidate as the page itself, NOT cache-first like the other
  precached assets — index.html's own `max-age=600` on Pages would otherwise
  let a browser serve a fresh index.html (always pointing at the same
  `src/main.js` URL) alongside stale cached modules from the previous
  deploy, same bug class as the index.html one above. `APP_MODULES` in
  sw.js lists every file; all four are precached at install.
- `vendor/vexflow.js`, the manifest, icons: cache-first, precached.
- `vendor/soundfonts/*`: cache-first, cached on first use — 83 MB is
  never precached (iOS quota, slow installs).
- `albums/**` incl. the catalog: network-first with cache fallback; the
  `?t=` buster is stripped from the cache key, so cross-device freshness
  keeps working online. **Every catalog song is warmed into the cache**
  (`warmSongs`: on activate and on a "warm" message the page posts at
  every online boot) — all albums together are ~1.2 MB of .mid +
  .rollnotes.json + album.json, so any song opens offline, not just the
  ones opened before (Josh's first airplane-mode test: a fresh song
  "just hangs"). Soundfonts stay cache-on-first-use. Two footguns met on
  the way: the manifest Response must be cloned BEFORE `.json()` reads
  it, and `readData` now aborts a fetch after 12 s (`AbortSignal.timeout`)
  so a hung CDN or a dead network cannot lock `songLoading` for good —
  `loadSong` catches, says "couldn't open <song> — offline and not on this
  device yet" in the info strip, and returns false (the old CDN-blip hang
  in open-items is closed by this).
- `sw.js`, `404.html`: never intercepted.
- `quiz/**`, `privacy.html` (2026-10-04, SW_VERSION nr-v35): never
  intercepted either — they are their own pages, and the navigate branch
  below writes whatever it fetched under the key `index.html`, so a visit
  to either would have replaced the cached app shell (see "Quiz page").
One cache, `night-roll-<SW_VERSION>`; a new version drops the old
cache on activate (`skipWaiting` + `clients.claim`). Kill switch:
`?sw=0` unregisters and clears (the PERF_FLAGS reader). The File menu's
build line says "· installed" in standalone mode and "· offline" when
the browser reports no network. Tests: tests/pwa.test.mjs (manifest
valid + icons exist + not the catalog's shape; head links; sw.js parses,
precache entries exist, soundfonts never precached, cross-origin passes
through). Browser-verified on the Mac: install, precache, song cached on
open, server stopped → page and song load; path-form URL offline →
redirect → song loads. Josh's iPad: Safari → Share → Add to Home Screen.

**Boot watchdog** (docs/split-plan.md §4 step 0b, 2026-10-02): a classic
(non-module) inline script in index.html's `<head>`, so it still runs even
when `src/main.js` 404s or throws before app.js's own `boot()` ever starts —
the one new way a page can go blank that a single inline `<script>` never
had. Arms `window.__nrBoot = setTimeout(nrBootFail, 10000)` and an `error`
listener; `src/app.js`'s `boot()` clears it as its first statement (not its
last — a slow catalog fetch must never trip a false alarm; the module graph
having loaded far enough to start running `boot()` is already past the
dangerous window). `nrBootFail` shows an in-page panel (never a native
dialog — CLAUDE.md's hard rule): the error text, Reload, and Reset cache
(`?sw=0`, the kill switch above).

## Dev channel — removed 2026-09-26

The `?dev=1` in-app dev channel (💬 Feature request → ntfy request
topic, 🛰 replies via EventSource, history sheet, two Settings fields)
is gone: the AI bridge in full mode does the same job synchronously
from the ✦ Ask sheet and the conversation lands in `<song>.ask.md`
(Josh: "absolutely the dev channel is gone"). Code lives in git history
(last at 88b83b0). The deploy-notice ntfy topic used by terminal
sessions is unrelated and stays.

## Recording past the end (2026-09-26)

Josh's son (MIDI keyboard, arpeggiator) recorded into a fresh two-bar
song and the take looped onto bars 1–2. `playSec()` maps transport time
back into `loopSeg` (0 → song end) and the scheduler re-arms a pass at
the end. While `recording`, `play()` now replaces the segment with
`recOpenEnded(seg)` (same start, `end: Infinity`): `playSec` stays
linear, the wrap loop breaks on a non-finite end, chip-buffer loop
points clamp to the buffer, and `recFinish` → `computeSongEnd` grows the
song to the take's last bar. `recFinish` also writes the draft, so the
take is in the working copy immediately. ● can only be armed from a
stop (● while rolling = stop), so the check in `play()` covers every
path.

## Raw recording + Quantize (2026-09-30)

DAW convention (Logic, GarageBand, Cubasis, Josh's advisor review
`open-items.md` "DAW CONVENTIONS REVIEW" item 2): recording keeps what
you played; a separate Quantize command snaps it afterward, undoably.
Night Roll's recording used to snap every note-on/note-off to the move
grid AS it recorded — fine for exact playing, punishing for anything
looser (a MIDI keyboard's natural feel, a fast run).

- **`recSnap(t)`** (index.html) is the one chokepoint both `recNoteOn`
  (the start) and `recNoteOff` (the end) run every tick through. Default
  (`recSnapOn()` false): raw — `Math.max(0, Math.round(t))`, an integer
  tick, no grid. `recSnapOn()` true: the old behavior, `Math.round(t /
  g) * g` against `moveSnapTicks()`. A raw take's minimum note length
  floors at the app's usual shortest-editable-note number (`Math.max(24,
  Math.round(song.ppq / 8))`, the same number `resizeSelection` uses) so
  a very fast tap can't leave a zero/negative-length note; a snapped
  take's minimum stays one grid step, unchanged.
- **The pref**: `recSnapOn()` reads `localStorage["ff1roll-recsnap"]`
  (default off — not present). Settings → Other → **Snap while
  recording** (`#cfgrecsnap`, wired through the pane's existing generic
  `change` → `settingsPersist(id)` door, same pattern as `cfgpeninstant`/
  `cfgnotetapcursor`). This is a DEVICE pref, not song state (an input
  behavior, not something the song remembers).
- **Quantize (`quantizeSelection(strength, alsoEnds)`, index.html, beside
  `divideSelection`)**: a command on the SELECTION (`selEditItems()`),
  same door as nudge/divide/transpose. For each note: `snap(t) =
  Math.max(0, Math.round(t / g) * g)` against the current
  `moveSnapTicks()` grid; `blend(raw, target) = Math.round(raw + (target
  - raw) * strength)` — `strength` 1/0.75/0.5 (the sheet's 100%/75%/50%
  chips) moves the note exactly onto the line, or partway there.
  `alsoEnds` (a sheet checkbox, off by default) additionally quantizes
  each note's END the same way and resizes `n.d` to match; off, only the
  start moves and the played duration survives untouched — most raw
  takes want their durations kept and only the onsets straightened.
  Routes through the existing `selEditApply(items, mutate)` helper
  (mutate + one `{kind: "mod"}` `pushUndo` + persist + redraw) — the
  SAME one-undo-step machinery divide/nudge/transpose already use, so
  Quantize needed no new undo kind.
- **Exposure**: edit-row `#quantbtn` ("Q Quantize", behind `⋯`, beside
  ➗/⁀ — same `#morewrap` section, same `updateEditButtons` gate as
  divbtn/trbtn: grayed with nothing selected), `Edit ▾ → #emQuantize`
  (proxies the button, same pattern as `emDivide`), and hardware key
  **Q** in the Logic keys handler beside K/C/R — `editableSong()` is
  checked right in the key handler (not inside `quantizeSelection`
  alone, so a read-only song gets an immediate "Quantize works on your
  own songs" instead of opening a sheet that can't do anything). The
  strength sheet (`#quantsheet`, `#quantchips`) is built once on first
  open, same lazy-build pattern as `#divchips`/`#trchips`.
- **Help**: `● Record`'s entry now says recording keeps what you
  played and names the pref and Q; a new `Quantize (Q)` entry sits
  beside `Divide (➗)`; the Hardware keyboard and Edit menu entries list
  Q too.
- Not done (at the time): the hardware-key Q needs a connected keyboard
  on the iPad (no on-screen equivalent needed — the Q Quantize button
  covers touch already); iPad CoreMIDI (item 2's other half — a real
  MIDI keyboard on the iPad itself) was still open — see the next
  section, now done.

## Capture MIDI — "Keep that" (2026-10-04, DAW shortlist F3)

Logic's Capture Recording / Ableton Note's retrospective record: the keys
and MIDI-in are always listened to, and a phrase played with nothing
recording can be kept after the fact. `src/input/record.js`:

- **One entry point for a played note.** The on-screen keys
  (`src/input/keyboard.js`: `instPointerDown/Move/Up`, `instLetGo`) and
  MIDI-in (`midiMessage`, Web MIDI and the CoreMIDI bridge alike) call
  `inputNoteOn(key, p, vel)` / `inputNoteOff(key)` and never decide where a
  note goes: ● rolling (`S.recording && S.playing`) means `recNoteOn/Off`
  own it exactly as before; otherwise `captureNoteOn/Off` do. A glissando
  opens a new note only when the KEY changes (`instPointerMove` compares the
  finger's last key, `pt.p`) — a finger wiggling on one key used to re-enter
  `recNoteOn`, which closes-and-reopens, splitting a held Record note.
- **The buffer.** `S.captureBuf` (src/state.js): `{at, off, p, vel, key}`
  in `performance.now()` ms, `off === null` while held. `captureTrim(now)`
  drops entries older than `CAPTURE_MS` (60 s) on every note-on and on
  Keep; `setSong` empties it (a phrase noodled over the last song is not
  this song's). RAM only, by rule — a take is not song state until it is
  written, so nothing reaches localStorage or the draft.
- **Keep that.** `#instkeep` (end of `#instbar`, a `CONTROLS` entry) and
  Edit ▾ → 🎹 Keep that (`emKeep`, a proxy click) call `captureKeep()`.
  Gates, each with its status line: `editableSong()` (the Record gate —
  captures and read-only songs refuse), `S.recording` (● owns input),
  `tr.kind === "audio"`, an empty buffer. Timing: the phrase's first note
  lands at `curTick()`; every other on/off is `secToTick(song,
  tickToSec(song, cursor) + (ms − t0)/1000)` — THROUGH the tempo map from
  the cursor, so a tempo change inside the phrase lands where Record would
  have put it, and `S.playRate` applies the same way Record's `playSec`
  does. Ticks go through `recSnap` (raw, or grid with the Snap-while-
  recording pref) and the Record floor (`recMinD`). Each note is written by
  `recTakeNote(tick, end, p, vel)` — the push `recNoteOff` itself now uses
  (track note, `rawNotes` twin, `S.recTake` index; an on-screen key with no
  velocity takes `S.pencilVel`) — and `recCommitTake("kept")` is the same
  commit `recFinishImpl` runs at ■: one `addBatch` undo, `saveEdits`,
  `saveDraft` for compositions/local drafts, `computeSongEnd`, score model.
  The buffer is cleared only after a successful Keep; a refused one keeps
  the phrase for the next try.

Tests: tests/night-roll.test.mjs "Capture MIDI (Keep that)" (120 vs 90 bpm
mapping, a tempo change mid-phrase, velocities, one undo) and "Capture
MIDI: the buffer keeps the last 60 s…" (cap, song change, the four gates,
Record precedence); tests/gestures.test.mjs "keyboard: a key tapped while
nothing records…" (press/lift, glissando, ● rolling). Help: Editor →
"Keep that (Capture MIDI)". No hardware key yet (open-items).

## Velocity lane (2026-10-04, DAW shortlist F4)

Logic's velocity lane under the piano roll. `src/ui/vellane.js` (layer 4,
ui; in the three manifests + devtools, `initVellane1()` after
`initKeyboard2()` in main.js):

- **The strip.** `#vellane` (a 72 px `#velcanvas`) sits between
  `#songcenter` and `#editrow`, so it spans the whole band under the roll
  and its inner docks. View ▾ → Panels → Velocity lane (`vwVel`, a
  `CONTROLS` row with the `barChart` icon) → `toggleVelLane()`/`setVelLane`;
  `S.vwVel` is the device pref `ff1roll-vel-open`, OFF by default. Visible
  only when `velLaneWanted()`: a song is open, `S.viewMode === "roll"`, not
  Fall — `drawVelLane()` runs from `drawFull` on every repaint and applies
  that itself (`applyVelLane`, sizing the canvas the moment it appears), so
  Tracks/Score/Listener never show it and `applyViewMode` needed no edit.
- **Geometry.** `velGeom()`: `yOf(v)` maps 1..127 between `VEL_PAD_TOP`
  and the baseline, `vOf(y)` the inverse, clamped (`velClamp`, never 0);
  `left` is the roll's x offset inside the strip (an inner left dock
  shifts both). Stalk x = `velNoteX`: `left + S.RULER_W + n.t·pxPerTick −
  S.view.x` — the roll's own mapping, nothing of its own to drift.
  `velVisible(g)` lists the on-screen stalks in paint order (other tracks
  first, the selected track last; hidden tracks and audio tracks skipped).
  Look: the track's colour, the selected track at 0.85 alpha, the rest
  0.4, lasso'd notes ringed `--gold`; 32/64/96 guide lines; a chip note's
  `n.ve` (parse.js's software-envelope decay target) as a 0.5-alpha line
  falling from the stalk top to `yOf(ve)` across the note's width — a fact,
  never editable.
- **The gesture.** `velHit(x)`: within `VEL_GRAB` (7 px) of a stalk's
  centre; a selected note beats an unselected one, the selected track beats
  the rest, then nearest — so a chord's stalks (one x) resolve to the one
  lasso'd. `velPointerDown`: `editableSong()` false → the stalks stay, the
  drag is refused with `velLockedLine()` (captures: "facts from the capture
  — Edit a copy"); else the drag's items are `selEditItems()` when the hit
  is in the selection, the one note otherwise, with a pre snapshot
  (`S.velDrag = {pid, items, pre, v0, v, hit, moved}`). Move:
  `velDragApply(vOf(y))` — one note is set; a selection scales
  proportionally, `velScaled(preV, v0, v) = clamp(round(preV · v/v0))`, so
  the grabbed note follows the finger and every other keeps its ratio to it;
  `draw()` each step (the roll's brightness tracks it; the live value is
  printed beside the stalk). Up: `selEditApply(items, noop, pre)` — ONE
  "mod" undo entry holding the pre values, the same call and entry the vol
  slider's release and Quantize use (rawNotes twin synced, saveEdits,
  computeSongEnd, score model); a still tap or a `pointercancel` restores
  the pre values and pushes nothing.

Velocities are .mid data: nothing lane-local is stored, and the pref is
the only localStorage key. Tests: tests/gestures.test.mjs's five
"velocity lane" cases (pref + roll-only visibility + relaunch; geometry and
hit preference; single drag, clamps, one undo per drag, still tap, cancel;
proportional scaling + clamp + undo exactness + a stalk outside the
selection; the locked gate). Help: Editor → "Velocity lane". No hardware
key (open-items).

## iPad CoreMIDI bridge (2026-09-30)

Josh's son records from a MIDI keyboard via Web MIDI on a MacBook
(`initWebMidi`, `navigator.requestMIDIAccess`) — that already worked.
The iPad app wraps the page in a Capacitor WKWebView, which implements
NO Web MIDI at all (not even the empty-inputs case Safari-the-browser
gives you); a keyboard plugged into the iPad did nothing. Fixed with a
native bridge, the same shape as 📷's Screenshot plugin.

- **Native** (`night-roll-app` repo, `ios/App/App/AppDelegate.swift`):
  `CoreMidiPlugin` (`@objc(CoreMidiPlugin)`, `CAPPlugin` + `CAPBridgedPlugin`,
  `jsName = "CoreMidi"`), registered in `MainViewController
  .capacitorDidLoad` right beside `ScreenshotPlugin`. One `MIDIClientRef`
  + one `MIDIPortRef` (`MIDIClientCreateWithBlock` /
  `MIDIInputPortCreateWithBlock` — block-based, no C read-proc juggling),
  connected to every `MIDIGetSource(i)` on `start()` and reconnected on
  `kMIDIMsgSetupChanged` (a keyboard plugged in mid-session shows up
  without restarting the bridge) — `connectedSources: Set<MIDIEndpointRef>`
  skips sources already connected so a setup-changed storm doesn't double-
  wire one. `stop()` disposes the port + client. `list()` returns source
  display names.
  `handle(packetList:srcConnRefCon:)` walks the `MIDIPacketList` with
  `MIDIPacketNext` on a pointer INTO the original buffer (never a copy of
  a `MIDIPacket` — the struct's fixed 256-byte `data` tuple means a copy's
  "next packet" arithmetic lands in unrelated memory; `MemoryLayout
  .offset(of: \MIDIPacketList.packet)` finds the real field offset instead
  of hand-coding the platform's struct padding). CoreMIDI delivers raw
  wire bytes, which may use running status (repeated status bytes
  dropped) — Web MIDI's `MIDIMessageEvent.data` never does, so `expand()`
  turns each packet into complete 1–3 byte messages (per-source running
  status, `runningStatus: [MIDIEndpointRef: UInt8]`) before calling
  `notifyListeners("midi", data: ["data": [Int], "source": name])` once
  per message, on the main queue. Compiles clean at the project's iOS 15
  deployment target (`xcodebuild … build`, no install/run).
- **Web** (`index.html`, `initWebMidi`/`initCoreMidi`): both paths land in
  one `midiMessage(data)` (status/note/vel — the exact shape
  `MIDIMessageEvent.data` already had) so recording, preview and the
  instrument panel are identical either way. `initWebMidi` checks
  `Capacitor.isNativePlatform()` FIRST — the old guard bailed immediately
  on `!navigator.requestMIDIAccess`, which is also true in the iPad app's
  WKWebView, so native has to be checked before that. `initCoreMidi`
  prefers `Capacitor.Plugins.CoreMidi.addListener`/`.start`/`.list` (the
  JS Capacitor auto-generates once a plugin is `registerPluginInstance`d
  natively — confirmed by reading `JSExport.exportJS` in the Capacitor iOS
  package: `registerPluginInstance` calls it directly, so the wrapper
  exists as a `WKUserScript` before the page's own script runs, same as
  Screenshot's `Plugins.Screenshot` already relied on); falls back to the
  bare `Capacitor.addListener("CoreMidi", "midi", cb)` /
  `Capacitor.nativePromise("CoreMidi", "start", {})` primitives
  (`native-bridge.js`'s `initEvents`/`initNativeBridge` — the same calls
  the generated wrapper itself makes, not a guess) if the wrapper object
  is ever missing. `nativeMidiNames` (module-level) tracks connected
  source names, seeded from `list()` right after `start()` resolves and
  grown from each event's `source` field; `setInfo("MIDI keyboard
  connected: " + name)` on first sight. `midiStatusLine()` branches on
  native-with-names before the Web MIDI checks.
- **Tests**: `tests/night-roll.test.mjs`, "CoreMidi bridge" — a stubbed
  `window.Capacitor` (`Plugins.CoreMidi.addListener/start/list`, then
  separately the `Capacitor.addListener`/`nativePromise` fallback with an
  empty `Plugins`) delivers note-on/off bytes through the captured
  listener callback and asserts the SAME `{t, d, p}` a raw Web MIDI
  recording would produce (cross-checked against the raw-recording test's
  own numbers). Swift isn't unit-tested by the vm harness — running-status
  expansion is native-only code, so it's covered by the compile check,
  not `npm test`.
- **Help**: `● Record`'s entry gets a sentence — "A MIDI keyboard works on
  the iPad app too" (also the drift-guard keyword in
  `tests/night-roll.test.mjs`'s FEATURES list).
- **Not done**: real-hardware test — Josh needs to plug an actual MIDI
  keyboard into the iPad and try it (open-items.md, DAW item 2). Bluetooth
  MIDI is untested and the app's `Info.plist` has no
  `NSBluetoothAlwaysUsageDescription`; a wired/USB-C keyboard needs none,
  but a BLE MIDI device would likely need that key added before CoreMIDI
  can see it. Reconnect-on-setup-changed doesn't prune
  `connectedSources` when a source disappears, so an unplugged-then-
  replugged device with the SAME `MIDIEndpointRef` (CoreMIDI usually
  reuses it for the same physical port) is fine, but a genuinely new
  endpoint ref for what's "the same" keyboard would connect as expected
  since it isn't in the set yet — the risk is only a leaked entry for a
  ref that's gone for good, which just means one fewer relevant no-op
  connect attempt on the next setup-changed, not a functional bug.

## Compare with repo (2026-09-25)

Josh: "I have seven songs where it says the notes are changed, but I
don't know what things have changed." Option 3 of three (the others,
queued: a what-changed list in Save & Commit; an undoable Revert).

- **Entry:** View → "⇄ Compare with repo" (same words in folder mode
  since Model B, below; dimmed unless the open song is a composition
  with a key), or the
  **Compare** button on the open song's "♪ music edited" line in Save &
  Commit. `cmpEnter` reads the saved .mid through `readData("songs", key,
  bust)` (folder first, then the site — the same door every load uses),
  `parseMidi`s it, rescales ticks if the ppq differs, and stores `cmp =
  {repo, diff, showing: "mine", mine: null}`. Refuses with a chop applied
  (`chopS > 0 || chopE !== null`; `appliedChop` is a string key, truthy always) and on a song with no save behind it (404 → "no saved
  copy … yet"). `setSong` clears it: compare belongs to one song.
- **Diff** (`cmpDiff`, pure, vm-tested): tracks matched by name, unnamed
  ones by position (`cmpTrackKey`); a note's identity is tick+pitch
  (tools/song-diff.mjs's rule); `gone` notes count as removed; a changed
  note = same tick+pitch, different `d` or `v`. Result: per-track
  `{name, ti (current index or -1), added, removed, changed:[{was, now}]}`
  plus totals.
- **Roll:** `drawCompare` runs inside `drawFull` after the note loop (so
  the scene cache holds it): red outline = the saved copy's note, gold =
  yours, both on a changed note; **dashed = absent from the version you
  are hearing**. Tracks with no current counterpart are counted in the
  bar, not drawn (nowhere to put them).
- **Swap** (`cmpShow`): "hear the saved copy" stops the transport,
  remembers `song.tracks[i].notes` in `cmp.mine`, swaps copies of the
  saved notes into the SAME track objects (voices, gains, mute/solo,
  lanes keep working), clears selection and the lane/32nd caches,
  recomputes the song end, and resumes from the same second with no
  count-in. Swapping back restores the original arrays (undo entries
  keep their indices). While `cmp.showing === "repo"`: `editableSong()`
  is false (every edit path and the edit keymap go quiet), `saveDraft`
  returns without writing (the one way this could have destroyed his
  edits), and `commitCompositionNow` refuses with a message. Leaving
  compare always swaps back first.
- **Bar** `#cmpbar` above the roll: what you hear, +yours-only (gold),
  −saved-only (red), ~changed, the swap button, ✕. Help: Views → "⇄
  Compare with repo". FEATURES keyword "Compare with repo".
- `let cmp` lives with the early editor state (next to `multiSel`), not
  in the compare chapter: `setSong`, `editableSong` and `renderViewMenu`
  read it, and the phone-folded boot renders the View menu before the
  script's tail has run — b590306 bricked that boot (TDZ), the e2e
  "phone-size boot … (no TDZ bricks)" caught it, 060a491 fixed it. Any
  new `let` that boot-path code reads goes up there too.
- Not done: playing a track that exists only in the saved copy (no
  track object to play it through); compare under a chop.

## Audio tracks — recordings as tracks (branch `audio-tracks`, 2026-09-15)

Josh's son: "I wouldn't use it unless it supported waves." Design and
the advisor review that reshaped it: `docs/design/wave-tracks-design.md`. Depends
on local folder mode (above) for a home that is not GitHub.

**Model.** An audio track is an ORDINARY empty track in the .mid (what ＋
creates) plus one `audio:` annotation naming it. Caveat found on the
first round trip: `parseMidi` keeps only tracks that have notes, so a
song reloaded from its saved .mid arrives WITHOUT the clip's track;
`applyAudioDirs` recreates it by name on editable songs (the
`addTrackUndoable` shape, so trackState/rawNotes stay in step). In
practice, then, the annotation is the track's identity and the .mid
entry is a courtesy for Logic:
`audio: <track> file=<slug> offset=<sec> local=1` /
`{"at":[5,1],"type":"audio","track":"guitar","file":"take.m4a","offset":0.25}`.
`applyAudioDirs()` (from `finalizeNotes`, right after the `track:` pass)
derives `tr.kind = "audio"` and `tr.clip = {file, at (tick), offset,
local, dur, buffer, peaks, status, where, note}` onto the named track,
last-wins per name, and clears them when the annotation is gone — the
voice/color mechanism exactly. The text form is canonical (every type
round-trips through text; `saveLocalNotes` persists text). Moving a clip
changes the note's identity, so `setClipDir()` tombstones the old note
and pushes a fresh `added` one (one `anno` undo entry). `renameTrack`
migrates the directive. `serializeNotesList` dedupes `audio:` per track
like `track:`. Filenames are slugified (`slugFile`) — the kv grammar is
`\S+`.

**Pieces (same day, Josh: "trim, cut, and move").** A track holds
`tr.clips[]`, one per `audio:` note; `len=<sec>` joins `offset=`. A piece
spans `[at, at + len]` in song time and plays the file from `offset`
(nothing sounds before its anchor — the earlier "file head before the
anchor" reading is gone). `clipLen(c)` = `len` or the rest of the file.
Dedupe is exact-twin only (anchor + text), not per track. `writeClips(ti,
clips)` rewrites all of a track's audio: notes in one `anno` undo step;
`setClipDir(ti, ci, patch)`, `moveClip`, `trimClip(ti, ci, "L"|"R",
dTicks)` (left keeps the sound in place: anchor and offset move together),
`splitClipAt(ti, ci, tick)`, `deleteClip(ti, ci)` all go through it.
`selClip = {ti, ci}`. `hitTracksClip` returns `{ti, ci, zone}` with
finger-sized edge zones (`clipL`/`clipR`, only on an already-selected
piece); the ghost carries the zone so the waveform's visible window
stretches with a trim. The edit row's ✂ splits a selected piece when no
notes are selected; Erase tap removes a piece. Files decode once per
file (`audioEnsureFile`), shared by every piece; upload is per file.

**Bytes.** `audioBytesFor(key, file)`: this device's IndexedDB
(`ff1roll` v3, store `audio`, key `<songKey>|<file>`, written at import
BEFORE decode — Safari detaches the buffer) → `readData("songs",
<song>.audio/<file>)` (folder, then site). `uploadAudioClips()` runs
inside `commitCompositionNow` after the three text files: device-only
clips go up via `putMidAt(path, h, bytes)` (folder write or Contents
PUT), then `clip.where` flips to folder/repo. `local=1` ("someone
else's recording") is never uploaded — the DMCA rule, design §14.

**Decode.** `decodeAudioBytes()` uses an `OfflineAudioContext(1, 1,
48000)`: no user gesture needed (the main context can't exist at page
load), and an AudioBuffer plays in any context. Downmixed to mono inside
the callback; `peaksOf()` = min/max per 256 samples. `audioBufCache`
(songKey|file) survives `finalizeNotes` re-runs; `audioEnsure(ti)` is
idempotent per file and re-applies onto whatever track object holds
that file now. `audioReady()` is what album play awaits (15 s cap, like
the chip render).

**Playback.** `buildSchedule` pushes one event per clip: `{ti, n: {ch:
0, _clip}, sec: tickToSec(at) − offset/playRate, dur: clip.dur/playRate}`
— sec/dur are WALL seconds like every event (`tickToSec` already divides
by playRate); buffer offsets are file seconds. `scheduleNote` dispatches
`n._clip` → `scheduleClip(ti, clip, when, durSec − (when − when0))`
right after its now+3ms bump, so the bump advances INTO the file rather
than delaying it. `scheduleClip`: offset = `clip.dur − durSec·playRate`,
a gain per pass with 5 ms ramps (a pass boundary cuts and restarts
mid-waveform), `playbackRate = playRate` (tape-style, as chip audio),
node tracked in `audioSrcs` and pruned `onended`. The pump clamps a
clip's duration to the pass end and to `albumEndAbs` (`clipClamp`) —
MIDI notes never needed that. Both chase loops now run for clips even
while cycling (`cycling && !e.n._clip → continue`): a clip is the
track, not a tail. `stop()` calls `audioStopSrcs()`. `albumLeave`
restarts in place when a clip is playing (its stop() can't be
unscheduled); `computeSongEnd` includes `clipEndTick()`.

**Guards (`kind === "audio"`):** `voiceType` counts MIDI tracks only for
"last = triangle" (an added take used to demote the bass to a pulse);
`trackIsDrums` → false ("drums-di.wav" is a take); `drBassTrack` skips;
the tracks-view retrack guard and `moveSelectionToTrack` refuse a clip
lane; `buildScoreModel` draws no staff; both pencil paths refuse.

**Display.** Tracks view: `drawClipLane` (peaks per pixel column,
edges, gold outline when `selClip === ti`), `hitTracksClip`, tap =
select + `clipLabel` in the status line, second tap = play from the
clip's start, hold-and-drag = `pendingEdit {kind: "clip"}` → ghost via
`tracksGhost.dT` → `moveClip` on release. Every view: `drawAudioStrip`,
an `AUDIO_STRIP_H` (18 px) band folded into `STRIP_Y` when the song has
audio. Chip label and lane header carry " ∿".

**UX.** `＋∿` chip (own `#audioinput`, `accept="audio/*"…` so iOS opens
Files) and the import hub's **New song from a recording** section (below;
`audioMagic` sniff: RIFF/WAVE, FORM/AIFF, ID3, MPEG sync, ftyp, fLaC, OggS)
→ `importAudioFiles()`: locked songs are refused with the Save As hint; a
pick with NO song open creates one first (`createComposition(120, 4, 4)`,
2026-09-29 — `openPickedFiles`'s audio branch checks `!song` before calling
`importAudioFiles`, so the recording lands on a fresh `Untitled N`, 4/4 at
120 bpm, rather than silently doing nothing) with its own final status
line ("new song — Edit → Pencil to write notes against the recording. It
lives on this device until Save."), overriding `importAudioFiles`'s own
per-file message; > 20 MB (`AUDIO_SIZE_GATE`) asks "store as 16-bit mono
WAV" (`monoWavBytes`) vs as-is; lands at the cursor's bar as a new track
named from the slug; one group undo. The
voice menu becomes the **recording sheet** (`buildClipControls`) for an
audio track: starts ±bar/±beat, offset ±10/±100 ms, ⇤ Align first sound
(first peak bucket over 0.02), Replace file…, ☐ someone else's
recording, m4a caveat; rename/fader/color/delete stay.

**Tests.** vm: annotation identity, derivation, guards, schedule
event math at two speeds, song end, move-rewrites-annotation,
serialization dedupe, sniff/slug/WAV encoder. Playwright
(`tests/e2e/audio.spec.mjs`, chromium, `?folder=opfs`, fixture
`tests/e2e/fixtures/tone.wav` — 1 s, 250 ms leading silence): import →
decode → schedule → align → Save beside the .mid → reload from the
folder.

**Pitch-preserving slowdown (2026-09-17, Josh: "Amazing Slow Downer keeps
the pitches"; plan B of two).** `wsolaStretch(input, rate)` — WSOLA:
1024-sample Hann grains at a 512 synthesis hop, each analysis grain
chosen within ±128 samples of its nominal spot by best correlation with
the previous grain's natural continuation (decimated ×4), overlap-added
and normalized. Runs in an inline Blob worker (`stretchInWorker`; falls
back to inline where there is no Worker, e.g. the vm). `stretchCache`
(songKey|file|rate → {status, buffer}); `stretchEnsureAll()` on
`applySpeed`, at `play()`, and when a decode lands at a non-native rate;
other rates are evicted, `setSong` clears. `scheduleClip` uses the
stretched buffer at playbackRate 1 (offset ÷ rate) when `keepPitch()`
(device pref `ff1roll-tapestyle` absent = keep pitch), else tape-style
as before; a piece whose stretch is still rendering is silent for that
pass and the lane says "⏳ preparing 50% (pitch kept)…". `audioChaseNow
(file)`: a buffer that lands MID-PASS (decode or stretch) is scheduled
from the current position at once instead of waiting for the wrap. Cost:
~1 s per 3-minute take on a Mac (worker warm ≈ 160 ms for 6 s); RAM = one
stretched copy per file at the current rate. Quality: fine to ~40%.

**Beat mapping (tempo level 2, 2026-09-17; Josh: Logic's Smart Tempo
is automatic).** `onsetCurve()` (unit-variance rises of the peak
envelope; the first frame compares against the bucket before the window
or silence, else beat one lands late), `beatTrack(on, period)` — the
Ellis 2007 DP: `score[t] = on[t] + max_g(score[t−g] − 100·ln²(g/P))` over
gaps P/2..2P, backtrace from the strongest recent frame (negative running
scores allowed so the chain reaches the first beat). `clipBeatMap(c,
shift)`: period from `tempoFromPeaks`, downbeat phase = beat 0 unless
another class is clearly more accented (+0.35σ), `± shift` for the
user's correction, then per bar `bpm = quartersPerBar·60/D` to two
decimals (one decimal drifted ~0.1 s over 100 bars), plus `offBars`
(bars > 35% off the median: a slipped beat). `applyBeatMap(ti, ci, map)`
requires the piece's anchor on a bar line, replaces `tempo:` notes over
bars b0..b0+N−1 and writes one per bar; one anno undo; the map is
rebuilt by `finalizeNotes` (compositions author tempo through
annotations, captures refuse). Test: a synthetic 100→112 BPM take maps
to rising per-bar tempos with bar 2 within 15 ms of its downbeat.

**Not in v1:** mic recording, per-piece looping, fades,
a waveform in the roll, a dedicated audio repo (bytes go
where the song goes: folder or songs repo — Josh's ruling pending),
Save As / Move to… carrying `.audio/` along (they copy the annotation;
the bytes must be re-imported until that lands), orphan cleanup.

## Audio export — Download audio (2026-09-30, offline bounce)

DAW convention (GarageBand, Cubasis, BandLab): bounce OFFLINE — faster
than real time, to a file, handed to the share sheet — not a real-time
recording of the speaker output. `renderSongOffline()` (index.html,
just above the `filedlaudio` click handler) drives the exact same
voice code live playback does: `buildSchedule`, `scheduleNote`,
`chipStart`, `drumHit`, `scheduleClip`, `scheduleGameNote` all read
`audio`/`master`/`trackGains`/`trackPanners` as module globals rather
than taking a context parameter, so `renderSongOffline` points those
globals at a fresh `OfflineAudioContext` for one synchronous scheduling
pass — the same trick `ensureAudio()`/`rebuildAudio()` already use when
the LIVE context itself is rebuilt (periodic waves `pulse25`/`pulse12`/
`organWave` are tied to the context that made them, which is why those
three get reset on every context swap too). Nothing is awaited between
the swap-in and `oac.startRendering()`, so no other code ever observes
the globals mid-swap; every saved value (`audio`, `master`,
`trackGains`, `trackPanners`, `pulse25`, `pulse12`, `organWave`,
`playing`, `playT0`, `playOffset`, `loopPass`, `loopSeg`,
`albumEndAbs`) is restored afterward whether the render succeeded or
threw. `chip.buffers`/`chip.buffersCtx` are saved and restored too, but
deliberately NOT reset before the render: `chipBuffers()` already
rebuilds against whichever context `audio` names when the two disagree
(how a live rebuild picks up a stale chip cache today), and the common
case (`chipPcmToBuffers`, AudioBuffer built straight from the render's
PCM) sets `buffersCtx = null` — "good in any context" — so nulling it
here would have thrown away the only copy of the console audio once
its Float32 source (`chip.pcm`) is already freed.

**Scope: the whole song, once, no loop, no cycle.** `loopSeg` is set
directly to `{start: 0, end: tickToSec(song, songEndTick), looped:
false}` rather than going through `currentLoop()`/`play()`'s `cycling`
branch — Download audio has always been documented as loop-off
regardless of an armed ruler cycle (a live real-time capture technically
DOES still consult `rangeSel.cycle`, an inherited quirk of reusing
`play()` for the MediaRecorder path — the offline path does not
inherit it). Duration = `tickToSec(song, songEndTick) / playRate + 1`,
the same tail pad (`+1`) the real-time capture has always used so a
release isn't chopped.

**Readiness.** `offlineWaitForAssets(capMs)` mirrors `play()`'s
preflight (the chip resolve/render wait, `sfWaitForSong`,
`gameWaitForSong`) and adds a wait `play()` doesn't need: audio-clip
decode and time-stretch. Live playback can leave a clip silent for one
pass and catch up on the next (`scheduleClip`: "still stretching:
silent this pass, it joins the next"); an offline bounce gets exactly
one pass, so this waits (poll, 8 s cap) for every clip file's decode
(`audioBufCache`) and, at a non-native rate with pitch-keep on, its
stretched copy (`stretchCache`) before scheduling.

**What renders offline vs falls back.** Every voice kind an
`OfflineAudioContext` can build a node graph for renders this way —
oscillator/pulse/organ/piano/strings/bell/pluck synths, sampled
instruments (`sfDecode`'s buffers, already decoded via a throwaway
OfflineAudioContext — see "Decode" above — and an `AudioBuffer` plays
in any context regardless of which one decoded it), the drum kit,
game-instrument/soundfont voices (`scheduleGameNote`'s PCM comes from a
synchronous JS renderer, `tools/instruments/play.mjs`, not the audio
context), console/chip audio (`chip.pcm` is a plain `Float32Array` from
`tools/nsf/apu-render.mjs`, a pure emulator, never context-bound), and
audio clips/recordings. None of this is actually tied to the live
context — the engine was already built context-agnostic for the
no-user-gesture decode path (`decodeAudioBytes`, `sfDecodeCtx`). The
one real hard case is a browser with no `OfflineAudioContext` at all;
`renderSongOffline` returns `{ok: false, why}` and the click handler
falls back to `recordRealtimeAudio()` — today's MediaRecorder path
(m4a on Safari, webm on Chrome), refactored out of the old
`filedlaudio` handler unchanged in behavior. A song whose sample/clip
assets simply aren't ready within the 8 s cap still renders (same
triangle-fallback / silent-this-pass behavior live playback has) rather
than aborting to the real-time path — that's ordinary asset-not-ready
fallback, not a voice kind the offline context can't render.

**Encoding.** `wavEncode(numChannels, sampleRate, channelData)` is a
plain 16-bit PCM WAV writer (RIFF/WAVE/fmt /data, no compression, no
dependency) — `audioBufferToWav(buf)` calls it with an `AudioBuffer`'s
channels. Samples are truncated toward zero (`setInt16`'s own
conversion), not rounded.

**Delivery.** `deliverAudioFile(blob, name)`: in the iPad app
(`Capacitor.isNativePlatform()`), writes the file via the Filesystem
plugin's cache directory then calls the share sheet — both through
`nativeCall(plugin, method, args)`, which reaches `Plugins.Filesystem`
directly when the shell exposes it (it does, for the local-folder
backend's `nativeFs()`) and `Capacitor.nativePromise(plugin, method,
args)` otherwise (how 📷 Screenshot reaches its own plugin — this page
loads no `@capacitor/core`, so there's no `registerPlugin`, and
`@capacitor/share` has no JS shim here, so Share always goes through
`nativePromise`). In a browser: `<a download>`, same as Download .mid.

## Export score — printable pages (DAW F6, 2026-10-04)

File ▾ → **Export score…** → paper (Letter/A4) → **Export**. The score
view's model (`buildScoreModel`: the shown, non-drum tracks as staves,
the kit at the bottom, declared key/meter only) is laid out onto pages
and engraved into one `<svg>` per page, wrapped in a single
self-contained HTML document, and handed to `deliverAudioFile` — the
Download audio path: Capacitor Filesystem cache + Share sheet on the
iPad (Print, or Save to Files), an `a.download` in a browser. File name
`<song>-score.html`; status line "score exported: … (N pages)".

Why this shape (plan docs/plans/2026-10-04-daw-shortlist.md F6, Fable
review): `window.print()` is modal and the WKWebView has no print dialog
at all; an in-app PDF writer means a library. The iPad's own print path
makes the PDF from the page, so the app ships pages, not PDF bytes.

**One engraver.** `renderMeasure` (the view's cached per-measure canvas)
is now a thin wrapper around `engraveMeasure(ctx2, mi, x0, y0, mw,
opts)` — the whole VexFlow body moved there unchanged except that the
stave x/y and the measure width are parameters. The view calls it with
`(SCORE_PAD, 0, bt·pxPerTick)`; print calls it per bar at the bar's
page position with `opts.ink = "#000"` (staves, notes, beams, ties one
colour — the view's track colours are for a dark panel) and, on each
system's first bar, `opts.intro = {time: mi === 0}` so the bar carries
its own clef and key signature (the view keeps those in the pinned
`renderIntro` column) and bar 1 the declared time signature. A key
change at a system start still cancels the outgoing signature.

**Layout (pure, tested).** `PAPER` is CSS px at 96/in (Letter 816×1056,
A4 794×1123); margins 48 all round; the first page's header 96 px
(title, album line), later pages 40 px (running title, "n / N"). Bars
per system = `floor((contentW − SCORE_INTRO_W) / (bt/ppq · pxq))` with
`pxq` the model's `pxqMin` (the densest bar's own floor) but never under
`PRINT_PXQ_MIN` (36 px/quarter); the bars are then justified —
`measureW = floor(lineW / measuresPerSystem)` — so every system fills the
line (a bar wider than the paper prints alone, shrunk). A system's first
bar is `measureW + SCORE_INTRO_W` wide (the clef column). System height
= `SCORE_TOP + staves·STAVE_H + 28`. `paginateScore(n,
perSystem, firstPageSystems, nextPageSystems)` tiles measures into
systems and systems into pages — a bar is never split, by construction.

**The document.** `@page { size: letter|A4; margin: 0 }` with each
`.page` section sized to the paper and carrying its own padding, so
Safari and Chrome print it 1:1; `break-after: page` between sections;
screen view shows the sheets on grey. No `<script>`, `<link>`, `url()`
or `@import` anywhere (tested) — VexFlow 4 emits glyphs as paths, so the
SVG needs no font. Track names label each staff on a page's first
system (`ctx.fillText`, 9 px sans, 12 px into the stave's 40 px headroom
— above the treble clef's reach).

**Learning mode.** Nothing to branch on: the pages are what the score
view draws. Key signatures come from `sfAt`/`sfDeclaredAt` exactly as on
screen, the time signature only from `S.declaredTs`; no chord names, no
estimates, no analysis text.

**Harness seam.** `exportScore(paper, engrave = engraveScorePages)` —
the vm has no VexFlow (which is also why `S.scoreModel` is null there),
so the delivery test stands in a model and an engraver and checks the
layout, the document and the `deliverAudioFile` calls. The paper choice
is a device pref (`ff1roll-score-paper`); the File ▾ row is
`#filescoreform` (`#fsxpaper`, `#fsxgo`), opened by `#filedlscore`.

Device checks owed: share sheet → Print on the iPad; Save to Files →
open → Share → Print → pinch → Save to Files (PDF); a 3-staff song over
several pages; a mid-song key change landing on a system start.

## Import hub (docs/import-hub-design.md, 2026-09-29)

Josh: "I still hate the file import line. It lists all the extensions.
Maybe we make file import have its own dialog and then it can tell you how
or what you need to import for each system that we support." File →
Import… (`#fileimporthub`, replacing the old `<label for="fileinput">` that
just listed every extension) opens `#importhub`, a non-dockable window
(`makeWindow("importhub", {dockable: false})` — a one-shot picker, not a
panel worth pinning open while working the roll, unlike Notes/Instruments/
Jobs/Publish/AI/Status) built as an ordinary `.overlay` > `.sheet.help`, so
it gets the generic ✕/backdrop-dismiss/Esc/drag/resize-grip treatment for
free, same as any other sheet — nothing bespoke to wire.

**One screen, one section per format**, `dl`/`dt`/`dd` rhythm like the help
sheet, in this order: MIDI, NES, Game Boy, Super NES, Genesis, PlayStation,
PlayStation 2, Nintendo 64, SoundFont, New song from a recording. Each
section's own `<dt>` text is the exact wording `FOLDER_NAMES` uses for that
console (NES, Super NES, Game Boy, Nintendo 64, PlayStation, PlayStation 2,
Genesis) — hardcoded to match rather than rendered from the object at
runtime (a vm test cross-checks the two so they can't drift silently), since
the section titles are otherwise static markup with no per-game content to
justify a JS render pass. Each section names exactly what it needs (a
playlist alongside the chip file, which library file rides with a chip
sequence set, which refusal it gives and why) and ends in its own `Choose
files…` button (`data-kind="nes"` etc., ids `ihMidi`/`ihNes`/`ihGb`/
`ihSnes`/`ihGenesis`/`ihPs1`/`ihPs2`/`ihN64`/`ihSf2`/`ihAudio`).

**One shared `#fileinput` underneath every button** — its `accept` list,
the `application/octet-stream` entry, and its comment are all unchanged
(Files still opens with every extension selectable; the byte-sniff in
`openPickedFiles` is still the real gate). `data-kind` only changes
`#importhubstatus`'s wording before the native picker opens
(`importHubLabel(kind)`, a lookup FUNCTION rather than a top-level const —
`FOLDER_NAMES` is declared later in the same inline script, so building the
label map eagerly at parse time would hit the TDZ; a function body only
reads it once actually called, well after boot). A file picked from the
"wrong" section still falls through to `openPickedFiles`'s own sniff and
routes correctly — nothing about which button was tapped is threaded
through to the routing logic, by design. `closeFileMenus()` now also closes
`#importhub`, so a successful pick (the `#fileinput` `change` handler)
dismisses the hub the same way it already dismissed the File menu.

**Drop target (phase 2).** `dragover`/`drop` on `#importhub` only (not the
whole page — this app has never had drag-and-drop before), feeding the
dropped files straight to `openPickedFiles`, exactly like a `#fileinput`
pick. `.dragover` (added on `dragover`, cleared on `dragleave`/`drop`) gets
a dashed gold outline + a faint gold wash on the sheet
(`#importhub.dragover .sheet`).

**New song from a recording (phase 3).** No separate code path — the hub's
own section is documented under "Audio tracks — recordings as tracks", its
UX paragraph; the short version: `openPickedFiles`'s existing "recordings →
audio tracks" branch now calls `createComposition(120, 4, 4)` first when no
song is open, then `importAudioFiles` as before, with its own final status
line replacing `importAudioFiles`'s per-file one.

**Cleanups that rode along:** `CHIPS.psf2`'s two dead `if (song.kind ===
"bgm-unimplemented") throw …` lines (index.html only — `ps2Song` never
returns that kind since milestone 3; tools/ps2/INTEGRATION.md already
called them out as dead but left in place — Josh's call this time was to
actually remove them from index.html, while `tools/chip-worker.mjs`'s copy
is untouched, out of scope for an app-only change). Help sheet: the File
entry's Import… paragraph shrank to a one-line pointer at the hub; a new
`<dt>Import…</dt>` entry covers all ten kinds (and is what `tools/
build_help.mjs` mirrors into HELP.md). Two outdated claims removed along
the way: PS2's Square Enix driver "identified but not supported yet" (it
plays, milestone 3) and "Square Enix's PS2 driver excepted — synth voices"
(same). "Super Nintendo" in help text and the FEATURES drift-guard list
became "Super NES", matching `FOLDER_NAMES` and the archive-by-console
folder names.

**Tests:** `tests/night-roll.test.mjs` — a string-match test reads
index.html directly (the vm harness has no `document.body`/
`querySelectorAll`, so this can't drive the real ✕/drag/drop wiring) and
checks the File menu button, the ten sections in order, every `Choose
files…`'s `data-kind`, the two refusal strings verbatim (not paraphrased),
the drop-target listener, and the `makeWindow` registration; a separate
test drives `openPickedFiles` with a synthetic WAV and no song open,
confirming the fresh composition's meter/tempo/seed tracks, the audio
track's clip, and the exact final status line. FEATURES keyword: "New song
from a recording" (and "import hub").

## Save model — "Model B": always kept, plus Versions (2026-09-29)

Josh picked B (open-items "SAVE MODEL — JOSH PICKED B"): "always kept,
plus versions" — Logic/GarageBand's model — over A ("everything is kept;
Publish sends it", no local history) and C ("Save publishes", rejected —
conflicts with Publish being deliberate). Retires the auto-save switch,
the single Save checkpoint, and the stash-based Revert/Restore pair that
`saveCheckpoint`/`stashWorking`/`restoreStash`/`hasStash`/`lastSaveDoc`
implemented (2026-09-26 — see "Local Save" comments in the old diff);
replaces them with a per-song list of dated, device-local Versions.

**Always kept, no switch.** `autosaveOn()` now just `return true` —
kept (not deleted) only so a stray caller still reads "on"; nothing
calls it for real anymore. The Settings → Saving pane lost the Auto-save
checkbox and its help text; it's one static sentence now. The working
copy (`saveDraft`) behaves exactly as it always did with auto-save off:
every edit lands in the draft immediately (crash-proof), and
`filesMirrorSoon()` (the iPad Files copy) now runs unconditionally
instead of only when auto-save was on.

**Versions.** `ff1roll-versions-<key>` is a JSON array, newest LAST on
disk (capped to the last 20 by `writeVersionsRaw`'s `slice(-20)`), each
entry `{at, label, draft, notes, ts}` — `draft` and `notes` are the
PARSED objects (not re-stringified), `ts` is `ff1roll-ts-<key>`'s display
beats-per-bar override when one exists. `readVersions(key)` /
`migrateVersions(key)` (same function; `readVersions` is the public
name) is the one door in: it first migrates any pre-Model-B state for
that key — `ff1roll-save-<key>` (the old MUSIC-ONLY checkpoint) becomes a
version labelled "Saved (before versions)", `ff1roll-stash-<key>` (the
old pre-Revert stash) becomes "Unsaved copy (before versions)" — then
deletes those two legacy keys. Migration is additive (nothing is dropped
before it's copied) and runs on every read, so it's a no-op once a key
has no legacy state left. `pushVersion(key, label)` migrates first, then
snapshots THIS DEVICE's current draft + `ff1roll-notes-<key>` under
`label`; it returns `false` (nothing pushed) when there's no local draft
for `key` at all (an unedited published song, or a capture with no music
draft) — used both by `saveVersion` and, as a side effect, by
`dropLocalSong`.

**Save Version** (`saveVersion(quiet)`, File → "Save Version…" / ⌘S —
`saveCheckpoint` renamed, same call shape): on an Untitled song it opens
the Save form first (`openSaveForm("save")`, unchanged — still asks for
a folder and a name; `saveSongAs` calls `saveVersion(true)` for the
song's first Version once named). Otherwise it re-saves the draft
(`saveDraft(false)`) so the snapshot is current, then
`pushVersion(songKey, "Version " + N)` where N is the next number, then
`filesMirror()`. Status line: "Version saved — only on this " + ("iPad"
when `EDITION === "app"`, else "device"). **Never clears the ●** — see
below.

**File → Versions…** (`#filerevert`, relabeled from "Revert to repo
copy…"/"Revert to last save…"/"Revert to saved copy…" — one word now in
every mode) opens `#versionssheet` (`openVersionsSheet` /
`renderVersionsSheet`; registered `makeWindow("versionssheet",
{dockable: false})`, same as Status/the import hub — a browsing sheet,
not a panel worth pinning open). Visible whenever a song is open with a
repo-shaped key (`!!song && !!songKey && !songKey.startsWith("local/") &&
!LINK_SONGS`) — not composition-gated, so it also works on a read-only
capture with local annotation edits (`revertSongToRepo`'s old escape
hatch folded in here as "Published copy"). Rows: **Published copy**
first, when `catalogHas(key)`, then this device's versions newest FIRST
on screen (the array is newest-last on disk; the sheet iterates
backwards). Each row's **Go back to this** (`goBackToVersion(key, idx)` /
`goBackToPublished(key)`) confirms ("Your current state is kept as a
version first."), then — critically — `pushVersion(key, "Before going
back")` BEFORE touching anything, so a wrong tap never loses work; going
back to a device Version writes its `draft`/`notes`/`ts` over the
current ones and (when it's the open song) `openDraft`s it; going back to
the Published copy reuses `dropLocalSong` + `loadSong`, same as before.
Undo/redo reset either way (`editUndo = editRedo = []`), matching the old
Revert's contract.

**`dropLocalSong(key)`** (the shared discard under Revert-to-repo-copy,
used by both the Publish sheet's per-row Revert (`revertSongToRepo`) and
Versions'"Go back to the Published copy") no longer `stashWorking`s —
it `pushVersion(key, "Before going back")` instead (a no-op when there's
no local draft to snapshot), then clears
draft/notes/ts/edits/tombs/lastsync (not `save`/`stash` — migration
already retired those, and not `versions` — history survives a revert).
`revertSongToRepo`'s confirm dialog wording follows: "your current state
is kept as a version first — File → Versions… brings it back" replaces
the old "File → Restore unsaved copy undoes this."

**✎ Edit locally, no confirm.** `editherebtn`'s click now calls
`editHereNow()` directly — no `appConfirm`. It's the same silent-copy
logic as before (`draftWrite(songKey, draftDoc(true))`, clean) with a
`setInfo` footer notice ("editing your copy on this device — Publish
sends it") instead of asking first; `editherebtn` sits where Edit ▾
would be on a published song of yours with no local copy, so tapping it
IS the "start editing" gesture — there's no separate pencil/Edit ▾
entry point in that state (the real edit row doesn't exist until this
runs; `updateEditBtnVis` gates it on `isComposition()`).

**The ● (`songUnsaved`, `updateSongBtn`) means "not published yet".**
Simplified to just `songDirtyFlag()` — the old auto-save-off branch
(compare against the checkpoint via `songDocSig`/`lastSaveDoc`) is gone;
Save Version never touches `d.dirty`, so it never clears the ●; only a
successful Publish does (via `draftDoc(true)`/`publishDraftSong`
resetting `dirty`). `songDocSig` itself is gone (no more checkpoint to
compare against).

**Not connected → no ●, no footer Publish button.** New predicate
`connected()` = `!!writeToken()` (a GitHub token, OR `folderActive()`,
which `writeToken()` already folds in as `"folder"`) — "anything Publish
could actually send to." `updateSongBtn` only appends the `.crumbdot`
when `(unsaved || chat) && connected()`; `updateSyncBtn` sets
`#syncbtn`'s `style.display = "none"` outright when `!connected()` (it
used to never hide). Both are re-run wherever "connected" can change:
`settingsPersist("ghtoken")` and the end of `renderFolderUI()` (folder
connect/forget/reconnect, and the boot-time restore). File → Publish…
still opens unconditionally either way — the sheet explains how to
connect.

**Compare always reads the published copy.** `cmpEnter`'s old
`!autosaveOn() ? lastSaveDoc() : null` baseline is gone (autosave being
universal made it always `null` anyway); it always fetches from
`readData("songs", key, true)` now. The View menu's label is the static
"⇄ Compare with repo" in every mode (folder mode used to say "saved
copy"; Publish did too — see next).

**Wording, everywhere "Save" meant "Publish" in folder mode:**
`renderFolderUI`'s `#filesave` text ("Save to folder…" → "Publish to
folder…"), the Publish sheet's per-song "Save chat"/"Publish chat"
button (now always "Publish chat"), `#ghsaveall`'s "Save all ("/"Publish
all (" (now always "Publish all ("), `openSyncSheet`'s `verb`
("Save"/"Publish" → always "Publish song"), and the status lines
("Saving …"/"Saved ✓ to …" → "Publishing …"/"Published ✓ to …"). Folder
mode and GitHub mode now use exactly the same words for the same
deliberate action; only the destination differs ("to folder" / to the
repo).

**Help sheet + FEATURES drift guard:** the "Save and Auto-save" `<dt>`
became "Save Version and Versions…", rewritten for this model; the File
`<dt>`'s New-song/Save/Revert clauses and its LOCAL-row status words
(now matching `songStatus`'s actual strings: never saved / not published
/ published / changed since publish / annotations changed here); the
Publish `<dt>`'s Revert clause and "since the last save" → "since
publish"; the Compare `<dt>`'s "last save" → "published copy" throughout.
FEATURES (`tests/night-roll.test.mjs`) swapped "Auto-save" → "kept
automatically", "Restore unsaved copy" → "Before going back", "Revert to
repo copy" → "Go back to this", and added "Save Version" / "Versions…".

**Tests:** a rewritten "Versions (Model B)" test (was "Local Save")
covers `saveVersion` storing music + annotations, never clearing the ●,
and the 20-version cap; a new migration + go-back test seeds legacy
`ff1roll-save-`/`ff1roll-stash-` keys and checks both the migrated labels
and that going back pushes "Before going back" first; a new "not
connected" test drives `connected()`/`updateSyncBtn`/`updateSongBtn`
directly (the vm harness has no `document.body`/`querySelectorAll` — see
the Import hub tests note above — so it reads `#syncbtn`'s `style.display`
and walks `#songcrumb`'s `.children` for a `.crumbdot`, not
`querySelector`); a new `editHereNow` test makes `appConfirm` throw, to
prove the no-confirm claim.

## Local song persistence (2026-10-02 fix)

**What broke.** A `local/` song (Untitled N, a local .mid import —
`isLocalDraft()`) is not `isComposition()` (no `albums/` path), so
`saveEdits()` treated it like a read-only capture and wrote only the
removed/added overlay (`ff1roll-edits-<key>`: `"ti:ni"` ids + added notes).
Its whole-song draft was rewritten only by the operations that call
`saveDraft()` themselves (Insert bars, undo of a track reorder, track ops,
recordings). Two stores, neither stamped: the draft was usually the OLDER
one (that is why it lagged on Josh's iPad — not an IndexedDB failure), and
`loadEdits()` replayed the overlay onto a draft that sometimes already held
it — doubled notes, and `"ti:ni"` ids hiding whatever note now sat at that
index after Insert bars. 6ad5eee dropped the overlay on load and lost
untitled-1's pulse tracks (the overlay was the newer copy); reverted.

**Design: one copy, written whole, synchronously.**
- `saveEdits()` on a local song calls `saveDraft()`, exactly like a
  composition. No overlay is written for a local song any more.
- `draftWrite()` → `localDraftWrite()` for `local/` keys: the whole draft
  goes to localStorage (synchronous — the app can be killed right after an
  edit, e.g. an install relaunch, and the edit is already stored) when it is
  ≤ 500,000 chars; local songs are far smaller. Its tracks ALSO go to
  IndexedDB as `{seq, tracks}` so a song that later outgrows the cap loses
  at most the edits in flight, not everything since it last fit.
- Every write carries `seq` = stored seq + 1 (the last key of the JSON,
  read back with `lastIndexOf('"seq":')`, no parse).
- Past the cap (or when the whole copy won't fit in a full store): stub
  (`tracksRef: 1`, `seq`) in localStorage + IndexedDB, as before, with a
  one-time ⚠ "too big to keep whole". Load (`localDraftTracks`) compares the
  stub's seq with the IndexedDB record's; older notes open with a ⚠ "the app
  closed before its last edit was stored". **This path is not crash-safe for
  the edit in flight** — IndexedDB puts are queued and asynchronous.
- A whole localStorage copy never consults IndexedDB on load: it was written
  synchronously with the newest seq. (Preferring a higher-seq IndexedDB
  record would let a stale record left under a reused key — a new
  Untitled 1 — win over the real song.)
- Why not a synchronous shadow alongside the IndexedDB draft, or keeping
  the overlay until the put lands: both are a second copy load must choose
  between — the bug itself. The overlay can't be a crash journal anyway:
  its ids index the song as LOADED, and the draft under it is rewritten by
  every edit.

**Old-build overlays (`foldOldOverlay`, called from `loadEdits`).** Any
overlay found on a local song was written before this fix, with no stamp
saying which draft it was built on. Policy — a doubled note is
recoverable, a lost one is not:
- an added note goes in unless the song already has one on that track with
  the same start, pitch and length;
- removed ids are NOT replayed (unverifiable after Insert bars or a draft
  rewrite); they are listed in the debug log, notes kept;
- `openDraftDoc` then writes the merged draft, and `retireOldOverlay` reads
  it back (`draftRead`) — only if every overlay note is in the stored copy
  does the overlay move to `ff1roll-retired-edits-<key>@<ms>` (never
  deleted; nothing reads it again). A failed write leaves the overlay in
  place; the next load folds it again (idempotent by the dedupe).
- Clear edits is never offered on a local song (`updateClearBtn`): there
  the overlay is an old leftover, not the edit store.

Compositions (`albums/`) and read-only captures are unchanged: captures
keep the overlay as their only edit store; compositions were already
whole-draft. Tests: `local song: …` in tests/night-roll.test.mjs — draft
newer than overlay, overlay newer, no-stamp dedupe, a failed fold leaves
the overlay, Josh's Insert bars + paste + delete + reload, a kill before
the IndexedDB put lands, and the too-big path.

## Learning / Normal mode (P0-P3, 2026-09-30)

CLAUDE.md: "Keys/analyses are Josh's discoveries — Learning mode is the
law." Learning is the app's default posture and volunteers nothing about
meter, key, or chord names. Normal exists for other users on their own
device and shows the same things as labelled ESTIMATES — never written as
a real annotation until a tap says so. One device-global switch, not a
per-song setting.

**`appMode()`** returns `"learning"` or `"normal"`, backed by `let
APP_MODE` and the device pref `ff1roll-mode`. Both live in the EARLY boot
block (right after `"use strict"`, well above the `state` section) because
`setSong`/`updateLCD`/`renderViewMenu` all read it during boot — see
`boot-path-tdz-check` in Claude's memory: three boot bricks already
shipped from new state landing below where boot reads it. Migration runs
once, at that same point: an explicit `ff1roll-mode` is never touched
again; otherwise `hasExistingNightRollPrefs()` (checks `ff1roll-lastsong`,
`ff1roll-cfg`, `ff1roll-ghtoken`, and — via `Object.keys(localStorage)`,
not `.length`/`.key(i)`, which the vm harness doesn't stub — any
`ff1roll-notes-*`/`ff1roll-draft-*`) picks Learning for a device that's
already been used, Normal for a fresh install. `setAppMode(mode)` flips it
live and persists; `applyMode()` is the UI-refresh side effect (View ▾
checkmark, `body.dataset.mode`, the LCD 🎓 badge, `cfglearning` checkbox,
re-running `finalizeNotes()` so labels catch up) — boot itself never calls
it, only the two interactive toggles (View ▾ → 🎓 Learning mode; Settings
→ Other) do.

**P1 — lasso chord.** `refreshSelInfo()` branches on `appMode()`: Normal
names the lassoed chord straight into the selection strip (`nameChord`
already existed) and hides Chord?; the ⧉ copy text carries the name too.
Learning is unchanged — Chord? stays, so naming it is still the user's
discovery.

**P2 — meter/key labels + imports (revised 2026-09-30).** An imported
file's own labels are SOURCE DATA, kept apart from the learner's answers
(docs/declared-vs-learner-spec.md). parseMidi(…, {foreign: true}) returns
`source: {timesigs, keysigs}` — every 0x58/0x59 in file order (`timesig`
is now the FIRST 0x58); the draft carries `source` through draftDoc,
openDraftDoc, forkCurrentSong, commitImports, publishDraftSong, versions.
writeMidi AND writeSongMidi write `source` verbatim (none if the file had
none) plus a conductor Text meta `source:file`, ignoring song.timesig/
keysig; without `source` (captures, songs made here) the bytes are as
before. The learner's key:/timesig: annotations never reach the .mid.
Nothing seeds annotations on import in either mode (the old Normal seed
wrote without a tap — a rule break; removed). ☰ Notes → KEY / METER
headers → **Check vs file** (checkKeyVsFile / checkMeterVsFile, on demand
only, on every song so seeing it reveals nothing): match / differs
("labels can be wrong") / partial-match / noanswer / nofile. Learning
never shows the file's value or runs estimateKey; Normal adds "The file
says: …", the estimate, and "Use the file's". notes.txt's header states
HIS declared meter (declaredTsForKey), never the file's — "4/4? (not
declared)" when he hasn't. `effTs()` still never reads `song.timesig`.

**P2 phase 2 — the rest of a foreign file, kept verbatim
(docs/declared-vs-learner-spec.md "B").** Phase 1 only kept 0x58/0x59;
everything else Night Roll doesn't model — text/copyright/instrument-name/
lyric/marker/cue metas (0x01 non-`sounding:`, 0x02, 0x04-0x07), extra
track-name metas, program changes (0xC0), channel pressure (0xD0), pitch
bend (0xE0), every CC but 10 (pan, always owned) and 70 (duty — owned only
when NOT foreign; a foreign file's CC70/poly aftertouch (0xA0) are just
some other program's controller/pressure data, never chip duty/envelope,
so they're kept as raw events instead of being read onto the note) and
SysEx — now rides along too, per original track, in `source.metas`:
`[{index, events: [{t, bytes}]}]` for a track that had notes (matched back
to a CURRENT Night Roll track by `tr.srcIndex`, the ORIGINAL file track
number recorded at import — never by name, so a rename doesn't orphan the
events; a track the user deletes takes its raw events with it, since no
surviving track carries that index), or `{index, empty: true, name?,
events}` for an original track with NO notes at all (e.g. the conductor's
own name/text) — never a Night Roll track, so deletion can't apply; it
always survives, merged into the written meta/conductor track. `metas` is
left off `source` entirely when there's nothing in it, so every file phase
1 already covered writes byte-identical. Both writers (`writeMidi`,
`writeSongMidi`) build a `bySrcIndex` map from the CURRENT `s.tracks`,
attach each track's own events before its notes, and merge unmatched
`empty` entries into the meta track — same split, same order, in both
(the shared-writer parity test covers a `source.metas` fixture too).
Markers/lyrics/text are the composer's own analysis, same as a key or
meter label: no UI reads `source.metas` anywhere in this phase, Learning
or Normal — preserved only, never displayed (a later "Check sections vs
file markers" would follow the Check-vs-file pattern, not this one).

**P3 — `estimateKey()` + `sfShownAt()`/`keyNameShownAt()`.** A duration-
weighted pitch-class census of non-drum, non-audio-clip notes, correlated
against the 24 Krumhansl-Schmuckler major/minor key profiles
(`KS_MAJOR_PROFILE`/`KS_MINOR_PROFILE`); best correlation wins, spelled
through the existing `keyNameFor(pc, mode)`. Cached per song
(`_keyEstCache`), invalidated by a cheap note-census signature
(`keyEstimateSig()`) rather than hooking every edit site. `estimateKey()`
is Normal-only BY CONSTRUCTION — every call site is gated by `appMode()`
before it's ever reached, never inside `estimateKey()` itself, so Learning
never calls it at all (a spy test proves zero calls). The two shown-value
functions are the single choke point every display call site now goes
through instead of the declared-only `sfDeclaredAt`/`keyNameAt`:
- `sfShownAt(tick)` — declared (or the key-dial preview), else the Normal
  estimate's `sf`, else `null`. `sfAt(tick)` = `sfShownAt(tick) ?? 0`
  (unchanged default for every existing call site — spelling, the score's
  key signature, `refreshSelInfo`'s lasso spelling, the ◯5 dial's open
  key, `spellPc`'s default arg).
- `keyNameShownAt(tick)` — `keyNameAt(tick)`, else the Normal estimate's
  `name`, else `null`. Used alongside `sfShownAt` at the piano/guitar
  degree readout (`instTap`) and the `find:` picker (`refreshFindSel` +
  its `change` handler).
`sfDeclaredAt`/`keyNameAt` themselves are untouched — anything that means
"only what Josh actually declared" (chord-evidence/Challenge?, the AI
context, transpose-by-degree) still uses them and is unaffected by mode.

LCD: undeclared + no stored partial + Normal shows the estimate with a
tilde (`"Gm~"`) instead of `"C?"` — same honesty convention as the
meter's `"4/4?"`. The key picker's placeholder option (`#keyunset`)
reads `"key: G minor (estimated) — tap to set"` in that same state, with
a `#keysetest` "Set this key" button beside `#keysel` that promotes the
estimate to a real `key:` annotation (same `dropLocalKeyAt` + push +
`finalizeNotes`/`saveLocalNotes` pattern as the existing tonic/mode
picker) — still only on a tap. Learning never reaches any of this: the
plain `"not set (C)"` / `"4/4?"` / `"C?"` defaults are byte-for-byte what
they were before this landed.

**Tests:** `tests/harness.mjs`'s `createApp()` pins `ff1roll-mode:
"learning"` by default when no `storage` option is passed, so the whole
pre-existing suite (and the shared `app` at the top of
night-roll.test.mjs) keeps exercising Learning unchanged; a test that
wants Normal or the migration itself passes its own `storage`.
`tests/e2e/helpers.mjs`'s `openApp` and the two OPFS specs'
own `open()` (`audio.spec.mjs`, `folder.spec.mjs`) pin the same pref via
`addInitScript` before `page.goto`, for the same reason. New unit tests
cover the migration table, both modes' lasso-chord behavior, a MIDI
import in both modes, the K-S estimate (a C major scale → C, an A
harmonic minor scale → Am), the Learning-never-calls-estimateKey spy, and
the LCD/keysel-label/"Set this key" flow.

Deliberately NOT built until P4 (below): a dedicated "Analyze ▸" menu for
Normal is still parked (see open-items.md).

**P4 — ✦ Ask AI follows the mode (2026-09-30).** `ASK_SYS` split into a
shared `ASK_SYS_BASE1`/`ASK_SYS_BASE2` (the tutor's identity, the
`<context>` block's shape, its four app tools — unchanged text) plus a
per-mode RULE paragraph: `RULE_LEARNING` is yesterday's whole "THE RULE:
discoveries are the user's…" paragraph, verbatim; `RULE_NORMAL` is new
("Answer music questions directly — name keys, chords, cadences and form
when asked; say how sure you are; the key line may be an estimate, call
it one."). `askSys()` concatenates BASE1 + the mode's RULE + BASE2,
picked by `appMode()` at SEND time (never cached — the device-global mode
can flip between messages), and replaced every read of the old `ASK_SYS`
constant: `askRun`'s system prompt, `askEstimate`'s token estimate, and
`askTakePrompt`, ✦ Fill's own system-prompt builder (✦ Fill — and
`askTakePrompt` with it — was removed 2026-10-02 in favor of the
write_notes tool; see the ✦ Ask section above).

`askContext`/`askSpanNotes` (the per-request `<context>` block) go
through the same P3 discipline as every other display call site —
Learning never reaches `estimateKey()` (spy-tested) — but now build their
key line from DATA instead of reading `#keyunset`'s live label, because
that label's Normal-mode text ("key: G minor (estimated) — tap to set")
had leaked straight into the tutor's context unlabelled as an estimate.
`keyLabelState()` factors the label's own computation out of
`finalizeNotes` (which now just assigns `unsetOpt.textContent =
keyLabelState().text`) so `askContext`'s Learning line can call the SAME
function and get byte-identical text without touching the DOM. Normal
builds its own line instead — `askKeyStateLine()` returns "key state:
declared <name>" when a real `key:` annotation governs, else "key state:
estimated <name> (Krumhansl, confidence <c>)" from `estimateKey()`, else
"key state: undetermined — not enough notes yet to estimate". An
`askModeLine()` adds a bare "mode: normal" line right after it — Learning
adds no such line at all, and that absence is itself the convention the
bridge's system prompt now documents (see below). The lasso line follows
`refreshSelInfo`'s own P1 split: Normal names the chord straight into the
context ("lasso-selected notes: C4 E4 — chord: C (no 5th)", via the same
`nameChord()`); Learning is unchanged ("…— do not name this chord unless
the user has guessed or insists"). `askSpanNotes` gets the matching
treatment: when nothing is declared over the whole span AND the mode is
Normal, it spells the notes through `estimateKey()`'s `sf` (per note,
falling back only where nothing is actually declared there) and says so
in the header comment ("# Pitches are spelled by the Normal-mode key
ESTIMATE (C, Krumhansl — unconfirmed)."); Learning's header and spelling
are untouched. The general chat (`askGeneral`, no song attached) carries
its own per-mode tutor-rule sentence and the same "mode: normal" line
when applicable. The welcome bubble (first open, no messages yet) and
the general-chat opening bubble are the two remaining per-mode UI texts;
Settings → Other's Learning-mode checkbox description was already
per-mode from P0.

`tools/claude-bridge.mjs`'s `BRIDGE_SYS_READ`/`BRIDGE_SYS_FULL` no longer
say "keys and analyses are the user's discoveries" (that was Learning
only, hardcoded) — both now say `BRIDGE_SYS_MODE`: "the app's context has
a mode line: learning = hint, never name keys/chords/meter; normal =
answer directly. No mode line = learning." An older app build that
predates modes never sends the line at all, so it still reads as
Learning — safe by construction, no version check needed.

Tests: a golden-snapshot test pins `askContext`'s ENTIRE Learning output
for a fixed song, captured before this landed, so any future accidental
leak into Learning fails loudly; a spy test proves `askContext`/
`askSpanNotes` never call `estimateKey()` in Learning and do in Normal;
separate tests cover `askSys()`'s BASE/RULE split, the Normal
declared/estimated/undetermined key-state line, the mode line, the lasso
chord line, the estimate-spelled `askSpanNotes`, the general-chat
per-mode text, and the welcome bubble's two texts. Help sheet's "House
rules" `<dt>` (✦ AI tab) and the FEATURES drift keyword done.

## P6 — Analyze ▸: a Normal-only VIEW layer (2026-09-30)

open-items.md's parked "P6: Normal's 'Analyze ▸' menu". A dedicated View ▾
item, present only in Normal (`analysisAvailable()` = `appMode() ===
"normal"`; the button is `style.display = "none"` in Learning — ABSENT, not
dimmed, same convention as every other Learning hiding place), that draws a
dashed/outlined "analysis" layer on the roll: a per-bar chord reading plus a
whole-song key estimate. It is a VIEW, computed into `analysisBands`
(`{chords: [{start, end, text}], key: {start, end, name, sf, conf} | null}`)
— nothing is written to `rollnotes` until a tap Adopts a specific band.

**Off by default, every session.** `analysisOn` is a plain `let`, never
persisted to `localStorage` — a reload always starts with the layer off,
even in Normal. A song change (`setSong`) also resets it and clears any
pending debounce timer, since a different song's bands would otherwise
flash stale for a frame. Switching to Learning (`applyMode()`, from either
the View ▾ toggle or Settings) forces `analysisOn = false`, empties
`analysisBands`, and cancels `_analysisTimer` — the debounced recompute
(below) is stopped, not just its result hidden, so the spy test can prove
`bsInferTimeline`/`estimateKey` are never called for it in Learning.

**Chords: `bsInferTimeline` + `nameChord`, both reused as-is.**
`computeAnalysisLayer()` calls `bsInferTimeline(0, songEndTick, harmonyTis,
() => 0)` — the SAME reader the Bassist's internal harmonic sketch uses
(duration+metric-weighted PC census per bar, restricted to plausible
triads), over every non-drum, non-audio track (`harmonyTrackIndices()`;
drums excluded, per spec). The `seedRng` is `() => 0` instead of a real
PRNG: the Bassist varies among equally-plausible readings for a fresh take
each roll, but a displayed estimate has no "roll again" and must be
deterministic, so this always takes the single best-scored candidate
(`top[0]`). For each bar `bsInferTimeline` returns, the REAL sounding
pitches (with real octaves, not the candidate's bare pitch classes) whose
pitch class is one of the candidate's `tones` are collected from the same
harmony tracks and passed to `nameChord(pitches, sfShownAt(entry.t))` — the
identical namer the lasso selection and chord-band evidence already use —
so the label's bass/inversion reads off the actual notes rather than
assuming root position. A bar with no recognizable match ("no standard
chord match") is dropped, not shown.

**Key: one region per song, reusing `estimateKey()` exactly.** The spec
allows "windowed per 8 bars if cheap, else one per song" — a true per-8-bar
window would need its own duration-weighted census loop per window (a
second, parallel Krumhansl-Schmuckler implementation next to `estimateKey`'s
own, doubling the surface any future K-S fix has to touch). One call to the
existing `estimateKey()` — same cache, same call-site discipline as every
other Normal display site (the LCD "Gm~", the keysel label) — was chosen
over that duplication; the whole song is one region,
`{start: 0, end: songEndTick, name, sf, conf}`.

**Rows.** `finalizeNotes()` appends the layer's own rows BELOW every
section/chord row (`analysisChordLane`, then `analysisKeyLane` — set to
`null` when off or empty, same "own row, own group" discipline as
sections-vs-chords), and grows `RULER_H` to fit them, gated on `analysisOn
&& appMode() === "normal" && !listenerMode`. `drawRuler` draws them AFTER
the real bands, dashed (`ctx.setLineDash`) and labelled "🔍 analysis: …" —
visually distinct from the solid section/chord fill. A tap in `tap()`
hit-tests the two lane indices and opens the Analyze sheet
(`openAnalyzeSheet`); it never touches `rollnotes`, `rangeSel` or `tapBand`.

**Adopt: the one path to a real annotation.** `#analyzesheet` (an ordinary
`.overlay`/`.sheet`, so it gets the generic ✕/Esc-close for free) offers
**Adopt** (`adoptChordBand`/`adoptKeyRegion` — `setAnchorBQ`/`setEndBQ` to
convert the band's ticks to b/q, `dropSupersededBy`/`dropLocalKeyAt` so a
re-adopt replaces rather than duplicates, then the same
`annoSnapshot()`-before / `pushUndo({kind: "anno", ...})`-after pattern as
`saveTrackDir`/every other one-tap annotation write) and, on a chord band,
**Adopt all chords** (`adoptAllChords` — every pending chord band written in
the SAME loop, ONE `pushUndo` after all of them, so ⟲ takes the whole batch
back out in a single step, not N). Nothing is written by opening the sheet
or by Cancel.

**Recompute: on toggle, and debounced on note edits — never per frame.**
Toggling the View ▾ item calls `computeAnalysisLayer()` synchronously.
`saveEdits()` (the one hook every note add/erase/move/generator already
calls) also calls `scheduleAnalysisRecompute()`, which no-ops when the layer
is off or the mode isn't Normal, else debounces 400ms before recomputing +
`finalizeNotes()` + `draw()` — a burst of edits (a generator's whole batch)
recomputes once, not once per note. Annotation-only edits (Adopt itself)
do NOT retrigger it — `analysisBands` simply keeps showing what it showed,
consistent with "a view, not live data."

**`document.body` guard (harness fix, not a behavior change).**
`applyMode()` used to write `document.body.dataset.mode` unconditionally;
the vm test harness deliberately has no `document.body` (its own "are we in
the vm harness" sentinel — see `tests/harness.mjs`), so `applyMode()` could
never be called from a test before this. Guarded to `if (document.body)
...`, same convention the harness already documents elsewhere, so the P6
mode-switch spy test can call it directly.

Tests (`tests/night-roll.test.mjs`, search "P6"): Learning has no menu item
and a spy proves `bsInferTimeline`/`estimateKey` are never called (even a
stray click on the hidden button, `saveEdits()`, or a direct
`computeAnalysisLayer()` call after forcing `analysisOn = true` — gated
inside the function itself, not just at the call sites); Normal toggling
computes a C–F–G–C fixture correctly (root-position triads, one per bar);
switching to Learning mid-debounce cancels the pending timer AND the
function never runs; Adopt writes one `chord:` annotation as one ⟲ step,
⟲/⟳ round-trip it, and Adopt all chords lands four bands as one step;
`serializeRollnotes()` (notes.txt) and `askContext` are byte-identical with
the layer on or off. Help sheet's "views" `<dt>`, FEATURES keyword,
NIGHT-ROLL.md (here) and open-items.md (P6 done) written. NOT done:
browser-verify (screenshot) and push — see the session report.

## Text size — iOS Dynamic Type (DAW review item 12, 2026-09-30)

open-items.md "DAW CONVENTIONS REVIEW" #12: every `font-size` in the CSS
was a fixed px, so iOS's Settings → Accessibility → Display & Text Size →
Larger Text did nothing (Logic for iPad honours it). Goal: text scales
with the system's text size, zero visual change at the default size.

**The root scale.** `:root` carries two custom properties, `--ts` (iOS
Dynamic Type factor) and `--userscale` (the device pref below), both
default `1`; `html { font-size: calc(16px * var(--ts) * var(--userscale)); }`
is the only place either is read. Every `font-size` in the stylesheet and
in JS-built inline styles/`cssText` (row labels, chip buttons, the mixer
strips — anywhere a node is built at runtime, not just the `<style>`
block) is `N/16` **rem** instead of `Npx` — 16px was already the implicit
browser default, so at `--ts: 1; --userscale: 1` every rem resolves to
the exact px it replaced: pixel-identical at default size, by
construction, not by testing alone. Layout — padding, the grid, the
roll/score canvas — was deliberately left in px; only text scales, so
nothing shifts position. A control whose text would now overflow a fixed
height uses `min-height` instead of `height` and grows rather than clips
(pre-existing convention here, just now load-bearing).

**iOS Dynamic Type.** A `<script id="ts-boot">` right after `</style>`
(before `<body>`, so no flash) feature-detects `CSS.supports("font",
"-apple-system-body")` — true only in WebKit/Safari — and if so appends a
hidden probe span with `font: -apple-system-body`, reads its computed
`font-size`, and sets `--ts` to that value divided by 17 (the size
`-apple-system-body` resolves to at Dynamic Type's own default, "Large"):
1 at the OS default, above 1 when the user has turned Larger Text up.
Clamped to `[0.8, 1.6]` — Dynamic Type's accessibility sizes run past 3×
the default, which would break the transport LCD and track chips long
before it helped anyone read them; the clamp is a safety net, not a
design target, and CLAUDE.md's "let it grow" still applies within it.
Elsewhere (desktop browsers, anything that doesn't understand the
`-apple-system-body` keyword) `--ts` never gets set by the script, so it
stays at the stylesheet's own default of `1` — no behavior change.

**Device pref.** File → Settings → Other → **Text size** (a `<select>`:
Small/Default/Large/Larger → 0.9/1/1.15/1.3) is the second, manual dial —
for a browser that doesn't carry Dynamic Type through, or to go further
than it offers. `ff1roll-textsize` in localStorage (device-local UI pref,
not song state — CLAUDE.md); `textSizePref()`/`applyTextSize(v)` next to
the other Settings → Other getters (`penInstant`, `recSnapOn`, …),
`settingsPersist`'s `"cfgtextsize"` case applies it live via
`--userscale`. The SAME boot script also reads this pref and sets
`--userscale` before first paint (independently of `--ts` — the two
multiply, they don't compete), so a non-default choice doesn't flash in
at load.

**Canvas text is out of scope here.** `ctx.font`/`ictx.font` (roll/score
labels, the instrument panel, the circle of fifths — grep for `\.font =
"…px "`) draws with literal px sizes picked per context (down to 7-8px
for dense rows) and does not participate in `--ts`/`--userscale` yet;
noted in the `:root` comment, not fixed.

Tests: `tests/night-roll.test.mjs` asserts no `font-size:\s*\d+px`
survives in the CSS/JS except the one documented exception (`font-size:
0`, an icon-hiding trick where the unit doesn't matter), and that the
`--userscale` pref multiplies the root size. Verified with one-off
Playwright-chromium screenshot scripts (not `npx playwright test` — see
CLAUDE.md, full E2E is CI-only) at 1366×1024 and 820×1180: default-size
before/after screenshots of the main screen (a song open) diffed
pixel-by-pixel — see the report for the exact match result — then the
"Larger" (1.3×) setting reviewed by eye for clipping/overlap across the
header, footer, track chips, transport LCD, and sheets.

## VoiceOver — first pass (open-items.md DAW review item 12's other half,
2026-09-30)

The roll/score/tracks canvas has no accessibility tree of its own — it's
one opaque `<canvas>` to a screen reader. This is a first pass at making
the surrounding app usable non-visually, not a full non-visual editor
(there is still no way to read or edit a note's pitch/time by keyboard
alone, only to know what's selected and hear it named — see "Still open"
below).

**Icon-only controls.** Found systematically: a scan (`node -e` one-off,
the same shape now checked by the test below) over every `<button>` in
index.html — static markup and the JS that builds the dynamic ones
(track-chip M/S/H, mixer strips, the chord-picker) — for a tag whose
rendered text has no real word in it (`/[A-Za-z]{2,}/`) and no
`aria-label`. ~23 static offenders got a label (💬 Notes strip, 🎹
Instrument panel, ✕ Close, ⟲/⟳ circle-of-fifths rotation, the Mixer's
−/+ section-level steppers, the metronome's ‹/› "shift accents" nudges,
100% speed-reset, 📷 the AI panel's screenshot button, …). Toggle groups
(Select/Pencil/Erase, note value × modifier, ♮/♯/♭, M/S/H) got
`aria-pressed`/`aria-checked` kept in step with the `.active`/`.on` class
that already drove the look — one line added beside each existing
`classList.toggle`, not a parallel mechanism.

**Track chip M/S/H** (`renderTrackbar`, and the Mixer's `mkBtn`) were
bare `<span>`s with only a click listener — no role, no keyboard path,
no name. Now `role="button"`, `tabIndex`, `aria-pressed`, and an
`aria-label` that names the TRACK, not just the letter ("Mute lead"),
since VoiceOver reads several of these in a row with no visual context
to disambiguate them. A `<span>`/`<div role="button">` gets no built-in
Enter/Space activation the way a real `<button>` does, so one delegated
`document` keydown listener (beside the existing Escape/Space/Enter
shortcut handlers) maps Enter/Space to `.click()` for any focused
`role="button"` element — covers the chip itself, M/S/H, the mixer strip
name, the "what's Claude doing" strip, and anything built the same way
later. The existing Space-for-play/stop and Enter-for-rewind global
shortcuts were widened to skip role="button" elements too, so activating
a toggle with the keyboard doesn't ALSO trigger play/stop or rewind.

**Tab strips** (`#helptabs`, the insrument-panel Piano/Guitar tabs, the
Insert Chord/Progression tabs, Settings' Saving/AI/GitHub/Other tabs;
the ✦ AI song/general/terminal tabs already had this) get
`role="tablist"` on the container, `role="tab"`/`aria-selected` on each
button, updated wherever the existing tab-switch code already toggles
the `.active`/`.on` class. `tools/build_help.mjs`'s regex for the help
tabs (`<button data-hs="(\w+)">…`) was loosened to `data-hs="(\w+)"[^>]*>`
so the new `role`/`aria-selected` attributes between `data-hs` and `>`
don't break HELP.md generation.

**The canvas** (`#roll`) carries `role="application"` (not `role="img"`:
it owns extensive custom keyboard shortcuts — arrows, Enter, Space, ⌘-
combos — that `role="img"` would hand to the screen reader's own
navigation instead) and `tabindex="0"`, reachable by Tab like any other
control. `updateCanvasA11y()`, called at the top of every `drawFull()`
(cheap — a handful of multiplies and a string build, no throttling
needed since `aria-label` isn't announced on its own until the user
explores the element), keeps its `aria-label` current: the song title,
which of Roll/Tracks/Score is showing, the visible bar range computed
from `view.x`/`pxPerTick()`/`RULER_W` the same way the ruler draws it,
and the track count.

**The live region** (`#srlive`, `aria-live="polite"` `aria-atomic="true"`,
`.sr-only` at the top of `<body>`) is the app's one channel for telling a
screen reader what just happened, funneled through a single function,
`srAnnounce(text)` (defined next to `setInfo`): de-duped on identical
text, throttled to one DOM write per 250ms (a `setTimeout` that always
fires with the LAST text of a burst, never a stale middle one) so a
drag's flurry of status-line updates doesn't queue an announcement per
frame. Two callers:
- `setInfo()` (the footer `#noteinfo` status line — same function that
  already carries the selected note/chord readout, section/chord taps,
  every "one ⟲ undoes it" confirmation) passes its own text straight
  through. This is also how Learning mode's law — nothing spoken that
  the screen doesn't already show — holds for free here: `#srlive` is
  never anything other than the exact string `#noteinfo` just got, so a
  Learning-mode chord selection (which `refreshSelInfo`'s
  `appMode() === "normal"` branch keeps un-named on screen) is
  structurally un-nameable in the live region too, not filtered
  after the fact.
- `play()`/`stop()` directly (transport state doesn't route through
  `setInfo`): `srAnnounce("Playing")` when the transport starts (plus
  the song title during album play), `srAnnounce("Stopped at bar … beat
  …")` on stop, reading the SAME `#lcdbar`/`#lcdbeat` text
  `updateSubtitle()`/`updateLCD()` just wrote to the LCD — never
  recomputed independently.

**Sheets** (every `.overlay`, including `confirmsheet`) get
`role="dialog"`, `aria-labelledby` pointing at the sheet's own `<h2>`/
`<h3>` (assigned an id if it didn't have one), and `aria-modal` kept
live by the same `SHEET_TOP` `MutationObserver` that already watches
every overlay's class for the scroll-reset behavior — `"true"` only
while open AND not docked (a docked panel sits beside the roll, not over
it; `aria-modal="true"` there would wrongly tell a screen reader
everything else on the page is inert). Opening a sheet remembers
`document.activeElement` on the overlay node, then — deferred one
`requestAnimationFrame` so a sheet's own open-time focus (the rename
sheet's text input, already-existing code) wins if it set one — moves
focus to the first focusable control inside, or the `.sheet` itself
(given `tabIndex = -1` if it had none, so it's a focus target but never
in the Tab order on its own). Closing (✕, backdrop, Esc — all three
already ran through this observer) returns focus to whatever was
remembered. All of this lives inside the existing `if (typeof
document.querySelectorAll === "function")` guard (the vm harness
deliberately leaves it undefined — see harness.mjs), so it is
real-browser-only, verified with the Playwright accessibility-snapshot
script below, not the vm suite.

**Focus ring.** `select:focus-visible, button:focus-visible` (already
existed) widened to `input, textarea, a, [tabindex], [role="button"],
canvas` — `:focus-visible` only lights up on keyboard focus, so it costs
zero pixels in a mouse/touch/default screenshot (confirmed: the before/
after pixel diff below is 0 outside the focus-ring screenshot, same
guarantee the Text-size work used).

Tests (`tests/night-roll.test.mjs`, "VoiceOver:" prefix): a static scan
(mirrors the `node -e` scan above) that no symbol-only `<button>` lacks
an `aria-label`, with an explicit two-entry allow-list for the regex's
own false positives (`#analyzeadopt` ships empty and is always filled
with real words before it's shown; the chord-root buttons' rendered text
is a real note name, invisible to a regex that can't evaluate the
template string that builds them); `srAnnounce`'s de-dupe/throttle
behavior; `setInfo` mirrors into `#srlive`; `play()`/`stop()` announce
correctly; a Learning-mode lasso-over-a-triad test asserts `#srlive`
equals `#noteinfo` exactly and contains no chord-quality word or the
Normal-mode "→" arrow, then the same notes in Normal mode assert the
opposite (the chord IS named, on screen and in the live region alike);
track-chip M/S/H are real toggles with per-track labels; the canvas
`aria-label` names the song/view/bars/tracks. DOM-wide behavior (tab
strips, dialog roles, focus management) is gated behind
`document.querySelectorAll`, undefined in the vm harness by design, so
it's covered instead by a one-off Playwright script dumping
`page.accessibility.snapshot()` and a focus-ring screenshot — not
`npx playwright test` (CLAUDE.md: full E2E is CI-only).

Also: `tests/harness.mjs`'s `makeEl()` gained a real attribute store
(`setAttribute`/`getAttribute`/`hasAttribute`/`removeAttribute`) in
place of a `setAttribute: noop` that silently dropped everything — the
prior stub meant no vm test could ever have asserted on an
`aria-*`/`role` attribute set at runtime. Purely additive: nothing in
index.html called `.getAttribute(` before this, so no existing test's
behavior depends on the old no-op.

**Still open** (not this pass): reading or editing a note's pitch/time
by keyboard alone (today Tab reaches every CONTROL, but the notes
themselves live only on the canvas, described in aggregate via the
live region, not individually addressable); canvas-drawn text
(instrument panel, circle of fifths, roll/score labels) has no
alternative text at all, same gap the Text-size work left for
`ctx.font`; Escape-stack and backdrop-tap dismissal aren't
screen-reader-specific gaps but weren't re-verified with VoiceOver on;
the non-`.overlay` popups (`#metsheet`, `#voicemenu`, `#wmmenu`,
`#speedpop`/`#volpop`) got no focus management, only `#metsheet` got a
static `role="dialog"`/`aria-labelledby` — they're small anchored
popups, not full sheets, and were out of scope for this pass.

## Header layout: real flex items, not position:absolute (2026-09-30)

The header used to be `display:flex` for the brand + File/Edit/View/✦ AI
buttons, with `#songcrumb` and `#nowchip` (the "Claude Code is doing…"
chip) laid on top via `position:absolute` — the crumb centered itself by
GUESSING the left cluster's rendered width (a hardcoded `left: 23.75rem`),
and the chip pinned to the header's right edge. Any width those buttons
wrapped (phone), ✎ Edit joined the row (see above), or a Full-height side
dock narrowed `#songregion` — which the header lives inside, per
`#shell`'s grid; a `Beside the roll` (inner) dock does NOT, since inner
docks nest under `#songcenter`, below the header — the guess went stale
and the crumb/chip sat on top of the title or each other (Josh, iPad,
DAW review).

Fixed by making all three real flex items of `header` (`flex-wrap:
nowrap` now, so they can't fall onto separate lines and fight for space
differently than intended): a new `.hdrleft` wrapper holds the brand and
buttons (its OWN `flex-wrap: wrap` still lets them flow onto a 2nd row at
phone width, same as before — only `header` itself stays one row);
`#songcrumb` is `flex: 1 1 0; min-width: 0`, taking whatever's left and
centering its own children in that space; `#nowchip` is `flex: 0 0 auto`
after it. `#songcrumb`'s children: `.crumbwhere` ("Published ›" /
"Local ›") and `.crumbdot` (the unsaved ● ) stay `flex: none` (never
truncate); the folder span got a `.crumbfolder` class and the title span
a `.crumbtitle` class so the folder's `flex-shrink` could be set 1000×
the title's — they used to shrink together (`flex: 0 1 auto` on both),
so the folder squeezing down BEFORE the title starts truncating (Josh,
2026-09-29's original ruling: "Published/Local never truncates, the
folder and the title do") is now an actual priority, not "whichever
loses the coin flip."

`#nowchip` also gets a compact (icon-only) form once the header itself
is tight — `header { container-type: inline-size; }` plus `@container
(max-width: 860px) { #nowchip { font-size: 0; … } #nowchip::after {
content: "✦"; } }` (the existing `font-size: 0` + pseudo-element icon
trick, same one `#asksheet-h2`'s dock button already used) — so a
narrowed header goes to a small ✦ badge instead of crowding the crumb's
title. The `@media (max-width: 700px)` rule hiding the chip entirely on
phone widths is unchanged. The `body.nowchip` class (used only to widen
`#songcrumb`'s old absolute right offset) is gone along with the
absolute positioning it served.

## Settings sheet: tabs scroll instead of disappearing (2026-09-30)

`.seg`'s `overflow: hidden` exists to clip its buttons' square corners
to the group's own rounded ones (every segmented control — mode/dur/acc,
the instrument panel's tabs, `#cfgtabs` — shares it). With 4 Settings
tabs (Saving/AI/GitHub/Other) at `flex: 1` and no wrap, a narrow sheet
shrank them down to their min-content floor and then just clipped
whatever still didn't fit off the end — Josh saw this as "the tabs
disappear, the content stays" (the pane below is normal block flow,
never clipped by `.seg`, so only the tab ROW vanished). Fixed narrowly
(scoped to `#cfgtabs`, not `.seg` itself, which other segmented controls
still rely on): `overflow-x: auto` and each button `flex: 0 0 auto;
min-width: 72px` — the row scrolls horizontally to reach whichever tab
doesn't fit, instead of `display:none`-ing it out of existence.

## Chrome density pass (2026-10-01)

Josh's screenshot (2026-10-01 14:37): the 🎓 badge was too small to read,
the Claude-status chip crowded the crumb, H made every track chip wide,
and the footer's readout row cost roll height. An advisor round brought
in Logic Pro's pattern for the same problem — rows hold only what's
constantly used, a toggle that's mostly off shouldn't cost width when
it's off, background work gets its own panel rather than living in the
main bar — written up in `docs/chrome-density-plan.md`. Steps 1-3 shipped
this pass; 4 (Notes popover) and 5 (readout inline + `fitReadline`) are
still queued.

**1. Claude status out of the header.** `#nowchip` — the
`position`-then-`flex` header chip from the 2026-09-30 layout pass above
— is gone entirely (markup, CSS including its `@container` compact form,
the `askStatusRender()` lines that wrote it, its own click handler). The
AI window's `#asknowstrip` is now the only place the full status line
shows: it was single-line ellipsis, now `display: -webkit-box;
-webkit-line-clamp: 2` so a long "queued — the terminal is busy…" line
gets a second row instead of being cut off (`.open`, from tapping the
strip for Recent, drops the clamp with `display: block`). In its place,
`askStatusRender()` toggles a `working` class on `#askbtn` (✦ AI) under
the exact condition that used to show the chip at all — `askCaps.bridge
&& !askStatusIdle()` — and sets its `aria-label` to `"Talk to the AI
tutor — Claude Code is working: " + askStatusNow.text`, or back to the
plain `"Talk to the AI tutor"` when idle or bridgeless. `.working::before`
draws a small pulsing accent dot (`::after` was already spoken for —
`#askbtn.hasnote`'s ✉ — so the dot lives on the other pseudo-element);
`#askbtn { position: relative }` anchors it. Net: the header carries one
small live signal instead of a whole truncating status line, and the
real text lives where there's room for two lines of it.

**2. 🎓 Learning tag.** `#lcdmode` (the 1-glyph `.lcdlbl` badge that used
to sit in the LCD) is gone; in its place, `#modepill` is a real gold
pill — `🎓 Learning` — in the exact header flex slot `#nowchip` used to
occupy (the header's right end, after `#songcrumb`), shown only when
`appMode() === "learning"` (boot's early `document.getElementById`
block and `applyMode()` both write its `display`, same as `#lcdmode`
did). It reuses `#nowchip`'s old compact-icon `@container (max-width:
860px)` trick — `.pilltext` (`Learning`) hides, the pill shrinks to a
26px square showing the bare 🎓 at `1rem` instead of the pill's normal
`0.75rem`, so it's actually legible collapsed (Josh's screenshot
complaint). Tapping it never flips the mode — it calls
`document.getElementById("viewsheetbtn").click()`, the same as tapping
View ▾ itself, landing on the same menu where `🎓 Learning mode` already
lives as a real toggle. Learning and Listener are independent switches
(a phone can be both), so the pill stays visible in Listener mode even
though `body.listener` hides `#viewsheetbtn` — the click handler checks
`listenerMode` and no-ops, and `body.listener #modepill { cursor:
default }` is the only visual nod to "this doesn't do anything right
now," rather than another `display: none` special case.

**3. Track chips: H off the chip.** `renderTrackbar()`'s chips used to
always carry 5 children (dot, name, M, S, H); H now only renders — as a
5th child, lit gold via the same `.solo.on` look M/S already use,
`aria-pressed="true"` — when the track IS hidden, via the same
`mkToggle`/`trackToggle(ti, "hidden")` path as before. A visible, not-yet-
hidden chip is 4 children, ~24px narrower. Hiding a track for the first
time starts instead from a new `"Hide notes"` toggle, `#vmhide`
(`aria-pressed`, `.active` when on), added to `buildVoiceMenu()`'s header
row between the track-name label and the ✕ close button — it calls the
same `trackToggle(ti, "hidden")` and then re-renders the menu
(`buildVoiceMenu(ti)`) so its own pressed state stays in sync. The
Mixer's per-strip H (`renderMixer()`'s `mkBtn`) is untouched — it was
never crowding anything, so it keeps the always-visible M/S/H row DAW
conventions expect there.

Tests: `tests/night-roll.test.mjs`'s status test now asserts
`#askbtn.classList.contains("working")` and its `aria-label` instead of
`#nowchip`'s text/display; the old single VoiceOver chip test split into
a not-hidden case (asserts exactly 4 children) and a hidden case (5th
child, `aria-pressed="true"`, one click drops it back to 4); a new test
drives `#vmhide` directly and checks `trackState[ti].hidden` both ways.
Help: the "What Claude Code is doing now" dd was rewritten around ✦ AI's
dot instead of a chip (dt text kept verbatim — FEATURES drift guard); the
"🎓 Learning mode" dd now names the header tag instead of "a little 🎓 in
the LCD"; the "H hides the track" sentence (kept verbatim) now says it's
reached from the voice menu or the Mixer, with a new "lit H" FEATURES
keyword for the chip's own behavior while hidden.

**4. Drop-ups: ☰ Notes ▴, the view switcher, and ⋯ More.** Josh's own
term (2026-10-01): "the reverse of a drop-down menu like the File menu —
it drops upwards." One shared pair of functions,
`openDropUp(btn, menu)`/`closeDropUp()` (beside `closeFileMenus()`, which
now closes whichever drop-up is open too, and vice versa — `openDropUp`
calls `closeFileMenus()` first), opens a `.dropup` positioned the same
way `#editsheet`/`#viewsheet` are (`left` clamped to `songRegionRight()`)
but anchored by `bottom` (`wmInnerHeight() - r.top + 6`) instead of `top`,
so it opens upward from its trigger. `.dropup`/`.dropup.on`/`.dropup
.fitem`/`.fdiv`/`.cfgsec`/`.row`/`select` (CSS) replace the old
`#moresheet`-specific rules — `#viewswitchmenu`, `#notesmenu` and
`#moresheet` all just carry `class="dropup"` now. A shared `pointerdown`
listener closes the open drop-up on an outside tap, exempting the three
trigger buttons by id (`#viewbtn, #listbtn, #moresheetbtn` — their own
click handler does the toggle-closed, via a `was` check in `openDropUp`)
and anything inside the open menu itself (so a native `<select>` inside
it, `#findsel`, and its iOS picker stay safe — the containment check
alone covers it, no special-casing needed).

- **☰ Notes ▴** (`#listbtn`): replaces the separate ☰ Notes / + Note pair.
  `#notesmenu` holds two rows — `#notebtn` (`"+ New note"`, the SAME node/
  id/handler as before, just moved and relabeled — still `openEditor(null)`
  unconditionally, Josh 2026-08-25's "always a new note" rule) and
  `#notesall` (`"☰ All notes"`, new — calls the extracted `openNoteList()`,
  pulled out of `#listbtn`'s own old direct click handler, which now just
  opens the drop-up).
- **The view switcher** (`#viewbtn`): a drop-up (`#viewswitchmenu`: `▦
  Roll` / `▤ Tracks` / `𝄞 Score`, `renderViewSwitch()` puts a `✓` on the
  current one — same convention as `renderViewMenu`'s checkmarks)
  replaces the cycling button from the 2026-10-01 "way too big" 3-way-
  segment revert (above). `applyViewMode()` now sets `#viewbtn`'s own
  label to the CURRENT view plus `▴` (`"▦ Roll ▴"`), not the next one —
  picking a row calls `setViewMode(m)` and closes the drop-up. View ▾'s
  own Roll/Tracks/Score radio (`#vwRoll` etc.) is unchanged and still
  there as the findable path; help's "▤ Tracks view" and "View ▾ menu"
  dds reworded from "cycles Roll → Tracks → Score" / "cycles through" to
  name the drop-up.
- **⋯ More** (`#moresheetbtn`): Josh, same session, after seeing the
  Notes popover: "do it that way with the ⋯ More button as well — the
  More button has a whole window popping up and it's just unnecessary;
  just do it as a reverse drop-down." Un-migrated from the 2026-09-30
  tweaks pass's dockable window back to a drop-up: `#moresheet` dropped
  its `.overlay`/`.sheet`/`h2#moresheet-h2` wrapper and the
  `#moresheet-home` floating anchor entirely (its `#morerows` child — the
  one with the `SELECTION READOUT`/`HIGHLIGHT`/`SONG` rows — is now a
  direct child of `#moresheet` itself), lost its `makeWindow("moresheet",
  {dockable: true})` registration (so it's out of `WM_WINDOWS`, gets no
  Dock button, and the generic `.overlay` ✕/drag/resize/backdrop-tap
  machinery no longer applies to it at all), and is OUT of
  `tests/e2e/docking.spec.mjs`'s `WINDOWS` list. A device that had it
  docked or tabbed from the window-era is handled gracefully: right after
  `wm = wmLoad()`, a short pure migration (`wmRemoveSideTab`/
  `wmClearBottom`, no DOM — safe at module-eval time in the vm harness
  too) drops a stale `"moresheet"` id from `wm.left`/`wm.right`/`wm.bottom`
  and re-saves, and the dead `ff1roll-sheetpos-moresheet` localStorage key
  (the old floating window's remembered position) is removed too. The
  `#morebadge` gold `⏳N` badge on `#moresheetbtn` itself is untouched —
  still mirrors `#jobsbtn`'s running-job count with the menu closed, same
  `updateJobsBtn()` logic as before. Help: the "⋯ More" dd rewritten
  around the drop-up instead of "a real window … movable … dockable";
  FEATURES' "⋯ More" keyword kept verbatim (the dt).

**5. `#readline`, back in the button row.** `docs/chrome-density-plan.md`
step 4b. The readout (`#readline`: `#noteinfo` + `#chordbtn`) moves out
of its own guaranteed first line and into the button row itself, between
the left group (view drop-up / ⊞ Lasso / 🎹) and the right group (☰ Notes
▴ / conditional ⚠-✦ reply-Clear edits / Publish / ⋯ More) — markup-wise,
right after `#instbtn`. `#readline { flex: 1 1 300px; min-width: 300px }`
(CSS) replaces the old unconditional `order: -1; flex: 1 1 100%` — the
`.footerspacer` div (`margin-left: auto`, used to split the left/right
groups) is gone too, since `#readline`'s own flex-grow does that job now.
`fitReadline()` adds `.ownrow` (`order: -1; flex: 1 1 100%; min-width: 0`
— today's own-row layout, unchanged) whenever what's left for `#readline`
drops under 300px: it sums `getBoundingClientRect().width` for the
footer's other visible buttons BY ID (`viewbtn`, `lassobtn`, `instbtn`,
`listbtn`, `errbtn`, `askreplybtn`, `clearbtn`, `syncbtn`,
`moresheetbtn` — not a `.children` traversal, since the vm harness never
builds a real `#footer`→children DOM tree, only vivifies elements by id)
against the footer's own width, minus a fixed padding/gap allowance — not
pixel-perfect, good enough for a yes/no at the 300px line, and exactly
what the stubbed-`getBoundingClientRect` vm tests drive. It runs from a
`ResizeObserver` on `#footer` (catches the footer's own width changing —
window resize, a side dock opening) and a `MutationObserver` on the
footer's children's `style`/`class` attributes (catches buttons
appearing/disappearing — ⚠/✦ reply/Clear edits, folding), both guarded
`if (typeof document !== "undefined" && document.body)` (real browser
only, same convention as the `wmdock` menu's own dismissal listener) —
plus `typeof ResizeObserver`/`MutationObserver === "function"` checks,
and an unconditional `fitReadline()` call right after, which IS safe
under the vm harness (every element it touches is auto-vivified with a
default stubbed rect) and covers the case `applyChrome()` isn't called at
boot (nothing folded). `applyChrome()` itself now calls `fitReadline()`
too, since folding/unfolding line 2 wholesale changes the leftover.
`tests/e2e/docking.spec.mjs`'s readout check changed from a flat "#noteinfo
≥ 60% of the footer" to "#noteinfo ≥ 300px OR (#readline.ownrow AND
#noteinfo ≥ 60% of the footer)" — either a real inline readout or a
roomy own-row one passes; `tests/e2e/editor.spec.mjs`'s folding
assertions (~458/482) were re-checked and need no change — `#readline`'s
id and the `footer.folded > :not(#readline)` CSS rule are untouched.

Help: the "▤ Tracks view" dd and the "View ▾ menu" dd's own cross-
reference both reworded to name the view drop-up instead of a cycling
button (see "4." above); the "+ Note"/"☰ Notes" dts merged into one
"☰ Notes ▴" dt/dd (touch first — the drop-up and its two rows — no
keyboard equivalent exists to list after it); the "⋯ More" dd rewritten
around the drop-up. FEATURES gained a "+ New note" keyword (the merged
dd's own bold label for `#notebtn`); every other FEATURES keyword this
pass's rewording touched ("⋯ More", "8va", "find:", "Circle of fifths")
stayed in the new text, verbatim or as a substring.

## Chrome density pass — follow-up (Josh, 2026-10-01 afternoon)

After using acc1f8c (the pass above), Josh's screenshot
(2026-10-01T15-37-41-752Z) and six rulings in one sitting. Theme: the first
pass hid things *smaller*; this one asks whether each thing needs to be in
the main bar at all, and who else is already the right home for it. Two
more fixes landed the same session, mid-build, from his own use of the
build: #asknowstrip's height jumping with the status text, and a
ResizeObserver ⚠ from fitReadline's own write loop.

**1. ⋯ More is gone. Entirely.** Not a drop-up any more, not a window
before that — removed. Its own purpose ("tools used rarely enough they
don't need a permanent seat on the row") was already View ▾'s purpose, so a
second menu for the same job was one menu too many. `#moresheetbtn`,
`#moresheet`, `#morerows`, `#morebadge`, the `.moresong`/`#morerows:not(:has(…))`
CSS, the `openDropUp()` wiring for it, and its `makeWindow`/dockable-window
comment history — all gone. Its three groups land inside View ▾ now:
**HIGHLIGHT / READOUT** (`#octbtn` 8va, `#findsel` find:, `#cofbtn` ◯5
Circle of fifths — same ids, same handlers, same `renderOctBtn`/
`refreshFindSel`/click-handler code, just relocated markup) sits between
PANELS and DISPLAY; **BACKGROUND** (new: `#vwJobs` ⏳ Jobs, `#vwMessages`
⚠ Messages) sits between DISPLAY and MODE. Both forward to the footer
buttons' own click handlers after closing View ▾ first, same convention as
`vwGrid`/`vwCompare` (items that open a separate sheet rather than toggling
in place). The stale-`wm`-purge migration code (a device that had
`"moresheet"` docked/tabbed from either the window era or the drop-up era)
is untouched — it still runs, still pure, still purges the dead id.

**2. ⏳ Jobs: back on the footer, conditionally.** `#jobsbtn` is the SAME
node/id/handler that used to live inside ⋯ More's SONG group — `updateJobsBtn()`
is unchanged (hidden with no jobs at all; gold "⏳N" while running; dim "⏳"
once everything's finished but not yet auto-cleared). It's the footer's
last button now (⋯ More's old slot). `updateJobsBtn()` additionally writes
`#vwJobs`'s own text (`"⏳  Jobs"` + `" · N running"` when `running > 0`) so
View ▾ → BACKGROUND → ⏳ Jobs always names the running count too, even with
the footer button hidden — and View ▾'s copy never hides at zero, so a
finished, failed, or interrupted job stays reviewable after the footer
button's gone quiet.

**3. ⚠ errors: footer shows only when UNREAD.** `errChip()`'s footer
condition changed from `lines.length` (any message, read or not) to `n`
(the UNREAD count, same `askSeenMax().err` cursor Mark-as-read already
used) — `b.style.display = n ? "" : "none"`. `errChip()` also now writes
`#vwMessages` (`"⚠  Messages"` + `" · N"` when `n > 0`), and that item is
reachable from View ▾ → BACKGROUND always, log empty or not, so a log
you've already read is still one tap away without needing an unread count
to justify footer space.

**4. View ▾'s VIEW group: "View type ▸", not three rows.** "View ▾ is
getting long" was Josh's own note mid-ruling. `#vwRoll`/`#vwTracksView`/
`#vwScore` are the exact same ids/handlers/radio (✓ on exactly one) as
before, just nested one level inside a new `#vwViewTypeRow` (plain div,
`display:none` by default) that `#vwViewType` (a `.fitem` button, "▸  View
type: Roll") expands/collapses on tap — an expanding row, not a floating
submenu, so no extra positioning code and the whole thing stays inside one
`.dropup`. `renderViewMenu()` keeps the ▸/▾ glyph and the "View type:
<current>" label in sync off a new `vwViewTypeOpen` boolean; `aria-expanded`
tracks it too. `vwViewTypeOpen` had to go in the EARLY boot-safe block
(beside `APP_MODE`, not down near `renderViewMenu` itself) — the exact
boot-path-TDZ mistake the memory note already warns about: `renderViewMenu`
can run during boot, and a `let` declared further down the file would still
be in its own TDZ at that call even though the function declaration itself
is hoisted.

**5. The header's 🎓 Learning tag is gone.** `#modepill` — markup, its
`@container (max-width: 860px)` compact-icon CSS, `.pilltext`, the
`applyMode()`/boot `style.display` writes, the click-to-open-View▾ handler —
all removed. Learning mode itself is untouched (still Settings → Other,
still View ▾ → Mode → 🎓 Learning mode); nothing in the header names which
mode you're in any more. `#songcrumb` simply grows to fill whatever's left
of the header now that nothing sits to its right.

**6. ✦ AI's pulsing dot is gone.** "Always there and distracting" (Josh).
`#askbtn.working::before` and `@keyframes asknowpulse` are removed from the
CSS; `askStatusRender()` is otherwise untouched — it still does
`abtn.classList.toggle("working", working)` and still sets the aria-label
("Talk to the AI tutor — Claude Code is working: …" / plain "Talk to the AI
tutor"), so VoiceOver still hears the state, there's just nothing painted
for sighted use. The "working" class is harmless dead weight now (nothing
styles it) but stays, since JS code and tests already key off it and
removing it bought nothing.

**7. #asknowstrip: a fixed 2-line height.** Josh, same session: "text in
the AI dialogue is always shifting a little up and down … very annoying
while analyzing." Cause: the strip's `-webkit-line-clamp: 2` only clips a
2nd line when there IS one — a short status rendered the box at 1 line
tall, so the chat log below it jumped every time a status crossed the
1↔2-line boundary. Fix: `line-height: 1.3; min-height: calc(1.3em * 2)` on
the closed (clamped) rule reserves the full 2-line box always, short status
or long; `.open` (tapped — the un-clamped full text) is the one state
allowed to grow, so it gets `min-height: 0` back. Nothing else in
`askStatusRender()` toggles a size/display that would also jump on a status
tick — `#jobsnow` and the strip itself only flip `display` on bridge
presence, not per update, and ✦ AI's own visual is gone entirely (6, above).

**8. fitReadline's ResizeObserver loop.** A ⚠ "ResizeObserver loop
completed with undelivered notifications" showed up — caused by
`fitReadline()` being the RO/MO callback directly: its own write
(`classList.toggle("ownrow", …)`) can change `#readline`'s size, which sits
inside the observed `#footer`, so mutating layout synchronously from inside
the notification is exactly the pattern that warning exists for. Fix:
`scheduleFitReadline()` — both observers now call it instead of
`fitReadline` directly; it coalesces a burst of notifications into one
`requestAnimationFrame(fitReadline)` call, moving the actual measure+write
outside the notification cycle. `fitReadline()` itself is UNCHANGED and
still fully synchronous (direct call sites — `applyChrome()`, the boot
call, every test — still get an immediate result; the vm harness stubs
`requestAnimationFrame` as a no-op and `ResizeObserver.observe()` as a
no-op, so this only matters in a real browser). Belt-and-suspenders: a
`BENIGN_ERRORS` regex (`/^ResizeObserver loop (completed with undelivered
notifications|limit exceeded)/`) in the `window.addEventListener("error", …)`
handler drops the message before it ever reaches `logErr` — it's never
actionable, so it must never cost Josh a ⚠, whether or not the scheduling
fix fully prevents the browser from raising it on some frame.

Tests: `tests/night-roll.test.mjs` — footer-order and ⋯-More-removal tests
rewritten (`#jobsbtn` replaces `#moresheetbtn` as the footer's last id;
`#moresheet`/`#morebadge` asserted ABSENT everywhere, not just un-docked);
`fitReadline`'s stub-width test moved `#jobsbtn` into the conditionally-
hidden group (like `#errbtn`) instead of the always-visible five, and now
forces each always-visible id's own `style.display` explicitly rather than
trusting a connected-state default (`#syncbtn` only shows once
`updateSyncBtn()` sees a repo, which no isolated test establishes); the
View ▾ structure test checks all six groups in order and drives
`#vwViewType`'s collapse/expand/relabel; the jobs test checks `#vwJobs`'s
text instead of the retired `#morebadge`; the ⚠ log test checks `#errbtn`'s
display at 0/1/2 unread and `#vwMessages`'s matching count; new tests check
no `#modepill` markup/CSS/live-JS-reference survives, no `.working::before`/
`asknowpulse` CSS survives, `#asknowstrip`'s fixed-height rule, and
`BENIGN_ERRORS`' regex. `FEATURES`' "⋯ More" keyword became "View type" (the
only item that genuinely no longer exists to point at — 8va/find:/Circle of
fifths/Learning mode/⏳/⚠ all still have a home, worded around their new one).
`node tools/build_help.mjs` regenerated HELP.md from the reworded help
sheet (🎓 Learning mode, ⊞ Lasso, ◯5 Circle of fifths, find:, ⚠ Messages,
⏳ Jobs, What Claude Code is doing now, View ▾ menu — the ⋯ More dt/dd was
deleted outright, nothing left to point at).

## Outline new notes (Josh, 2026-10-02)

The dashed white stroke drawFull puts on every `n.added` note (added since
the song opened) is now a View ▾ → Display toggle, **┄ Outline new notes**
(#vwAdded), off by default — writing a new song, every note is new.
Device-local pref `ff1roll-added-outline` ("1"/"0"), read lazily by
`showAddedOutline()` (a function with a cached `.v`, not a top-level let:
drawFull runs on the boot path), written by `setAddedOutline()`. The
`n.added` flag itself is unchanged — Publish/compare still use it.

## View ▾ sub-menus (2026-10-02)

Josh, after using the chrome density pass's regrouped menu for a day: "View
▾ is too tall — make EVERY section an expanding sub-menu." Generalizes
"View type ▸" (chrome density follow-up, ruling #4) to all six groups —
**View, Panels, Tools** (renamed from Highlight / Readout), **Display,
Background, Mode**. Each is now a header `.fitem` (`▸  Name` closed /
`▾  Name` open, `aria-expanded`) plus a content div
(`#vw<Group>Row`, `display:none` by default) the header's own click
handler shows/hides — the same mechanics `#vwViewType`/`#vwViewTypeRow`
already used, just applied to five more pairs (`#vwPanels`/`#vwPanelsRow`,
`#vwTools`/`#vwToolsRow`, `#vwDisplay`/`#vwDisplayRow`,
`#vwBackground`/`#vwBackgroundRow`, `#vwMode`/`#vwModeRow`). Every existing
item id, handler, ✓ logic, dimming and Learning-mode hiding is unchanged —
only one level deeper in the markup, inside its group's row div instead of
sitting loose under a `.cfgsec` caption (removed, along with the `.fdiv`
dividers a group's own content used to have between items — a thin `.fdiv`
stays only BETWEEN header rows now).

**Accordion.** `vwOpenGroup` (`null` or one of `"view"`/`"panels"`/
`"tools"`/`"display"`/`"background"`/`"mode"`) replaces the old
`vwViewTypeOpen` boolean, living in the exact same early boot-safe block
(next to `APP_MODE`) for the same TDZ reason — `renderViewMenu` can run
during boot, before a `let` declared further down the file is past its own
TDZ. At most one group is open at a time: each header's click handler is
`vwOpenGroup = vwOpenGroup === key ? null : key` (closes on a second tap of
the same header, otherwise swaps to the new one), and `renderViewMenu()`
loops a `{hdr, row, label()}` table — built FRESH inside the function on
every call, not a top-level `const`, for the same TDZ reason `vwOpenGroup`
itself needed the early block (a table built once at top level would sit
at this function's own late position in the file and could be read before
that line ran). `viewsheetbtn`'s own click handler sets `vwOpenGroup = null`
before every `renderViewMenu()` call that opens the sheet, so View ▾ always
starts with all six groups closed, even if one was left open last time.

**Header hints.** `label()` is read fresh every render: View names the
current view type (unchanged), Mode names the current mode
(`"Mode: Learning"` / `"Mode: Normal"`, `" · Listener"` appended when
`listenerMode`), Background shows `"Background · ⏳N"` while N jobs are
running — read off `#vwJobs`'s OWN text (`updateJobsBtn()`'s write,
`"⏳  Jobs · N running"`) via a regex rather than the `jobs` array directly,
again sidestepping `jobs`' own later-in-the-file TDZ. Panels, Tools and
Display carry no hint, same as before.

Help: the "View ▾ menu" dt/dd rewritten for the accordion (kept every
FEATURES drift keyword the old text carried — "View type", "find:",
"Circle of fifths", "Instrument panel", "Outline new notes", "View ▾ menu",
"STAYS OPEN", "Listener mode", "8va", "Analyze ▸", "Learning mode"); the
Lasso/Circle of fifths/find: dt's own "View ▾ → HIGHLIGHT / READOUT → …"
cross-references became "View ▾ → Tools → …". `node tools/build_help.mjs`
regenerated HELP.md.

Tests: `tests/night-roll.test.mjs`'s View ▾ structure test rewritten for
the six header ids (replacing the `.cfgsec` anchors), plus new assertions —
all six groups closed by default, one tap expands a group, opening a
different group closes the one that was open, tapping the open group's own
header closes it, the menu re-closes everything on every (re)open (not just
the first), and each item's markup falls INSIDE its own group's row div
(a balanced-`<div>` text extraction, not a DOM parent-chain walk — the vm
harness never builds one off static HTML, only off JS-side
appendChild/append). No `tests/e2e/*.spec.mjs` spec clicks a `#vw*`/
`#octbtn`/`#findsel`/`#cofbtn` id directly (grepped — none do, `viewsheetbtn`
itself is only ever checked for visibility), so none needed updating for
the new display:none-until-expanded groups.

## Install countdown (Josh, 2026-10-02)

An iPad install relaunches the app. `build-ipad.sh` (night-roll-app) runs
`node tools/claude-bridge.mjs --deploy-in 20` after the slow xcodebuild and
sleeps 20 s before `devicectl install`. The bridge holds `deployUntil`
(POST /v1/deploy {inSec}; 0 cancels) and GET /v1/status carries
`deployInMs` while it runs. askStatusPoll (10 s) hands it to `deployWarn()`,
which counts down on ✦ AI locally (gold "✦ AI · N", then "⟳"; reset after
90 s if no install came) and says it once in the status line. 20 s because
the poll is 10 s: he always sees ≥10 s.

## Deploy safeguards (2026-10-02)

Josh, after a bad build wiped notes in his Untitled song (recovered only
from Ask's chat history): "I'm really concerned now about doing work
because every time there's a deployment I worry something bad is gonna
happen." Three legs, all built around the existing Install countdown above.

**1 — off-device backups (the bridge).** `POST /v1/backup {key, doc,
notes?, at}` (`doc` = the song's `draftDoc()`, `notes` = its `.rollnotes`
text) writes `~/.night-roll-bridge/backups/<key with / → __>/<ISO
time>.json` — `backupKeyDir()` applies the same `sanitizeSongKey` rule
sessions use, then swaps `/` for `__`. mkdir -p; same auth as every other
route; body capped ~20 MB (413 past it, `readBodyCapped`, the same pattern
`/v1/shot` already used). A write is skipped when its `doc` is
byte-identical to that song's newest backup (`pruneBackups`'s sibling
check, not pruning itself). Retention (`pruneBackups`): newest 300 kept;
past that, a file only goes if it's also older than 7 days — a quiet song
never loses its history just because it crossed 300. `GET
/v1/backups?key=…` lists `{file, at, bytes}`; `GET
/v1/backups/<dir>/<file>` returns one stored record whole.

On the app side: `scheduleBackupFlush()`/`flushBackupNow()` (index.html,
beside the deploy-warning code) debounce 5 s off `saveDraft()` and
`saveLocalNotes()` — both call `scheduleBackupFlush()` guarded by
`editableSong()` (compositions + local/ drafts; never a capture or
starter), and `flushBackupNow()` itself re-checks `askCaps.bridge` (the
same flag `askStatusPoll` detects — no bridge, no backup, ever) before
POSTing. A flush also fires immediately on `visibilitychange` (tab/app
going background) and from deploy safeguard #2's first tick, below. A
failed POST never throws into an edit — `logDebug` only, same as every
other best-effort network call in this app.

**2 — a Version before every install.** `deployBeforeInstall()` runs once,
on `deployWarn()`'s FIRST tick of a cycle (not every 10 s poll): if the
open song is editable and its music or annotations differ from its newest
stored Version, it saves one labelled "Before update HH:MM" (`pushVersion`,
the same store File → Versions… reads) and triggers a backup flush (#1).
The music comparison is `musicSig()` (ppq/tracks/tempos/timesigs), not a
raw-blob compare — a local/ draft's own `seq` stamp (NIGHT-ROLL.md "Local
song persistence") bumps on every `saveDraft()` even when nothing musical
changed, so comparing the full stored JSON would "detect" a change on
every single tick.

**3 — "Not now" (Josh: "he decides when the install happens").** Tapping
✦ AI while a countdown or hold is active (`deployActive()`) opens a small
`appConfirm()` sheet instead of ✦ Ask — "A new version is ready. The app
will restart." **Install now** / **Not now** (no native dialogs, per
CLAUDE.md). **Not now** POSTs `/v1/deploy {hold: true}`; the bridge's
`deployHold`/`deployHoldAt` block `--deploy-wait` (below) regardless of
`deployUntil`, until released or 60 minutes pass (then GET /v1/status
stops reporting it on its own). The button becomes `✦ AI · ⏸` (the same
label-span `innerHTML` rebuild `deployButtonTick()` always did, icon
audit 2026-10-02) and the status line says the update is waiting.
Tapping ✦ AI again reopens the same sheet; **Install now** POSTs `{hold:
false, inSec}` — `3` if it was resuming from a hold (a short grace
window), `0` to go immediately from an un-held active countdown.
`deploySetHeld()` mirrors the bridge's own `deployHold` on every
`askStatusPoll()`, so a fresh poll (a reload, another device) always
shows the right thing even with no local countdown running.

`build-ipad.sh` (night-roll-app) replaces its old `--deploy-in 20 &&
sleep 20` with `--deploy-in 20 && node tools/claude-bridge.mjs
--deploy-wait` — the new CLI flag polls `GET /v1/status` every 2 s and
exits 0 once `deployInMs` has run out AND `deployHold` is false (also
exits 0 immediately if the bridge can't be reached, or after 60 minutes
of waiting) — only then does the script's own `devicectl install` run.
Tests: tests/bridge.test.mjs ("POST /v1/backup …", "backup retention …",
"\"Not now\" … blocks --deploy-wait …", "--deploy-wait also waits out a
plain countdown …"); tests/night-roll.test.mjs ("deploy safeguard #1/#2/#3
…").

## Material icons (2026-10-02)

Icon audit (docs/icon-audit.html, Josh: "those all look great, go ahead and
do it") swapped 41 emoji/Unicode glyphs for Google Material Icons (outlined
style, `@material-design-icons/svg`, Apache-2.0) across the toolbar,
transport, footer, AI window and File/Edit/View menus. Kept unchanged:
music notation (durations, accidentals, 8va, the ♪/𝄞/♫ glyphs), the M/S/H
track-chip convention, and the ▸/▾/▴/◂ disclosure carets — none of those
have a clearer Material equivalent, and the carets are one consistent
family already used in 15+ places. A few rows were graded EITHER
(no urgency either way, e.g. ⇅ Transpose, 🥁 Drum fill, ■ Stop) and were
left as they were.

**`ICON`** (near the top of the `<script>`, right after the `EDITION`/
`APP_BASE` block — boot-path TDZ rule, since renderViewMenu and other
boot-time renderers call it) is a plain object: `name -> "<path d=...>"`
(sometimes several `<path>`/`<circle>` tags). **`iconSvg(name, cls)`**
wraps that into `<svg class="ico [cls]" viewBox="0 0 24 24"
aria-hidden="true" data-name="name">…</svg>`. A static button that never
gets rewritten just inlines the svg directly in the HTML (as `#copybtn`
already did before this pass); a control JS rewrites (counts, the
Play/Stop swap, View ▾'s checkmarks) calls `iconSvg()` at render time, or
— for a handful of help-sheet placeholders — gets filled from `ICON` at
boot via `svg[data-icon]`.

**CSS** (`svg.ico`/`.ico`, near the top of `<style>`): `.ico` alone is the
centered icon-only-button size (18px); `.ico.txt` sits inline beside
visible text at the same 18px (transport/footer controls — Play, Prev,
reply…); `.fitem .ico` is the ~16px drop-up/menu-row size, a plain
descendant selector so every Edit ▾/View ▾/File row picks it up with no
extra class; `.ico.inl` is a ~1em inline size for naming a switched icon
inside help-sheet prose. Icons use `fill: currentColor`, so disabled/
active/gold states still work with zero extra CSS.

**The label-span problem.** `textContent =` wipes any child `<svg>`, so
every control JS rewrites got restructured around it:
- `#playbtn`: `setPlayBtn(state, label)` (defined right beside `iconSvg()`)
  rebuilds the whole button's `innerHTML` — icon (play_arrow/stop/
  hourglass_empty while loading) + label — every time, instead of the old
  `"▶ "` / `"■ "` / `"⏳ "` text prefix. Every `playbtn.textContent = …`
  call site became a `setPlayBtn(…)` call.
- `#jobsbtn`/`#errbtn` and their View ▾ twins `#vwJobs`/`#vwMessages`: the
  svg is a static sibling in the HTML; `updateJobsBtn()`/`errChip()` only
  ever touch a `.lbl` span's `textContent` now.
- `#gridchip`/`#vwGrid` (the custom-grid chip, ▦N before): same pattern,
  svg static, `.lbl` carries just the count/"N/bar" suffix.
- `#viewbtn` (the footer Roll/Tracks/Score drop-up) and `#vsRoll`/
  `#vsTracks`/`#vsScore`: `applyViewMode()`/`renderViewSwitch()` rebuild
  `innerHTML` fresh each call (icon or, for Score, a `<span class="ico
  glyph">𝄞</span>` — 𝄞 is a KEEP glyph, not a switch, but it still needs
  to survive the same rebuild, so it rides in the same icon slot as plain
  text instead of an svg).
- `renderViewMenu()`'s `base` table (Roll/Listener mode/Tracks view/Mixer/
  Edit toolbar/Bottom bar/Instrument panel/Compare with repo/Analyze ▸,
  plus the KEEP glyphs Score view/Tracks/Outline new notes/Notes strip/
  Learning mode riding the same `{icon}`-or-`{glyph}` shape) rebuilds each
  row's `innerHTML` as `<span class="chk"></span>` + icon/glyph +
  `<span class="lbl">text</span>`; `set(id, on, dim)` now only ever
  touches `.chk` (the fixed "✓ "/"   " state column), never the whole
  button.
- `#askbtn`: `<svg class="ico txt">` (auto_awesome) + `<span
  class="lbl">AI</span>`; `deployWarn()`'s install countdown writes only
  into `.lbl` ("AI · N", then "AI · ⟳" — the "⟳" itself is a deliberate
  reuse of the redo glyph as a stuck-install spinner, not the Undo/Redo
  icon switch, and is left as-is).
- `fsubItem(label, onTap, dim, icon)` (File ▾'s sub-menu builder) grew an
  optional 4th argument; passing an icon name builds `iconSvg(icon) + "
  " + label` instead of plain text. Used for "Play album" (💿 → `album`).
- Help-sheet inline icons (none needed in the end — every mention of a
  switched glyph in help-sheet prose was reworded to the word form
  instead, e.g. "⏳ Jobs" → "Jobs", "⟲ step" → "undo step"; see the next
  paragraph) would use `<svg class="ico inl" data-icon="name"></svg>`,
  filled by the same `svg[data-icon]` boot fill `iconSvg()` writes to —
  that mechanism exists (a one-line `querySelectorAll` at boot) for any
  future case where the word form reads worse than a small inline icon.

**Help sheet & tests.** Every `<dt>`/inline `<b>` mention of a switched
control's OLD glyph was rewritten to name it in words instead (the
alternative the icon audit task allowed) — "☰ Notes ▴" → "Notes ▴", "⟲
step" → "undo step", "🎲 Drummer" → "Drummer button", etc. Left alone,
deliberately: glyphs that are still genuinely in use elsewhere for an
unrelated meaning (the per-row "⚠ failed"/"⏳ preparing N%" convention in
job/publish lists, the "●" unsaved-dot indicator, the deploy countdown's
"⟳" spinner, the recording-piece "◀ downbeat / downbeat ▶" shift control,
the circle-of-fifths "⟲"/"⟳" rotate buttons) — none of those are the
switched CONTROL itself, just a glyph that happens to look similar.
tests/night-roll.test.mjs's `FEATURES` drift list (the "help sheet covers
every shipped feature" test) had its glyph-bearing keywords swapped for
a word-form phrase still present in the rewritten text (e.g. `"⟳ Redo"` →
`"edit: Undo, Redo, Copy"`, `"✦ AI"` → `"Talk to an AI tutor"`) so the
guard still actually checks something.

**Rule for new controls:** use a Material icon (outlined,
`@material-design-icons/svg`) unless the audit's KEEP reasons apply —
real music notation, the M/S/H convention, or a disclosure
caret/chevron. Add the path to `ICON` once; don't inline the same path
string in two places.

Install banner (2026-10-02, Josh: "did not notice the countdown"): #deploybanner, fixed top-centre above every sheet, gold — "Update installs in N s", Not now / Install now right on it (deployHoldNow / deployInstallNow, shared with the ✦ AI sheet); "Update waiting" while held; hidden when the install never came.

## Controls registry (docs/split-plan.md §4 step 2, 2026-10-02 — Josh, 2026-10-02 21:20: "the code is not well factored", approved)

`src/ui/controls.js`'s `CONTROLS` table (id → {icon, glyph, cls, label,
prefix, aria}) and `setControl(id, patch)` are the ONLY place that writes a
registered control's `innerHTML`/`aria-label` — a goal-post correction on
the paragraph above this one (**The label-span problem**), which describes
a `.chk`/`.lbl` child-span split that the actual icon-audit code never
used: every control JS rewrote (and still rewrites) its WHOLE `innerHTML`
each time, because the vm test harness's element stubs (tests/harness.mjs)
only implement innerHTML/textContent/children, not querySelector — there
was never a child element to touch selectively. `setControl()` is that
same whole-innerHTML rebuild, just centralized in one file instead of
copied at each call site.

`setControl(id, {icon, glyph, cls, label, prefix, aria})` — every field is
an independent PATCH: an omitted field keeps the control's last value (so
an aria-only call, like ✦ AI's "is the bridge working" dot, never clobbers
a countdown label another call just wrote, and vice versa). `icon` is an
`ICON` table name (src/ui/icons.js, rendered via `iconSvg`); `glyph` is a
literal character for a KEEP control (𝄞, ◂, 🎓, …) that predates or was
exempted from the Material pass — at most one of the two is set. `prefix`
is the ✓ /space checkbox column (View ▾'s rows, the Roll/Tracks/Score
drop-up). `cls` is `iconSvg`'s own extra class ("txt" alongside visible
text).

Migrated to `setControl` in step 2: `#playbtn` (`setPlayBtn` is now a thin
wrapper; `playGateTick`'s loading-percentage display too), `#volbtn`
(`setVolBtn`), `#jobsbtn`/View ▾'s `#vwJobs` (`updateJobsBtn`), `#errbtn`/
`#vwMessages` (`errChip`), `#askbtn` (`deployButtonTick`'s install
countdown, and `askStatus`'s aria-label), `#viewbtn` + the Roll/Tracks/
Score drop-up rows `#vsRoll`/`#vsTracks`/`#vsScore` (`applyViewMode`/
`renderViewSwitch`), and every `renderViewMenu()` row named in "Rule for
new controls" above plus `#vwGrid`. Not migrated (no fixed control id to
register, or out of this step's named list): the `renderJobs()`/
`fsubItem()` row factories, which build a FRESH button per call with no
persistent id; the mic/Speak button (`S.micBtn`/`#nmic`, a dynamic target
between two elements); `#askattach`/`#askshot`/`#askpick` (static markup
only — nothing in app.js writes their icon/label/aria, so there is no
writer to migrate).

`tests/controls.test.mjs` is the drift guard: `tools/split/
check-controls.mjs` statically scans every `src/**/*.js` file except
`ui/controls.js` itself for a `.innerHTML =`/`.textContent =`/
`.setAttribute("aria-label", …)` on an element resolved (by a direct
`document.getElementById("id")` chain, or a `const x =
document.getElementById("id")` local declared in the SAME top-level
statement) to a registered `CONTROLS` id. A per-top-level-statement local
map (not file-wide) avoids false positives from two unrelated functions
both naming a local `b`. The ALLOWLIST in the test is empty today — step 2
left no unconverted writer among the controls it registered — and may only
shrink from here as a later step registers and migrates more.
