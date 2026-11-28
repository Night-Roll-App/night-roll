# Pickup bar — "bar 1 starts here" (#1190–#1192)

Status: plan (design advisor, 2026-11-27). No code in this document.
Companion to docs/plans/2026-11-27-layered-chords.md (same day, same file-
version machinery; see §3.6 for how the two version rules combine).

## 0. What Josh asked

Some songs start with a partial bar. He asked whether not counting it — so
the downbeats and the phrase numbers line up — was ridiculous; it is
standard practice: the notes before the first full bar are the **pickup**
(anacrusis), that bar is bar 0 or carries no number, and **bar 1 is the
first full bar**. His words: "if it's a real thing then I guess we need a
pick up annotation. Some way of specifying what part of the beginning of a
song is the pick up. … I'm guessing it's gonna be an entirely new annotation
but I could be wrong. Maybe it gets folded into some other existing
annotation."

This plan looks hard at every candidate, picks one, and lays out the
display rule, the storage rule, the UI, the Ask action, the exports, native
parity and the tests.

## 1. What exists today (facts from the code)

- **Bar numbers are arithmetic from tick 0.** Web: `resolveNote`
  (src/model/rollnotes.js:501) — `start = (b1 - 1) * barTicks + (q1 - 1) *
  beatTicks`; every tick → bar display is `Math.floor(t / bt) + 1` (ruler
  src/render/roll.js:421, LCD via `posParts` src/model/grid.js:155, Ask
  `askActPosText` src/ask/actions.js:500, Score `Math.floor(f / bt)`
  src/render/score.js:126, MusicXML `measure number="mi + 1"`
  src/export/musicxml.js:89, context rows `"bar " + (b + 1)`
  src/ask/context.js:160, generators `(fromBar - 1) * bt` src/gen/bassist.js:158
  and drummer.js:265, Go to bar src/input/gestures.js:542, query tools
  `parseBQ`/`fmtBQ` tools/query-lib.mjs:91, `.notes.txt` dump
  tools/dump_notes.mjs:45). Native: `SongPlan.tick(bar:beat:)`
  (Packages/NightRollCore/…/SongPlan.swift:101), `RulerDraw` prints
  `bar + 1` (Sources/RulerDraw.swift:111), `TransportReadout.position`
  (Sources/TransportReadout.swift:34), `SongNotes.bar(atTick:)`
  (Sources/SongNotes.swift:27), `ScoreModel` measures at `mi * bt`
  (Score/ScoreModel.swift:116), `MusicXMLWriter` `measure number="mi + 1"`
  (Export/MusicXMLWriter.swift:83), `RollOverlays.anchorTick`
  (Sources/RollOverlays.swift:16). There is no origin offset anywhere: the
  first downbeat IS tick 0, by construction.
- **Two directives already re-frame the bar grid, and both convert the other
  anchors through absolute time with a two-tap warning** so "chords stay
  glued to their music": the meter (`timesig:` — `convertAnchors`,
  rollnotes.js:889; editor src/ui/note-editor.js:1534–1552; native
  `AnnotationEditing.convertAnchors` + the `.confirm` at
  AnnotationEditing.swift:604) and the start chop (`chop: start`, stored in
  RAW capture coordinates, the one type that is — `shiftAnchors`
  rollnotes.js:874; editor note-editor.js:1559–1578; native
  AnnotationEditing.swift:614–631). Deleting either converts back the same
  way (note-editor.js:1613–1640).
