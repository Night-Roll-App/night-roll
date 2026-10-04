# DAW inventory — Night Roll vs Logic Pro for iPad and other DAWs

Written 2026-10-04 from Josh's two Logic Pro iPad screenshots, Night Roll's
code and help sheet, and public docs for other DAWs. Not a plan to clone
Logic: a list of gaps, strengths and a short shortlist.

Builds on open-items.md "DAW CONVENTIONS REVIEW" (2026-09-29): items 1–12
there are mostly done now (save model, CoreMIDI, count-in, M/S/H, keys,
undo, mixer, text size, VoiceOver). This file is the next layer.

**Source tags** used below:
- `[shot]` — read off the Logic screenshots (inferred, not confirmed).
- `[doc]` — confirmed from the product's own user guide or release notes.
- `[gk]` — general knowledge of desktop DAWs; verify before building on it.
- `[code]` — Night Roll's code or HELP.md, with file and function.

---

## 1. Josh's two observations

### 1a. On-screen keyboard: scroll vs play

**What Logic does** `[shot]` `[doc]`
- Keys fill the full width at a fixed, finger-sized width (about 21 white
  keys across an iPad landscape; ~2 octaves visible). The window
  scrolls; the keyboard never squeezes to fit the song.
- A **Scroll** toggle next to a hand icon: hand = touches play; Scroll =
  dragging on the keys slides the visible range, no notes sound `[doc]`.
- **‹ +3 ›** octave buttons with a readout of the current octave offset
  from the home position (the two shots show +3 and −1) `[shot]`.
- **Sustain** button: hold while playing, or slide it right to lock `[doc]`.
- **Scale** button: pick root + scale and the keys show only scale
  notes `[doc]`. (GarageBand's keyboard has a three-way Glissando /
  Scroll / Pitch switch instead of one toggle, plus an arpeggiator `[doc]`.)
- Look: white keys with a soft gradient and rounded bottom corners, black
  keys with a lighter top face, a thin dark gap between whites, small grey
  **C2 / C3 / C4** labels at the bottom of each C only `[shot]`.

**What Night Roll does today** `[code]`
- `src/app.js` → `instRange()` (~L10465): the piano's range is the
  song's own pitch extent, octave-aligned C..B, and `pianoGeom(W)`
  (L10505) divides the panel width by that many white keys — so there
  is nothing to scroll and a wide-range song gets narrow keys.
- `drawPiano(W, H, lit)` (L10520): flat `#e8e4da` whites with `#333`
  strokes, black keys 60% width × 60% height centred on the white-key
  boundary (not real piano offsets), C labels on every C, pitch name +
  scale degree on lit keys. Panel height is fixed:
  `#instwrap { height: 168px }` (index.html L415).