- **One frame everywhere.** The file's `[bar, beat]` are the ruler's numbers
  — "display bars/beats (chop-relative, the declared meter's counted beat)"
  (src/ask/context.js:103). Josh reads and hand-edits these files (Q8,
  2026-09-30: provenance went into a header "not the notes a person reads
  and edits"). The JSON schema says a bar is ≥ 1
  (docs/annotations-v2.schema.json:62).
- **Forward compatibility.** A type a build does not know is kept whole
  (`n.opaque`, written back verbatim, shown in All notes under its type
  name, never drawn); an unknown field on a known type rides on `n.extra`.
  Native has the same (`Rollnotes.swift:42–43`). A `type: "chop"` with a
  value outside `start|end` is NOT protected: `jsonToRawNote` makes the text
  `chop: pickup`, the chop regex fails, and the writer emits it as a plain
  text note — the type is lost on one round trip through an old build.
- **The version lock.** Web reads ≤ 2 (`ROLLNOTES_MAX_VERSION = 2`,
  rollnotes.js:230); native reads ≤ 3 (`maxVersion = 3`, Rollnotes.swift:78 —
  layered chords phase 1 shipped natively, 001516e; the web half is the
  layered-chords plan, whose rule is "the writer emits version 3 only for a
  file that contains at least one `layer`; the version is a pure function of
  the notes list"). A too-new file opens read-only everywhere
  (docs/annotations-v2.md "Reader").
- **Song-level entries** (`analysis`, `songnote`) are anchored at `[1,1]`
  only because a note needs an anchor, are never drawn, and every bar edit
  skips them (`isSongLevelAnno`, rollnotes.js:406).
- **Help already teaches the rule:** help/help.html:265 (Analysis guide,
  "Common mistakes: Counting a pickup … as bar 1, which throws off every
  phrase count after it"). The app just cannot act on it yet.
- Loop directives embed a bar.beat in their TEXT (`loop: 2.1`), and
  `shiftAnchors`/`convertAnchors` rewrite that text too (rollnotes.js:882).
- Count-in: ONE bar of clicks, only from the song start
  (src/audio/transport.js:258–275).

## 2. The shape — one new type, `pickup`

### 2.1 Candidates, and why each wins or loses

**A. A field on the meter annotation** (`{"type":"timesig","timesig":"4/4",
"pickup":1}`).
- For: the meter and the pickup are decided together in notation.
- Against, decisive: the meter is optional analysis. Until Josh declares
  one the ruler is the neutral grid, and he may well hear the first downbeat
  before he has settled the meter — he must be able to mark "bar 1 starts
  here" with no meter declared. Deleting the meter would silently take the
  pickup with it. `bakeMeter` writes a list for a future multi-meter song;
  the pickup is a property of the song's start, not of a meter event. And an
  older build keeps the unknown field on `extra` but still displays the
  anchors in its own frame — so this buys nothing on compatibility either.
  **Loses.**

**B. A third chop mode** (`chop: pickup` — "bar 1 starts here, keep what is
before it as bar 0").
- For: the concept is close — chop: start is "bar 1 starts here, hide the
  rest"; it would share the editor row, the raw-anchor convention and the
  one-per-song rule.
- Against, decisive: an old build turns `chop: pickup` into a plain text
  note on the next publish (§1) — the one corruption the forward-compat work
  exists to prevent. And the word Chop says "remove"; a pickup is the
  opposite — the whole point is to keep the notes and hear them. **Loses.**

**C. A field on the loop directive.** Loop and pickup are unrelated ("loop:
2.1 … skipping the pickup-intro bar" in the spec is a coincidence of one
song). One per song is the only thing they share. **Loses.**

**D. No directive — just allow bar 0 in anchors and let the first note's
position imply it.** The frame has to be declared somewhere or every reader
would have to detect it from the music, which Learning mode forbids.
**Loses.**

**E. A new annotation type `pickup`.** Carries exactly one fact; older
builds keep it whole (`opaque`) and never lose it; nothing else's semantics
change; it reads in the file as what it is. **Wins.** Josh's guess was
right, and the hard look says why: the two "fold it in" candidates each
fail on an old build in a way the new type does not.

### 2.2 The entry

```json
{"at":[1,1],"type":"pickup","pickup":1}
```

- `pickup` — the LENGTH of the pickup in the ruler's counted beats (the
  denominator note, as every anchor beat is): `1` = one beat before bar 1;
  `1.5`, `0.5` allowed (fractions snap to the 16th grid the editor uses);
  at most one full bar (`pickup` ≤ beats per bar — a whole bar is the
  composition case, §3.3). More than a bar is refused in plain words: "a
  pickup is less than a bar — for a longer intro, label it a section".
- Why a length, not an anchor: the directive DEFINES the frame, so "where
  bar 1 starts" is `[1,1]` by definition and carries no information;
  "where the pickup starts" as `[0, q]` would work but hides the fact in
  arithmetic Josh would have to do while reading the file. `pickup: 1`
  reads as one beat.
- Anchored at `[1,1]` like the song-level entries, and treated like them by
  every bar edit (`isSongLevelAnno` gains `n.pickup`): Insert/Delete bars,
  whole-song moves, a start chop, re-barring never move it. It is a frame
  directive, not a thing at a place.
- Legacy text form, parsed forever: `pickup: 1` (one line, like `tempo:
  90`). `rawNoteToJSON`/`jsonToRawNote`, `ROLLNOTES_TYPES`,
  `ROLLNOTES_FIELDS` (`pickup`), `deriveNoteTypes` → `n.pickup = <beats>`,
  the schema's type enum, `tools/annotations.mjs`'s `typeOf`, native
  `knownTypes`/`knownFields`/`kind == "pickup"`.
- One per song: Save replaces (like the meter and the loop point);
  `dedupedNotesWithIndex` keeps the last.
- Never drawn as a flag (`isUndrawnAnno`) — the bar-1 line IS its mark
  (§4.1). Listed in All notes under its own PICKUP group, with a Delete.
- An optional attached `note` rides along like on every directive ("heard
  the downbeat on the bass entry").

## 3. The frame rule — anchors are stored in the pickup's frame, bar 0 allowed

### 3.1 The math

Let `P` = `pickup` in beats, `qt` = beatTicks, `bt` = barTicks, and
`T = P * qt` = the tick where bar 1 starts (the first downbeat). Then:

- `tick(b, q) = T + (b - 1) * bt + (q - 1) * qt` for every bar INCLUDING 0.
  Bar 0 is a full-length virtual bar ending at `T`; only its last `P` beats
  exist. A one-beat pickup in a four-beat bar: the first note sits at bar 0
  beat 4 — exactly what a musician says. A whole-bar pickup: bar 0 beat 1 is
  tick 0, beat for beat the old bar 1.
- `bar(tick) = floor((tick - T) / bt) + 1` — 0 for every tick before `T`;
  `beat(tick) = (tick - barStart) / qt + 1` with `barStart(0) = T - bt`.
- With no pickup, `T = 0` and every formula is today's.
- Bar count: `ceil((songEnd - T) / bt)` full bars "and a pickup".

This changes **every** tick ↔ bar conversion in §1 whether anchors are
stored raw or converted, because when the first downbeat is mid-bar (a
capture) the bar LINES move too, not only the numbers. There is no cheaper
"numbers only" version that handles a capture whose first note is mid-bar;
and the numbers-only case (a whole-bar pickup, `T = bt`) is just `P =
beats per bar` in the same formulas.

Two helpers carry it: `pickupTicks()` (reads the one `n.pickup` entry via
`S.declaredPickup`, set in `finalizeNotesImpl` beside `S.declaredTs`) and
`barStartTick(b)` / `barAtTick(t)` in src/model/grid.js, replacing every
hand-written `(b - 1) * bt` and `Math.floor(t / bt) + 1` in §1. Native: the
same two on `SongPlan` (`pickupTicks`, `barStart(_:)`, `bar(atTick:)`),
replacing `tick(bar:beat:)`'s body and the `bar + 1` sites.

### 3.2 Why convert anchors (file = ruler) rather than store them raw

The alternative — leave every stored `[bar, beat]` as it is today and only
shift what is displayed — looked safest at first glance and loses on three
counts:

1. **It breaks the one-frame rule for the first time.** The file would say
   `[5,1]` where the ruler, the LCD, the Ask context and the score all say
   bar 4. Josh reads and hand-edits these files; a chord he types at `[5,1]`
   meaning ruler bar 5 would land a bar early. The meter and the chop both
   chose "file = ruler" and converted; the pickup doing the opposite would be
   a trap with no precedent.
2. **It does not save the code surface.** The grid origin moves either way
   (§3.1), so every tick ↔ bar site changes in both designs; raw storage
   ADDS a conversion to every place that prints `n.b1` directly (All notes,
   the editor's from/ends-at fields, the Ask annotation lines, the loop
   text, the native equivalents), which the converted design gets for free.
3. **Its compatibility advantage is real but is already handled.** Raw
   storage lets an old build show the right positions with the old numbers
   and needs no version bump. The converted design needs the version lock —
   which exists for exactly this (§3.6) and which the layered-chords plan is
   exercising the same week.

So: **setting a pickup converts every anchor into the new frame through
absolute time** (the music under each annotation does not move by one tick;
only its number changes), with the SAME two-tap warning the chop and the
meter use: "⚠ Bar 1 starts here? Bars renumber and N annotation(s) are
re-expressed to keep their musical positions. Tap Save again to confirm."
Removing the pickup converts back. One function: `reframeAnchors(oldT,
newT)` — `shiftAnchors(delta)` (rollnotes.js:874) already does this
computation, but clamps at tick 0 and cannot produce bar 0; the new
function is `shiftAnchors` without the clamp, with a floor-modulo so a tick
before `T` yields bar 0 and a beat in `1 … beats`, plus the `pickup` entry
itself and song-level entries skipped, and the loop text rewritten as
`shiftAnchors` already does. Round trip (set then remove, or remove then
set) is exact because `T` is on the 16th grid and beats may be fractional.

Which anchors can land in bar 0: anything whose tick is before `T` — a
chord over the pickup notes, a text note on the first note. `[0, q]` with
`q ≥ beats − P + 1`. The schema's bar minimum becomes 0; the legacy anchor
regex (`\d+`, rollnotes.js:129) already accepts 0.

### 3.3 The cases Josh named

- **A capture whose first note is mid-bar** (the first downbeat at some tick
  `T < bt`): today the whole grid is wrong — every downbeat shows at beat
  `beats − P + 1`. He puts the cursor on the first downbeat (a ruler tap
  snaps to the nearest 8th), saves a pickup, and the bar lines move to the
  real downbeats; the notes before it are bar 0. This is the case the
  recording sheet already names ("a first downbeat that isn't at the piece's
  start means a pickup") and now has an answer for.
- **A pickup shorter than the bar** (one beat before a four-beat bar): `P =
  1`; bar 0 shows its last beat only; the LCD reads bar 0 beat 4 on the
  pickup note.
- **A composition where he wrote the pickup inside bar 1** (`T = bt`): `P =
  beats per bar`; every number drops by one, bar 1 becomes bar 0 beat for
  beat; no bar line moves.
- **His existing anchors keep pointing at the same music** — by the
  conversion in §3.2, one undo step away, never silently (the two-tap
  warning names the count).
- **Chop + pickup.** All anchors (and the pickup) live in the post-chop
  frame as every non-chop annotation does today; the chop directive stays
  raw. `T` is measured from the carved song's tick 0. Adding a start chop
  later shifts anchors as today and leaves `pickup` alone (it is a length);
  Josh can re-set it if the chop ate the pickup.
- **Meter change + pickup.** `convertAnchors(oldTs, newTs)` must also
  rewrite `pickup` so `T` in ticks is preserved (`P' = T / qt'`), the way it
  rewrites the loop text — the downbeat does not move because he renamed
  the meter. If `P'` exceeds the new bar, the meter editor says so and
  refuses the re-bar until the pickup is removed (one line, no dialog).
- **Insert/Delete bars** (`openGapShift`/`closeGap`, src/model/selection.js:
  439/481): work from `barStartTick(at)`; the pickup entry is song-level and
  does not move; inserting at bar 0 is refused ("bar 1 or later").

### 3.4 Undo

Save and Delete of a pickup are each one `anno` undo step whose snapshot is
the whole annotation layer (`annoSnapshot`, src/model/edits.js:69 — it
already carries every converted anchor; Josh #1149 made the chop's delete
undoable this way). Nothing new; the test pins that undo restores every
anchor's old numbers AND the ruler's old labels.

### 3.5 Publish, local store, tombstones, merge

The entry is an ordinary note: `saveLocalNotes`, `annotationsFor`,
`mergeLocalAdditions`, `subtractTombstones`, `serializeNotesList` all carry
it with no special case beyond the type tables. One subtlety:
`mergeLocalAdditions` compares this device's notes with the published file
by anchor + text; after a pickup is set locally and the published copy has
none, the two lists are in different frames. Rule: a local pickup entry
whose published twin is absent (or differs) means the LOCAL list is
authoritative for anchors — the merge takes the local list whole for the
bar notes (the same way a chop add already does: `shiftAnchors` rewrites
the local list and the next publish writes it). The builder adds a test for
exactly this: local pickup + published without → publish writes the local
frame; reload from the published file → identical.

### 3.6 Version and the lock

An old build reading a pickup file would show every annotation `T` early
and let him add one in the wrong frame — the corruption the version guard
exists for. So the writer emits **`version: 4` for a file that contains a
`pickup` entry**, and readers accept ≤ 4. Combined with the layered-chords
rule, the version is still a pure function of the notes list:

```
version = pickup present ? 4 : layer present ? 3 : 2
```

Un-pickup'd, un-layered files stay byte-identical `version: 2` forever.
Both writers must agree (`rollnotesVersionFor` / `RollnotesWriter.version
(for:)`; tools/rollnotes-golden.mjs parity). The existing "too new" test
fixtures move from 3/4 to 5.

**Ship order — the reader first, in both apps.** Land the parse + frame
math + `MAX_VERSION 4` in web AND native before the UI that writes one, so
the day the editor appears no build of his locks on the file. (The
layered-chords plan has the same note: "the lock bites his iPad first".)

## 4. How it shows, everywhere

| Place | Today | With a pickup |
|---|---|---|
| Ruler bar labels (roll.js:421; RulerDraw.swift:111) | `floor(t/bt)+1` | bar lines at `T + k·bt`; the pickup span is labelled `0` in the dim colour; the line at bar 1 drawn at full alpha (the one visual that says "here"). Beat ticks keep their phase from `T`. |
| LCD bar/beat (`posParts`; `TransportReadout.position`) | from tick 0 | bar 0 and the counted beat (bar 0 beat 4 on a one-beat pickup); nothing else on the LCD changes. |
| Notes strip / subtitle / tap readout (`posText`, `SongNotes.strip`, `readout`) | "bar N" | "bar 0" in the pickup — the word pickup appears only in the Help and the All-notes row, never as a running label. |
| All notes, editor from/ends-at fields | `n.b1` | unchanged — the numbers are already in the pickup frame. Bar fields accept 0. PICKUP group: "pickup: 1 beat" (+ note). |
| Score view (score.js `buildScoreModelFor`; ScoreModel.swift) | measures at `mi·bt` | measure 0 = `[0, T)`, measure k = `[T+(k−1)bt, T+k·bt)`; measure 0 is engraved short (the proportional width the model already gives a sparse bar — the kit staff and every voice stay aligned since they share the measure list); the view's bar count line says "N bars + pickup". The web score prints no bar numbers today; the native `ScoreRuler` prints its labels through `bar(atTick:)` so it shows 0 then 1. |
| Ask context (context.js) | `bar N:` rows, span "bars X through Y" | rows for the pickup read `bar 0:`; the song line gains `pickup: 1 beat — bar 0 is the pickup, bar 1 the first full bar`; `askSpan` floors to `barStartTick`; the legend's one sentence: "bar 0, when present, is the pickup (the notes before the first full bar)". Replies keep "bars X through Y". |
| Ask actions (`askActBarBeat`, `askActInt(…, 1, …)`) | bars 1…N | `go_to`, `select`, `read_bars`, `play`, `play_seam` accept 0 when a pickup exists; `insert_bars`/`delete_bars`/`copy_bars`/`write_notes`/`drummer`/bassist accept 1…N only (bar 0 is partial — generating into it is a later question). `askBarsCount` returns full bars; messages say "this song has N bars and a pickup". |
| Go to bar (gestures.js:538; GoToBarSheet) | 1…cap | 0…cap; "of N" reads "of N (+ pickup)". |
| MusicXML (musicxml.js:89; MusicXMLWriter.swift:83) | `number="mi+1"` | measure 0: `<measure number="0" implicit="yes">`, contents sum to `T` (the model's measure 0 is `[0,T)`, so the existing per-measure writer emits only that much; the `btDiv` guard uses the measure's own length); `<time>` and the clef stay in measure 0's attributes as the first measure. Numbering then 1, 2, … — exactly the XSD's own words (tests/fixtures/musicxml-xsd/musicxml.xsd:2391). |
| ASCII tab (tab.js) | measures | measure 0 narrower (its own 16th count); bar numbers above the systems start at 0. |
| MIDI export (Export → midi) and the published .mid | meter at tick 0 when declared | **export**: when a meter is declared, write the pickup as its own short time signature at tick 0 — `P/den` reduced (one beat in four = `1/4`; a beat and a half = `3/8`) — then the declared meter at `T`; the standard DAW encoding of a pickup, and only when `P` is a whole count of the grid (else no extra event). **The published .mid is unchanged in phase 1** (Q4): `bakeMeter` keeps writing what it writes; the pickup is annotation state. |
| Generators (bassist.js:158, drummer.js:265) | `(fromBar−1)·bt` | `barStartTick(fromBar)` — kicks land on the real downbeats of a capture for the first time. Bar 0 is never a target (above). |
| Metronome / count-in (transport.js:258) | one bar of clicks before tick 0 | the click phase follows the downbeats (`T + k·bt`); the count-in from the song start is **one full bar PLUS the missing part of bar 0** ("1 2 3 4 · 1 2 3" then the pickup on 4) — one bar of clicks stays the minimum, and the pickup lands on its own count (Q3). |
| Loop seam, `rangeSel`, band edges (`BandEdit`, `RulerSpan`) | multiples of `bt` | snapping and whole-bar rounding use `barStartTick`; nothing else. |
| tools/query-lib.mjs `parseBQ`/`fmtBQ`, tools/annotations.mjs, tools/dump_notes.mjs | from tick 0 | read `doc.pickupTicks`; `.notes.txt` rows say `bar 0:` so web sessions (WEB-SESSION.md) read the same numbers the app shows. |
| Help | — | §7. |

## 5. The UI — fewest taps, and Learning mode

### 5.1 Marking it

Canonical path — the note editor, where every directive is made (web
note-editor.js type row at :205; native `AnnotationEditorView`):

1. Tap the ruler on the first downbeat (a tap places the cursor on the
   nearest 8th — already so).
2. **+ Note → Pickup** (a new type button after Chop; it prefills from the
   cursor the way Chop does: "Bar 1 starts at the cursor: bar 1 beat 4 →
   pickup of 1 beat"; the field he can edit is the pickup LENGTH in beats,
   with the computed "bar 1 starts at …" shown under it, live).
3. **Save**, **Save** again (the two-tap warning, only when other
   annotations exist).

Shortcut — the Go to bar sheet (opened by a tap on the LCD's BAR segment,
which is already the door for "where am I in the bars"): one button, **Bar
1 starts at the cursor**, that runs the same Save with the same two-tap
confirm inside the sheet's own status line. Tap ruler, tap BAR, tap the
button, tap again = four taps and no typing. Default yes (Q1).

Nothing else: no ruler long-press (the ruler has none today and a new
gesture on it would collide with the drag-to-select and tap-to-cursor he
relies on).

### 5.2 Seeing it

The ruler's `0` label on the pickup span and the heavier bar-1 line; the LCD
reading bar 0; All notes → PICKUP → "pickup: 1 beat"; the Analysis sheet's
Sections group gets nothing new (it lists his bands, whose numbers now
start where he wants). The score's short first measure.

### 5.3 Removing it

All notes → the PICKUP row → **Delete** (two-tap: "⚠ Removing the pickup
renumbers from the first note again; N annotation(s) are re-expressed to
keep their musical positions. Tap Delete again."). Also the Go to bar
sheet's button reads **Remove pickup** while one exists. Ask:
`delete_annotation` by its id. One undo step either way.

### 5.4 Learning mode — the law

- The app NEVER detects, proposes or pre-fills a pickup or a downbeat. The
  editor prefills from the CURSOR he placed, nothing else; no "⚠ a
  pickup?" hint appears anywhere on a song (the recording sheet's existing
  line about a late first downbeat is about his own recording's beat map
  under his own tempo-mapping request, not about the song's music — it
  stays as it is and does not grow a button).
- Normal mode may, later, offer "first downbeat heard at …" as an estimate
  labelled so — NOT in this plan; nothing from it may leak (same gate as the
  key estimate: `appMode() === "normal"` at the single call site).
- Help text explains the practice generically; the Ask system prompt tells
  the model bar 0 is the pickup and forbids it suggesting one unasked (the
  same clause pattern as "never name a key").

## 6. Ask

No new action name: the ONE `act` tool's `add_annotation` already takes
`kind: meter | chop | …`; it gains **`kind: "pickup"`** with two ways to say
it — `{kind:"pickup", bar, beat}` = where bar 1 starts in the CURRENT
numbering ("bar 1 starts at bar 2 beat 1" / "the first downbeat is bar 1
beat 2") or `{kind:"pickup", text:"1"}` = the length in beats. The action
converts, applies the frame conversion (no two-tap in Ask — the user asked
in words; the reply names the count re-expressed, and undo is one step),
refuses > one bar, refuses on a locked song. `edit_annotation` changes the
length; `delete_annotation` removes it. Spec text (one sentence each) goes
into the registry strings; `node tools/build_ask_help.mjs && node
tools/build_help.mjs` regenerates Help → AI commands.

Context: the song line (§4), `bar 0:` rows, the legend sentence, and in the
annotations list `pickup: 1 beat`. The system prompt: "bar 0 is the pickup
when the user has set one; never suggest that a song has a pickup or where
its bar 1 should be — he sets it". Native `AskAnnotations.legend` and
`AnnotationTools` mirror it.

## 7. Help, drift keyword, docs

- help/help.html, ANNOTATIONS tab, a `<dt>Pickup</dt>` after Chop: touch
  gesture first (tap the ruler on the first full bar's downbeat, tap the
  BAR readout, tap **Bar 1 starts here**; or + Note → Pickup), what changes
  (bar 0, the renumbering, annotations keep their music, one undo), how to
  remove it, and one sentence of the practice (a pickup is the note or two
  before the first full bar; standard notation leaves it unnumbered). The
  "Choosing the type" row list gains **Pickup**. Analysis-tab line :265 gets
  a pointer: "mark it with a Pickup annotation and the count fixes itself".
- `FEATURES` in tests/night-roll.test.mjs gains `"Pickup"` (the string must
  appear in the help-sheet region).
- `node tools/build_help.mjs` (never hand-edit docs/HELP.md).
- NIGHT-ROLL.md: the `.rollnotes format` spec block (JSON example line +
  text grammar entry `pickup: 1`), a "Pickup bar" section (the frame math,
  the two helpers, the conversion rule, the version rule), the Module map
  lines for grid.js; docs/annotations-v2.md gets a "v4 — pickup" paragraph
  beside the v3 one and the schema changes (type enum, bar minimum 0,
  `pickup` field); docs/ai-parity.md row; tools/README.md if a tool's output
  changes; docs/learning/glossary.md: "anacrusis / pickup" — ENCOUNTERED
  (Josh met it in #1190; promote to DEMONSTRATED when he marks one on a
  song of his and the phrase counts line up); open-items.md: this item
  closed, Q's below recorded; WEB-SESSION.md: one line that `.notes.txt`
  may start at `bar 0:`.

## 8. Native parity

Same frame, same file, same words. The files:

- `Packages/NightRollCore/…/Rollnotes.swift` — `knownTypes` + `pickup`,
  `knownFields` + `pickup`, `Annotation.pickup: Double?`, text form
  `pickup: N`, `maxVersion = 4`; `RollnotesWriter.version(for:)` → 4 when a
  pickup is present; `RollnotesDoc.declaredPickup`.
- `SongPlan.swift` — `pickupTicks`, `barStart(_:)`, `bar(atTick:)`;
  `tick(bar:beat:)` adds `T`.
- `AnnotationEditing.swift` — `case "pickup"` beside `"chop"` with the
  `.confirm` two-tap, `reframeAnchors`, the delete path, meter-change
  rewrite of the pickup length; `AnnotationEditorView` type chip + the
  length field with the live "bar 1 starts at …" line; `GoToBarSheet`
  (TransportLCD.swift:116) button.
- `RulerDraw.swift:107–111` labels and the bar-1 emphasis; `RulerSpan`,
  `RollRulerGestures`, `ScoreRuler` snapping through `barStart`.
- `TransportReadout.position/count` (bar 0), `SongNotes.bar(atTick:)`,
  `readout`, `strip`; `RollOverlays.anchorTick` and `declaredKey` ranges.
- `ScoreModel.swift:116–121` measures from `T`; `MusicXMLWriter.swift:83`
  measure 0 implicit; `TabWriter`.
- `AllNotesSheet.swift:295` PICKUP group row; `AskAnnotations.legend`,
  `AnnotationTools` (add/edit/delete kind pickup), `AppNotesText` (`bar 0:`
  rows), `AppActionTexts` (the spec strings — kept word-for-word with the
  web registry).
- Metronome/count-in in `Player`/`MetronomeSettings` per §4; Bassist/Drummer
  sheets' bar ranges from 1.
- Reopen-what-was-open is unaffected.

## 9. Tests

**Shared fixture** — `tests/fixtures/pickup.rollnotes.json` in the web
repo, byte-identical copy at `Packages/NightRollCore/Tests/…/Fixtures/`
(the pedal-until precedent, PedalAndExactEndTests.swift:140): a scratch
song (never his), `version: 4`, a four-beat ruler, `pickup: 1`, a chord at
`[0,4]`, a section `[1,1]–[8,4]`, a text note at `[2,2.5]`, a `loop: 1.1`
at `[9,1]`. Both suites assert the same ticks for each anchor, the same
ruler labels for the first three bar lines (`0` at tick 0, `1` at `T`, `2`
at `T + bt`), the same LCD reading at tick 0 (bar 0 beat 4), and that
parse → serialize is
byte-identical (web `serializeNotesList`, native `RollnotesWriter`;
tools/rollnotes-golden.mjs parity run).

**Web (vm, tests/night-roll.test.mjs; run via `node tools/run-tests.mjs`):**
1. Format identity for `pickup: 1` (text → object → JSON → object).
2. `rollnotesVersionFor`: no pickup/no layer → 2; layer → 3; pickup → 4;
   pickup + layer → 4. A `version: 5` fixture locks (`readOnly`).
3. Frame math: `tick(0,4) = 0`, `tick(1,1) = T`, `bar(T−1) = 0`,
   `bar(T) = 1`; whole-bar pickup: `tick(0,1) = 0`.
4. Setting a pickup via the editor's Save body on a list with 3 bar notes:
   first Save returns the warning (status text, nothing changed); second
   Save re-expresses every anchor so `n.start` is unchanged to the tick,
   bar 0 appears where expected, the loop text is rewritten; `S.editUndo`
   has one `anno` entry; undo restores the JSON byte for byte.
5. Delete converts back exactly (round trip).
6. Meter change with a pickup present keeps `T` in ticks (the `pickup`
   value is rewritten); a pickup longer than the new bar refuses the re-bar.
7. Chop add/remove leaves the pickup entry's value alone and shifts bar
   notes as today.
8. Ruler labels (`drawRuler` through a stub ctx, as the existing ruler
   tests do), `posParts` at tick 0, `askActPosText`, `askSpan` floors to
   `T + k·bt`, context rows start at `bar 0:`, legend sentence present.
9. `add_annotation {kind:"pickup", bar:2, beat:1}` on a song with notes →
   `pickup = beats per bar`; `{text:"1"}` → 1; `"5"` on a four-beat bar
   refuses with the plain message; locked song refuses with
   `ROLLNOTES_LOCK_MSG`; `go_to {bar:0}` lands on tick 0; `insert_bars
   {at_bar:0}` refuses.
10. Score model: measure 0 spans `[0,T)`; MusicXML measure 0 has
    `implicit="yes"` and `number="0"`, durations sum to `T`'s divisions,
    the document still validates against the bundled XSD (the export test
    already runs the validator); tab's first measure is short.
11. Generators: `drGenerate` from bar 1 puts the first kick at `T`.
12. Count-in from the start schedules `beats + (beats − P)` clicks ending at
    `playT0`.
13. Help drift: `"Pickup"` in the help region; Ask help rows regenerated.
14. An old-build simulation: parse the fixture with `ROLLNOTES_MAX_VERSION`
    forced to 3 → `readOnly`, every write path refuses.
15. Merge: local list with a pickup + published file without → publish
    writes the local frame; reload → identical notes.

**Native (XCTest, targeted):** Rollnotes read/write of the fixture (bytes),
`SongPlan` frame math, `AnnotationEditing` save/confirm/delete round trip,
`TransportReadout.position` at tick 0, `RulerDraw` label list,
`ScoreModel` measure 0 length, `MusicXMLWriter` measure 0 attributes,
`AnnotationTools` add/delete by kind, version 4 lock on a `version: 5`
fixture, `maxVersion` + writer agreement with the web golden.

## 10. Build order (each step pushes green on its own)

1. **Readers, both apps**: types, fields, `n.pickup`, `declaredPickup`, the
   two helpers, every tick ↔ bar site routed through them, `MAX_VERSION
   4`, version function, schema, shared fixture + tests 1–3, 8, 10, 14.
   (No UI yet; a hand-written fixture is the only way to get one.)
2. **Writer + editor + undo**, both apps: Save/Delete with the two-tap,
   `reframeAnchors`, meter/chop interplay, All notes row, Go to bar button;
   tests 4–7, 15.
3. **Ask**: `add/edit/delete_annotation kind pickup`, context + legend +
   system prompt lines; build_ask_help; test 9, 13.
4. **Exports + generators + count-in**: tests 10–12.
5. **Docs sweep** (§7), open-items, glossary, iPad build, `--say` ≤ 6 lines.

Browser-verify (Brave) a scratch composition: set a one-beat pickup, read
the ruler/LCD/score, undo, redo, remove; then an FF1 capture whose first
note sits mid-bar — never his own songs.

## 11. QUESTIONS FOR JOSH — each with the default the builder uses

- **Q1 Where does the one-tap shortcut live?** Default: a **Bar 1 starts at
  the cursor** button in the Go to bar sheet (tap the LCD's BAR readout),
  plus the Pickup type in + Note. Say if you would rather have it only in
  + Note, or somewhere else.
- **Q2 How long may a pickup be?** Default: **at most one full bar** (a
  whole-bar pickup covers the "I wrote the pickup inside bar 1" case);
  longer is refused with "label it a section". Say if you ever want two
  un-numbered bars.
- **Q3 Count-in with a pickup.** Default: **one full bar of clicks, then
  the empty part of bar 0**, so the pickup lands on its own count ("1 2 3 4
  · 1 2 3" then the pickup on 4). Alternative: exactly one bar of clicks
  ending at tick 0 (the pickup would then start on "1").
- **Q4 The published .mid.** Default: **unchanged** — the pickup is
  annotation state; only Export → midi writes the short time signature for
  the pickup bar. Say if you want published compositions to carry it too
  (then `bakeMeter` writes `P/den` at tick 0 and the meter at `T`, and the
  change republishes the .mid like a meter change does).
- **Q5 The ruler label for the pickup bar.** Default: **`0`** in the dim
  colour, bar 1's line drawn heavier. Alternative: the word "pickup", or
  no label.
- **Q6 Bar 0 as a generator / insert target.** Default: **no** — Drummer,
  Bassist, Insert/Delete/Copy bars and write_notes work on bars 1 and up;
  the pickup is edited by hand. Say if you want the Drummer to play into
  the pickup.
- **Q7 File version.** Default: **`version: 4` only when a pickup is
  present** (3 for layered chords alone, 2 otherwise); older builds open
  the song read-only until updated, and the readers ship to both apps
  before the editor does.

## Review

Reviewer: Fable, 2026-11-27. Checked against the web branch `pedal-1177`
(worktree ~/work/night-roll/night-roll-daw-pedal, head d3f77ba0 — layered
chords v3, `until`, pedals all landed) and native master (54dd211). No code
was changed. Line numbers below are pedal-1177's and native master's.

### Verdict: build with changes

The shape is right (one new type `pickup`, a length in beats, anchors
converted into the pickup frame with the two-tap warning, version 4 only
when present, readers first). Two things in the plan are wrong as written
and would move Josh's annotations silently if built as described: both
JSON readers coerce a bar-0 anchor to bar 1, and the web's local store
cannot carry a re-expressed layer across a reload before Publish. Both
are fixable inside the plan's design; the required changes below say how.
Everything else is factual drift (line numbers and version state from
`main`, not from the release line) plus risks the plan does not name.

### Factual errors

1. **§1 "Web reads ≤ 2 (`ROLLNOTES_MAX_VERSION = 2`, rollnotes.js:230)"
   and "the web half is the layered-chords plan".** On pedal-1177 the web
   half has landed (commit 8057cf40): `ROLLNOTES_MAX_VERSION = 3`
   (src/model/rollnotes.js:266) and `rollnotesVersionFor` exists (:273),
   as does native `RollnotesWriter.version(for:)` (RollnotesWriter.swift:21)
   and `Rollnotes.maxVersion = 3` (Rollnotes.swift:78). The builder extends
   those two functions; nothing is created. Every web line number in §1 is
   `main`'s: on pedal-1177 `resolveNote` is :544 (not :501),
   `isSongLevelAnno` :448 (not :406), `shiftAnchors` :936 (not :874),
   `convertAnchors` :955 (not :889), `resolveNoteWith` :874, the editor's
   meter save is note-editor.js:1601–1617, the chop save :1623–1641, the
   delete path :1681–1711, count-in transport.js:262–275. `shiftAnchors`
   and `convertAnchors` on this line also re-express a chord's `until`
   through `setEndUnits` (:944–946, :964–966) — `reframeAnchors` must do
   the same.
2. **§3.2 "the legacy anchor regex (`\d+`) already accepts 0".** True of
   the text grammar only (rollnotes.js:129), which no file uses. The JSON
   reader — the one every `.rollnotes.json` goes through — turns bar 0 into
   bar 1: web `jsonToRawNote` `b1: +at[0] || 1` (src/model/rollnotes.js:205);
   native `Rollnotes.raw` `b1: (b1 == 0 || b1.isNaN) ? 1 : b1`
   (Rollnotes.swift:199). A chord written at `[0,4]` would reload at
   `[1,4]` — a silent move of exactly the kind the plan forbids. Both
   readers also refuse an `until` whose bar is < 1 (web :214
   `+j.until[0] >= 1`; native :209 `ub >= 1`), so a chord over the pickup
   that ends off a whole beat inside bar 0 loses its exact end on reload.
3. **§3.6/§9 "tools/rollnotes-golden.mjs parity".** No such tool exists
   (tools/ has `annotations.mjs` and `migrate-rollnotes-v2.mjs`). The
   web/native byte parity is the shared-fixture test pair:
   tests/night-roll.test.mjs:18883 ("#1177/#1179 shared fixture") and
   native PedalAndExactEndTests.swift:142 `testSharedFixture` (the fixture
   lives at Packages/NightRollCore/Tests/NightRollCoreTests/Fixtures/, and
   its doc comment is :140–141, not the test). The pickup fixture follows
   that pattern, not a tool.
4. **§3.6 "The existing 'too new' test fixtures move from 3/4 to 5".**
   They are all at 4 already and every one must become 5: web
   tests/night-roll.test.mjs:13847 and :18109–18110; native
   NightRollCoreTests.swift:163 and Tests/EditInPlaceTests.swift:184; plus
   the prose in docs/annotations-v2.md:328 ("A v4 fixture … readOnly").
   A fixture left at 4 fails the moment `MAX_VERSION` becomes 4.
5. **§4 "All notes, editor from/ends-at fields: unchanged — the numbers
   are already in the pickup frame."** All notes does not print `n.b1`; it
   formats through `posAnchorText` → `posAnchor` (src/model/grid.js:164),
   which clamps with `Math.max(0, …)` and so prints `[0,4]` as "bar 1".
   Native `AllNotes.posAnchorText` (AllNotesSheet.swift:109–117) goes
   through the same `posAnchor`. The same clamp sits in `posParts`
   (grid.js:159), native `TransportReadout.position` (:36),
   `SongNotes.bar(atTick:)` (:27) and `RollOverlays.anchorTick` (:17).
   The plan lists these as "route through the helpers"; each clamp has to
   go as well, or bar 0 never shows anywhere.
6. **§4 Score "measure 0 is engraved short (the proportional width the
   model already gives a sparse bar)".** The web score is uniform-width:
   `mw = m.bt * ppt` (src/render/score.js:235, :462), origins
   `mi * m.bt * ppt` (:431, :444, :450, :473, :491), measure canvases cut
   to `mw` (:237–238), `first/last` from `S.view.x / mw` (:466–467, :536).
   There is no proportional width to lean on; a short measure 0 is a
   layout change (an origin function per measure and a width per measure).
   Native `ScoreModel` places measures at `mi * bt` the same way
   (ScoreModel.swift:116–121); its view layout was not checked and the
   builder must look before claiming it is free there either.
7. **§2.1 B's decisive argument** ("an old build turns `chop: pickup` into
   a plain text note") is true (rollnotes.js:539 regex, song.js:112) but
   no longer separates B from E: §3.6 bumps the version, so an old build
   locks the file and never writes it back, for either candidate. E still
   wins — on reading plainly in the file and on "Chop says remove" — but
   the plan should say that, not rest on a forward-compat edge that the
   lock removes. Same for E's own "older builds keep it whole (opaque)":
   true but moot under the lock.
8. **§3.3 Insert/Delete bars "work from `barStartTick(at)`".**
   `openGapShift`/`closeGap` (src/model/selection.js:439, :481) already take
   a tick; the bar→tick arithmetic is in their callers (the Edit menu
   sheets and `askBarsValidate`, src/ask/tools.js:470–481, which bounds
   `at_bar` to 1…N+1). Correct intent, wrong site — the callers change.

### Risks the plan misses

- **R1 — Re-expressed synced annotations do not survive a reload before
  Publish (web).** `saveLocalNotes` stores only `n.added` notes
  (src/model/edits.js:88–96). `reframeAnchors` (like `shiftAnchors` and
  `convertAnchors` today) rewrites synced notes in memory only. Reload
  before Publish: the published file comes back in the OLD frame
  (song.js:308–311), the local pickup entry merges in (song.js:334,
  `mergeLocalAdditions` rollnotes.js:793) and every synced annotation shows
  `T` early — the plan's own definition of the corruption. Marking them
  `added` does not help by itself: `mergeLocalAdditions` dedups by
  `(b1, q1, text)` (:820), so the new-frame twin would stand BESIDE the
  old-frame published one; and `tombstone()` ignores added notes
  (edits.js), while `noteIdentity` changes with the frame. §3.5's "the
  same way a chop add already does" describes a hole the chop has today,
  not a mechanism. Test 15 as written (publish, then reload) would pass
  while the real failure (reload WITHOUT publishing) goes untested.
- **R2 — "The song start" for a meter, key or tempo moves to `T`.** The
  editor writes a changed meter at `[1,1]` (note-editor.js:1616
  `b1: tsChanged ? 1 : b1`; native AnnotationEditing.swift:607
  `at = (changed ? 1 : b1 …)`). In the pickup frame `[1,1]` is tick `T`, so
  `bakeMeter` (rollnotes.js:916–927, via versions.js:344–345) writes the
  declared meter at `T` in the published .mid after the file's own at 0 —
  which contradicts Q4's "published .mid unchanged" — and a key placed "at
  the start" leaves bar 0 unkeyed (score spelling, LCD key, `keyRegions`
  song.js:215). Ask's `add_annotation {bar:1, beat:1}` for a meter does the
  same.
- **R3 — Chop + pickup as specified moves bar 1 to different music.** A
  pickup is a LENGTH, so a start chop at `C < T` that "leaves `pickup`
  alone" keeps `T = P·qt` measured from the NEW tick 0: the bar-1 line now
  sits `C` later in the music than the downbeat he marked, while every
  other anchor was converted through absolute time. The downbeat is a
  place in the music like any other anchor and must convert with them.
  Removing a chop has the mirror problem (and can push `P'` past one bar).
- **R4 — Chord ends and anchors computed from ticks.** `setEndUnits`
  (rollnotes.js:652–662: `Math.max(qt, tick)`, `Math.floor(tick / bt) + 1`)
  and the `setAnchorBQ` hook are what every drag, paste, Insert bars,
  `stampChordBand` and Ask `until` path use to turn a tick into
  `[bar, beat]`/`until`; none can produce bar 0. Routing only the
  `(b − 1)·bt` sites through `barStartTick` leaves these writing bar ≥ 1
  for music before `T`.
- **R5 — Loop target in bar 0.** `loop: 0.4` (loop back to the pickup) is
  the natural loop on a song with a pickup; the loop text regex accepts 0,
  but `loopTo` (song.js:141 `(+lm[1] − 1) · bt`) and the editor's `nlb`
  (note-editor.js:1619 `Math.max(1, …)`) do not, and `shiftAnchors`'s
  `conv` rewrites loop text without ever yielding 0. Decide it (default
  below) rather than leave it to fall out.
- **R6 — Load order.** `resolveNote` runs on the published list before
  `finalizeNotes` sees the pickup (song.js:311), exactly the "old menu bug"
  the meter had; `finalizeNotesImpl` must set `S.declaredPickup` before the
  chop block (song.js:102–123) and re-resolve every note. `resolveNoteWith`
  (rollnotes.js:874, used for NOT-open songs by versions.js:344) has no
  pickup input and must derive it from the list it is given.
- **R7 — Version lock vs. the pickup riding as `opaque`.** With the bump,
  a 3-reader never writes a pickup file, so the opaque path is never
  exercised for `pickup` — fine. But native `shiftAnchors` skips opaque
  entries (AnnotationEditing.swift:488) while the web moves them
  (rollnotes.js:939 skips only chop + song-level; noteToJSONBase :489–491
  re-reads opaque anchors). `reframeAnchors` must pick one rule on both
  sides (default: move them, as the web does, since an opaque entry is a
  thing at a place) and the shared fixture should hold one opaque entry.
- **R8 — Native editor plumbing.** `AnnotationEditing.typeID`/`typeOf`
  (AnnotationEditing.swift:18–35) return nil for an unknown kind — the All
  notes row for a pickup could not open or delete it; `isDirective` (:467)
  and `isSongLevel` (:466) must list it, and `GoToBarSheet`'s
  `TransportReadout.jump` clamps to `max(1, …)` (TransportReadout.swift:185).
- **R9 — Learning mode.** Nothing in the plan detects or proposes a pickup;
  good. Two places to pin with a test rather than trust: the editor prefill
  comes from the cursor only (a cursor at tick 0 → refuse "put the cursor on
  the first full bar's downbeat", never a guess), and the Ask system prompt
  clause lands in `RULE_LEARNING` and `RULE_NORMAL` both (context.js:98) —
  Normal mode may estimate later, but this plan ships no estimate anywhere.
  The recording sheet's existing "a pickup?" line (voice-menu.js:846) is
  about his own take's beat map and stays, as the plan says.
- **R10 — Count-in with a fractional pickup (Q3).** `beats + (beats − P)`
  clicks is not a whole number for `P = 1.5`. Clicks fall on whole counted
  beats only: one full bar, then a click on every whole beat of bar 0 that
  precedes the pickup (`floor(beats − P)` of them); `playT0` still moves by
  the exact `(beats + (beats − P)) · beatSec`.
- **R11 — Ask sites the plan's list leaves out.** context.js:357 and :365
  (cursor and "at" labels), :189 and :273 (two more `b0/b1` row loops) and
  :294 (the "as sent earlier" run label) all print `floor(t / bt) + 1`.
  `askBarsCount` (tools.js:468) becomes `ceil((songEnd − T) / bt)`.
- **R12 — Undo and tombstones.** `annoSnapshot` (edits.js:69) restores
  anchors and `added` flags; if R1's fix writes tombstones, undo must
  remove them too (tombstones live in localStorage, outside the snapshot).
  The default fix below avoids tombstones for this reason.

### Required changes (each for the builder to follow)

- **C1 (fixes error 2).** In web `jsonToRawNote` replace `b1: +at[0] || 1`
  with a finite-number check that keeps 0 (`Number.isFinite(+at[0]) ?
  +at[0] : 1`), and the `until` guard `+j.until[0] >= 1` with `>= 0`; in
  native `Rollnotes.raw` keep `b1 == 0` (only NaN → 1) and change `ub >= 1`
  to `ub >= 0`. Add to the shared fixture a chord at `[0,4]` with
  `until: [0, 4.5]` (a half-beat chord inside the pickup) and assert both
  parse and write it byte for byte. The schema's `anchor` minimum becomes
  0 for `at`, `to` and `until` alike (docs/annotations-v2.schema.json:62).
- **C2 (fixes R1).** Make `reframeAnchors(list, oldT, newT)` a pure
  function over a list (native already shapes `shiftAnchors` this way,
  AnnotationEditing.swift:481). Then in `mergeLocalAdditions` (and
  `annotationsFor`, which calls it for not-open songs): read the pickup the
  LOCAL store carries (or its absence) and the pickup the published list
  carries; when they differ, `reframeAnchors(published, T_pub, T_local)`
  BEFORE the `(b1, q1, text)` dedup, so the published layer is in the
  local frame when the two lists meet and every twin matches. The local
  pickup entry replaces the published one (as the study/songnote branches
  at :798–819 do), never stands beside it. Nothing new goes in the local
  store, so undo needs no tombstone handling. Test 15 becomes: set a pickup
  on a list with synced notes, reload from the OLD published file + the
  local store WITHOUT publishing → the in-memory list equals the
  pre-reload list to the tick and has no duplicates; then publish, reload →
  identical again. (The chop and meter have this hole today; fixing them
  with the same call is a one-line follow-up — queue it in open-items, do
  not widen this plan.)
- **C3 (fixes R2, keeps Q4 true).** Define "the song start" for a
  directive as tick 0 = `barBeatAt(0)` (= `[0, beats − P + 1]` with a
  pickup, `[1,1]` without). The meter save paths (note-editor.js:1616,
  AnnotationEditing.swift:607, Ask's meter kind) write the changed meter at
  that anchor; `convertAnchors` leaves `bakeMeter`/`bakeTempos` alone. The
  editor's prefill for a new key/tempo/meter when the cursor is at tick 0
  shows that anchor. Test: pickup set, then meter declared → the tsdir's
  `start` is 0 and `bakeMeter` yields one event at tick 0.
- **C4 (fixes R3).** A start chop added or removed converts the pickup
  through absolute time like every anchor: new `P' = (T − delta_display) /
  qt` where `delta` is the chop's shift. If `P'` falls to ≤ 0 the pickup is
  removed; if it exceeds one bar it is removed too; either case is named
  in the chop's two-tap warning ("… and the pickup is removed: bar 1 would
  start before the chop / more than a bar in"). The chop directive itself
  stays raw and never passes through `barStartTick` (song.js:112–123 reads
  it with `(b1 − 1)·barTicks()` — leave that). Test 7 changes from "leaves
  the pickup alone" to "keeps the bar-1 line on the same music".
- **C5 (fixes R4, error 5).** Put the frame in the two tick→bar/beat
  writers, not only the readers: `setEndUnits` and the `setAnchorBQ` hook
  body use `barAtTick`/`barStartTick` (signed floor division, no
  `Math.max(0, …)` on the tick), and `posCount`/`posAnchor`/`posParts`,
  native `TransportReadout.count/position`, `SongNotes.bar(atTick:)`,
  `RollOverlays.anchorTick`, `AllNotes.posAnchorText` drop their clamps
  and take `T`. One test per writer: `setEndUnits` on a tick inside bar 0
  yields `until: [0, q]`; `posAnchorText` of `[0,4]` reads "bar 0 beat 4".
- **C6 (fixes error 6).** Score: give the model a `measureStart(mi)` and
  `measureTicks(mi)` (measure 0 = `[0, T)`, else `bt`), and route every
  `mi * m.bt` / `mw` site in score.js (:235, :431–450, :462–491, :535–536)
  and the cache key through them; `nMeasures = 1 + ceil((lastTick − T) /
  bt − 0.05)` when a pickup exists; the intro column sits left of measure
  0. Native `ScoreModel`/`ScoreView`/`ScoreRuler` the same. Browser-verify
  the score (Brave) before pushing step 4 — the no-unseen-layout rule.
- **C7 (fixes error 4).** Move every "newer version locks" fixture to 5:
  tests/night-roll.test.mjs:13847, :18109; NightRollCoreTests.swift:163;
  EditInPlaceTests.swift:184; docs/annotations-v2.md:328 → "A v5 fixture".
  Add the pickup fixture to the two shared-fixture tests (error 3), not
  to a new tool.
- **C8 (fixes R5).** Default: a loop may return to bar 0. `loopTo`
  (song.js:141) goes through `barStartTick`; the editor's `nlb` and
  `mkBars` (note-editor.js:165) offer bar 0 when a pickup exists; the loop
  text rewrite in `reframeAnchors` may emit `loop: 0.4`. Say so in Help.
- **C9 (fixes R6).** `finalizeNotesImpl`: derive `S.declaredPickup` from
  the list first (last `n.pickup` wins, as `dedupedNotesWithIndex` will
  keep it), then the meter, then the chop, then re-resolve all. Give
  `resolveNoteWith` a fourth argument `pickupBeats` and a helper
  `declaredPickupOf(list)` that versions.js:344 passes.
- **C10 (fixes R7, R8).** `reframeAnchors` moves opaque entries on both
  sides (native: drop the `n.opaque != nil` skip for THIS function only;
  leave `shiftAnchors`' behaviour and note the divergence in NIGHT-ROLL.md).
  Native: `typeID`/`typeOf`/`isDirective`/`isSongLevel` list `pickup`;
  `TransportReadout.jump` lower bound 0 when a pickup exists.
- **C11 (R9, R10, R11).** Add the test "a cursor at tick 0 → the Pickup
  type refuses with the plain message, writes nothing"; put the Ask clause
  in both rule blocks; count-in per R10; add context.js:189, :273, :294,
  :357, :365 to the routed sites. The two-tap count `N` excludes
  song-level entries and the pickup itself (as the chop's `others` does).
- **C12 (plan text).** Rewrite §1's version paragraph and line numbers
  against pedal-1177; state in §0 that the branch is the base; rewrite
  §2.1 B/E per error 7; replace "tools/rollnotes-golden.mjs" with the
  shared-fixture test pair.

### QUESTIONS defaults

Q1, Q3 (with R10's whole-beat wording), Q5, Q6, Q7 stand. Q2 stands, with
C4's consequence spelled out: a chop that leaves more than a bar before
the downbeat removes the pickup, said in the warning. Q4 stands only with
C3 — without it the meter-after-pickup path changes the published .mid.