- Touch: `instCanvas` pointerdown → `instTap(e)` plays; pointermove while
  the pointer is down → `instTap(e, true)` plays every NEW key under the
  finger (L10905–10925). That is the glissando Record relies on ("slide
  across keys for runs", HELP "Record") — and it is exactly why a swipe
  plays every note. The canvas is `touch-action: none` (index.html
  L328), so the browser never scrolls it either.
- Below the keys, `#instbar`: Piano | Guitar tabs, ▼ Fall (parked),
  `#instinfo` readout.

**Proposed design**
Gesture rules (one-finger glissando must survive — recording uses it):
1. **Play / Scroll segment** in `#instbar`, left of the tabs. Play (the
   default) keeps today's behaviour exactly. Scroll: a drag on the keys
   pans the visible range (velocity-free, no sound), a tap still plays
   one key (a tap is never a scroll). Device-local pref, like
   `ff1roll-inst-open`. Deterministic and one tap — matches Logic and
   GarageBand, so nothing to learn.
2. **Two-finger horizontal drag always scrolls**, in either mode. Night
   Roll already teaches "two fingers moving together pan" on the roll
   (HELP "Drag / pinch"); the keys should obey the same grammar. Pinch
   on the keys: no (key width stays fixed; pinch would fight play).
3. **‹ ›** octave buttons beside the segment with a range readout
   ("C3 – E5") rather than Logic's +3: the readout tells him where he is
   without counting. Tap = one octave; the panel animates ~120 ms.
4. **Home**: on song load the view starts at the song's lowest octave
   (today's range start). Lit keys outside the window show as small
   track-coloured chevrons at the panel's left/right edge, the same idea
   as the guitar's ▴/▾ octave-fold marks — a sounding note off-screen is
   still seen. Optional later: "follow" (auto-scroll to keep live notes in
   view) as a third segment state; not in the first pass.
5. **Sustain** (S, cheap once the panel has a bar): hold = notes ring
   until release; slide right locks it, like Logic. Plays through the
   same master path `instPlay` uses.

Look (one pass, `drawPiano` only):
- Fixed white-key width: ~44 CSS px on touch devices, ~30 px with a
  mouse; black keys 58% width, 62% height, placed with real offsets
  (C♯/D♯ lean toward each other, F♯/G♯/A♯ spread) — the keyboard reads
  as a piano at a glance, not a ruler.
- Whites: 1 px darker gap, 3 px rounded bottom corners, a 2 px bottom
  shadow line; blacks: lighter top face (two fills). Labels only on C
  when idle (keep "C4"), pitch + degree on lit keys as today — the
  track-colour lighting and degree labels are Night Roll's and stay.
- Keep Learning rules: degrees appear only once a key is declared
  (`keyNameAt`). A Logic-style **Scale** mode is fine under the same
  gate — shade out-of-key keys only after HE has set the key; never
  offer a scale picker that names one for him.

Where: `src/app.js` instrument panel block (L10440–10930), `#instbar`
markup (index.html L1448–1457), a help-sheet entry + FEATURES keyword,
`tests/gestures.test.mjs` (tap plays / drag in Scroll does not / two
fingers scroll / octave buttons clamp to 12..107).

### 1b. Playhead: handle in the strip, not under it

**What Logic does** `[shot]` `[doc]`
- The ruler has two bands: numbers + the yellow cycle strip on top,
  tick marks below. Dragging the upper band sets/moves/resizes the
  cycle `[doc]`.
- The playhead handle is a small light-grey rounded tag (about 26 px
  wide, dark outline, pointed bottom) sitting INSIDE the lower band; a
  1 px white line continues down through the tracks from its tip. The
  handle never overlaps the cycle strip `[shot]`.

**What Night Roll does today** `[code]`
- The strip exists (2026-10-03): `drawPlayheadStripBand(W)` (L3062)
  draws a ruler-like band between `S.STRIP_Y` and `S.RULER_H`
  (`STRIP_H = BASE_RULER_H`), bar ticks tall, beat ticks short. Tap =
  `seekOrMoveCursor`, drag = `scrubTo` via `S.drag.stripCursor`.
- Inside the strip the playhead is only a 1.5 px line
  (`drawStripPlayhead`, L3057).
- The **triangle** is drawn separately BELOW the strip, hanging into the
  notes: `cursorHandle(x)` inside the roll draw (L2426: base 22 px wide
  on `S.RULER_H`, tip 14 px down), again in Tracks (L3043) and Score
  (L8050). Hit zone `cursorHandleHit` (L4339): `y ∈ [RULER_H, RULER_H+16)`,
  `|dx| < 14`, and only while stopped. Drag → `scrubTo` (L4769).
- So there are two grab zones for one thing, and the visible handle
  covers the first row of notes.

**Proposed design**
- Delete the triangle (all three views). Draw one handle INSIDE the
  strip, drawn where `drawStripPlayhead` is called (after `drawRuler`,
  never in the scene cache — same discipline as now):
  - a rounded tag 18 px wide, `STRIP_H − 4` tall, 4 px radius, centred
    on x, top 2 px below `S.STRIP_Y`, bottom flush with `S.RULER_H`;
  - fill `--accent` when stopped, `--gold` while playing (keep the colour
    code — it carries state Logic's grey does not); 1 px outline a shade
    darker; a 1.5 px line of the same colour continues DOWN from
    `S.RULER_H` through the notes exactly as today. No line above the
    handle: the ruler's number band stays clean for the cycle.
  - Score view: x from `scoreTickToX`, as `stripPlayheadX` already does.
- Hit test: `cursorHandleHit` zone becomes the strip band
  (`y ∈ [STRIP_Y, RULER_H)`, `|dx| < 14`); it outranks the strip's own
  tap so a tap ON the handle never jumps the cursor by a snap. Everywhere
  else in the strip behaves as today. Allow the handle drag while
  playing too (the strip already scrubs mid-play) — one rule for both.
- Relation to the cycle: the amber cycle stays in the number band
  (`BASE_RULER_H`, L~3120); the handle lives below the section/chord
  lanes in the strip, so they never overlap. Playing a cycle: the handle
  runs under the amber span and snaps back to its left edge.
- Merge `S.drag.cursor` into `S.drag.stripCursor` (both already feed
  `scrubTo` and `handMidGesture`). Tests: the four "playhead strip" cases
  in `tests/gestures.test.mjs`, plus "handle tap does not move the
  cursor" and "handle drag while playing scrubs".
- Optional, not asked: when stopped, the line through the notes at 60%
  alpha so the handle is the loud part; while playing keep it solid.

Size: S (one afternoon; the risk is the Score x-mapping and the three
copies of the triangle).

**Shipped 2026-10-04** as designed: `drawStripPlayhead` draws the tag
(`TAG_W`/`TAG_R`/`TAG_HIT` beside `STRIP_H`), the three triangles are gone,
`cursorHandleHit` is the strip band and works while playing, `S.drag.cursor`
is folded into `S.drag.stripCursor` (+ `onCursor` for the no-snap release),
and a mid-play drag shows the tag under the finger (`stripPlayheadX`). The
60 %-alpha line idea was not done. NIGHT-ROLL.md "Playhead tag".

---

## 2. Inventory

Columns: Logic iPad / other DAWs → Night Roll today → worth it?
"Worth it" is judged against Night Roll's identity: learning composition
by ear from game music and Josh's own songs; Learning mode never names a
key, meter or chord for him unless asked.

### Transport & time display

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Transport with cycle button; LCD bar.beat.div.tick + tempo + sig + key; tap digits to type a position `[shot]` `[gk]` | HAS: Play/■/⏮, ●, LCD with bar.beat, tempo map, meter and key that stay honest ("4/4?", "C?"); tempo/meter/key tappable to declare `[code HELP "LCD readout"]` | — |
| Typed bar jump / drag a digit | MISSING | Yes, S — hands: "go to bar 37" without scrolling |
| Seconds / SMPTE readout | MISSING | Maybe, S — chip captures have real-time loop points; m:ss beside bar.beat |
| Tempo in transport (tap tempo, nudge) | PARTIAL: metronome sheet has tap tempo; song tempo via annotation | No for captures (tempo is measured fact); fine as is |
| Speed/varispeed | HAS: 25–200%, pitch true `[HELP "Speed slider"]` | — |
| Hardware keys | HAS: Space, Return, K, C, R, Q, ⌘←→, ⌘A/C/X/V/D/Z/S `[HELP "Hardware keyboard"]` | — |

### Ruler, cycle, markers

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Cycle: drag upper ruler to set; drag centre to move; edges to resize `[doc]` | PARTIAL: drag sets, edges resize (`rangeEdge`, L4579); whole-cycle move not found; tap parks/re-arms | Yes, S — drag the amber band's middle to move it |
| Markers with names; marker list; jump next/prev | HAS more: sections, chords, keys, meters, tempo, loop points, text-note flags, all beat-anchored and in git `[HELP "Annotations"]` | — (strength) |
| Skip-cycle, autopunch locators `[gk]` | MISSING | No |
| Grid / snap value menu (1/4, 1/8, 1/16, off) `[shot "Snap 1/4"]` | HAS: 16th/32nd/triplet/dotted via duration chips, custom lines-per-bar `[HELP "Grid"]` | — |

### Playhead

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Handle inside the ruler's lower band; line down; drag to scrub `[shot]` | HAS (2026-10-04): the tag in the strip, draggable even while playing (§1b) | done |
| Catch/follow mode toggle | HAS: auto-follow suspends on manual scroll, re-latches `[HELP "Scroll while playing"]` | — |
| Scrub audio while dragging | PARTIAL: `scrubTo` seeks; no audible scrub | Maybe, S — sound the notes under the handle while dragging (one note at a time is the whole point of analysis) |

### Tracks & regions

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Regions as containers: loop by dragging, split, trim, mute, colour, alias `[doc]` | MISSING as containers: notes live on the track; Tracks view shows note blobs; audio tracks DO have clips with nudge/trim `[HELP "∿ Audio tracks"]` | No for MIDI regions — sections + lasso + ⌘D repeat cover the use; revisit if arranging whole songs becomes the job |
| Track header: icon, name, M/S, record-arm, volume, pan, freeze | HAS: chips with M/S/H, voice & colour menu, fader, pan, rename, reorder in Mixer; selected chip = record target | — |
| Track types: software instrument, audio, drummer, pattern, external MIDI | HAS: chip voices, sampled instruments, game instrument libraries, audio tracks, kit lane | — |
| Track stacks / folders `[gk]` | MISSING | No |

### Piano roll editing

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Tools: pointer, pencil, brush (paint a run), eraser, scissors, glue, marquee `[doc]` | HAS: Select/Pencil/Erase/Lasso, pencil-drag stretches, Split, Join, Divide; no brush | Maybe, S — brush = pencil-drag that lays repeated notes of the chip duration; useful for hats/arps |
| Velocity: drag vertically on a note, velocity lane, colour by velocity `[doc]` | PARTIAL: vol slider edits selection live; no lane, no per-note gesture, no colour mode | Yes, M — a velocity lane under the roll (bars per note, drag to shape); it can also SHOW chip envelopes (`n.ve`) as facts |
| Quantize with strength, swing, Q-range `[doc]` | HAS: strength 100/75/50, ends optional `[HELP "Quantize (Q)"]`; no swing | Maybe, S — swing % on the same sheet, for his own songs |
| Scale quantize (pitch) `[doc]` | MISSING | No in Learning (names the scale); Normal-only maybe |
| Transpose / in-key moves | HAS: chromatic, octave, in-key degree moves `[HELP "Transpose"]` | — (ahead) |
| Ghost notes from other tracks (FL) `[doc]` | HAS by design: all tracks on one roll, H hides | — |
| Mute a single note `[doc]` | MISSING | Maybe, S — "what if this note weren't there" without deleting |
| Time-stretch a selection (⌥-drag end) `[gk]` | MISSING | Maybe, S — half/double time of a selection is a real composing move |
| Legato / fill gaps, humanize `[gk]` | MISSING | Maybe, S (legato); No (humanize — raw takes already keep feel) |
| Chord insert, progression library | HAS: ♫ chords, 24 emotion-tagged progressions in Roman numerals `[HELP "Insert chord"]` | — (ahead) |
| Note repeat / duplicate | HAS: ⌘D repeat, copy/paste with bands | — |
| MIDI CC / pitch bend / aftertouch lanes `[doc]` | PARTIAL: duty (CC70) and envelope decay are stored/written, not editable | Maybe, M — see Automation |
| Score editing on the same data | HAS: engraved score, pencil/erase on staves `[HELP "Score entry"]` | — (ahead; Logic iPad has no score editor) |

### On-screen instruments

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Keyboard: Scroll mode, octave ±, Sustain, Scale, velocity by touch `[doc]` `[shot]` | PARTIAL: piano fits the song's range, no scroll, no sustain; swipe plays every key (§1a) | **Yes, M — §1a** |
| Fretboard play surface `[doc]` | HAS: 24-fret guitar with octave-fold rings, lit by track colour | — (ahead on the learning side) |
| Drum pads `[doc]` | MISSING: kit lane + 🥁 step grid + Drummer instead | Maybe, S–M — 8 pads for recording a groove live |
| Chord strips / Smart instruments (GarageBand) `[doc]` | MISSING | No in Learning; Normal maybe — the progression library already covers "give me chords" |
| Arpeggiator (GarageBand) `[doc]` | MISSING | Maybe, S — his son's arpeggiator take came from a hardware one |
| Keys light in track colours, degree labels after a declared key | HAS | — (strength) |
| Falling-notes view (Synthesia) `[doc]` | PARKED: ▼ Fall stopped playback on the iPad | Yes, M — revive once the drawing cost is measured; wait-for-note mode is the learner's feature Synthesia proves |

### Step sequencing & patterns

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Step Sequencer: per-step velocity, gate, probability, melodic rows; Pattern regions `[doc]` | PARTIAL: 🥁 one-bar kick/snare/hat grid, pattern fill; no melodic steps, no probability | Maybe, M — melodic steps for chip arps; probability no |
| Drummer / Session Players (drums, bass, keys) `[doc]` | HAS: Drummer and Bassist that read HIS declared sections/chords | — (strength: they explain what they read) |

### Browser, sounds, loops

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Sound browser: patches, loops, samples, presets `[shot]` | HAS instead: NES/GB/SNES/PS1 game instrument libraries, 36 soundfont instruments, song albums in Game order | — |
| Apple Loops / loop packs | MISSING | No — not the identity |
| Personal snippet shelf (save a riff, drop it later) `[gk]` | MISSING | Maybe, M — "that B part from Tuesday" without opening the other song |

### Mixer & plug-ins

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Mixer: fader, pan, M/S, meters, sends, inserts | HAS: Mixer window with fader, pan, M/S/H, meter, master, reorder `[HELP "Mixer window"]` | — |
| EQ, compressor, reverb, AUv3 plug-ins | MISSING | No for chip truth; Maybe, M — one room reverb send + master limiter for his compositions |
| Stereo pan per track | HAS | — |

### Automation

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Track/region automation lanes: volume, pan, CC; draw and edit `[doc]` | MISSING (tempo map via tempo annotations is the only time-varying parameter) | Maybe, M–L — start with the velocity lane; a volume lane next; chip captures already carry per-frame volume that a lane could display as fact |

### Recording

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| MIDI record from keys and external controllers; count-in; metronome | HAS: on-screen keys + Web MIDI + CoreMIDI bridge; count-in from anywhere when recording; raw take + Quantize after `[HELP "Record"]` | — |
| Capture MIDI / retrospective record (Ableton Note, Logic) `[doc]` | MISSING | Yes, M — keep the last ~60 s of keyboard/MIDI noodling; "Keep that" writes it at the cursor as one undo step |
| Cycle record: takes stack, comping, replace/merge modes `[doc]` `[gk]` | MISSING: recording past the end grows the song; no take folders | Maybe, M — merge vs replace toggle first; comping no |
| Punch in/out range | PARTIAL: record from the cursor; no out point | Maybe, S — the cycle as punch range |
| Audio recording from the mic | MISSING: audio arrives by file (phone memo, DAW bounce) | Maybe, M — one ● on an audio track, same clip path as import |

### Undo & history

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Unlimited undo; undo history list; project alternatives/backups `[gk]` | HAS: one step per gesture incl. track changes; Versions (dated, last 20); Revert to published `[HELP "Undo", "Save Version"]`; undo clears on song switch | Maybe, S — an undo list in the Edit menu ("back 6 steps to before the Drummer") |

### File / project management & sharing

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Projects in Files/iCloud; templates; export song, stems, MIDI; share sheet | HAS: Open with albums/recents, New/Save As/Move to, Save Version, Publish to repo, share links, local folder mode, import hub (MIDI, NSF, GBS, SPC, PSF, VGM, audio), Download .mid, Download audio (WAV via share sheet) `[HELP "Files & Sync"]` | — |
| Stems export (one WAV per track) `[gk]` | MISSING | Maybe, S — the offline bounce exists; loop it per track |
| Score → PDF / print, MusicXML `[gk]` | MISSING (score view exists) | Yes, M — a printed page of his own piece is a learner's milestone; MusicXML later |
| Templates | PARTIAL: New = 3-voice NES song | No |

### Touch gestures

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Pinch zoom, two-finger scroll, tap/drag, Pencil draws and fingers navigate `[doc]` | HAS: pinch per axis, two-finger pan, dwell-to-grab, Pencil pref `[HELP "Drag / pinch"]` | — |
| Touch-and-hold a note → edit menu `[doc]` | MISSING (edit row + Edit ▾ only) | Yes, S–M — fewer trips to the edit row; hands |
| Three-finger swipe undo/redo (iPadOS system gesture) `[gk]` | MISSING | Yes, S — map the system gesture to undo/redo |
| Double-tap empty roll to zoom-to-fit | MISSING (fitView on load only) | Maybe, S |

### Accessibility

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| VoiceOver throughout; Dynamic Type | PARTIAL: Dynamic Type + text size pref; VoiceOver first pass; canvas notes not addressable `[HELP "VoiceOver"]` | Later, L — a keyboard-only note editor is real work; not now |

### Help & onboarding

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Quick Help "?" button: explains whatever you touch `[shot "?" in header]` `[gk]` | HAS: exhaustive help sheet (every feature), ✦ Ask tutor, status-line hints; no touch-to-explain, no first-run tour | Maybe, S–M — a ? mode that opens the existing help entry for the control under the finger; the text already exists |
| First-run tour / coach marks | MISSING | No — one user today; revisit for the App Store |

### Performance

| Logic iPad / others | Night Roll today | Worth it? |
|---|---|---|
| Native rendering; background audio | HAS: scene cache, per-measure score caches, lazy soundfont decode, background jobs, PWA offline, perf HUD (`?perf=1`); Fall parked for drawing cost | — ; measure before reviving Fall |

---

## 3. What Night Roll does that DAWs don't

- **Annotations as the real state**: sections, chords, keys, meters,
  tempo, loop points and text notes, beat-anchored, plain text, in git,
  dictated if wanted. DAW markers are names on a timeline; these are the
  analysis itself.
- **Learning mode**: nothing names a key, meter or chord until he has.
  Normal mode's estimates are labelled and never written without a tap.
  No DAW has this stance; Hookpad goes the other way (Roman numerals
  everywhere by default `[doc]`).
- **Chip-true data**: NES, Game Boy, SNES, PS1, PS2, Genesis captures
  through emulators, real channels and tempos, loop points, the
  console's own sound as playback, sounding-pitch offsets.
- **Roll + engraved score on one timeline**, same cursor, same cycle,
  pencil on either. Logic iPad has no score editor.
- **✦ Ask**: a tutor that sees the song, cursor, annotations and bars in
  view, with house rules (hints first, never names an unset key), and
  tools that write exactly what was asked as one undo step.
- **Evidence tools**: Chord challenge (which tones sound, which are
  missing), pitch-class finder with dimming, circle of fifths with a
  movable degree window, lasso pitch lists, query tools in `tools/`.
- **Guitar fretboard with octave folding**, keys and frets lit in track
  colours while the song plays.
- **Drummer and Bassist that read HIS structure** and say what they read.
- **Divide** for tuplets and **lines-per-bar** grids: figures no duration
  button spells.
- **No build step, installable, works from GitHub Pages**; Publish,
  Versions, Compare with repo; a bridge to Claude Code from the iPad.

---

## 4. Shortlist — best value for effort

| # | Change | Size |
|---|---|---|
| 1 | Playhead handle inside the strip; triangle gone in all three views (§1b) — **done 2026-10-04** | S |
| 2 | Keyboard: fixed key width, Play/Scroll segment, two-finger scroll, ‹ › octave with range readout, off-screen lit-key chevrons (§1a) | M |
| 3 | Keyboard look: real black-key offsets, rounded whites, shading; Sustain button (§1a) | S |
| 4 | Touch-and-hold a note → context menu of the edit-row actions — **done 2026-10-04** (hold a grabbed note still 600 ms; Undo/Redo in the menu); iPadOS three-finger undo/redo — **not built**: WebKit delivers it only to editable content, never to a canvas page | S–M |
| 5 | Capture MIDI: keep the last ~60 s of noodling; "Keep that" writes it at the cursor, one undo — **done 2026-10-04** | M |
| 6 | Velocity lane under the roll (drag to shape; shows chip envelopes as facts) — **done 2026-10-04** | M |
| 7 | Typed bar jump by tapping the LCD bar field; drag the cycle's middle to move it — **done 2026-10-04** (m:ss readout not built) | S |
| 8 | Score → PDF/print of his own piece — **done 2026-10-04** (File ▾ → Export score…: paged SVG in a self-contained HTML file via the share sheet; the iPad's own print path makes the PDF — NIGHT-ROLL.md "Export score") | M |

Josh's two items are 1–3. Everything else waits on his ruling.

Sources (public docs read for this file): Apple's Logic Pro for iPad
user guide (Keyboard Play Surface, Play Surfaces, cycle area, Piano Roll
Editor, release notes), GarageBand for iPad guide (Play the Keyboard),
Steinberg Cubasis 3 web help (Key Editor), Ableton Note product page,
Image-Line FL Studio manual (Piano roll), Hooktheory Hookpad guide,
Synthesia product pages.
