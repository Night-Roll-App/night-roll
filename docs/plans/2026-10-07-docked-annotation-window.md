# Docked annotation window that follows the selection (advisor, 2026-10-07)

Josh, Terminal #244 (voice, cleaned only for "cord"=chord, "safe"=Save,
"front/NZ bar"=from/end bar): "if I click on an existing annotation it should
bring it up in that window and if I highlight over that chord it should bring
it up … what if I highlight multiple chords … what I really want to be able to
do is highlight new sections that don't have a chord and have it be cleared
except it would update the from bar and end bar based on where my ruler is
selected and then I can put in a new chord and press Save … then when I select
a new ruler area it would then update things in the window … so I don't have
to keep popping the window up … we might want an advisor to double check all
the rules around this window being open."

Terminal #245: "when the app reopened the new annotation window was not open
and it's supposed to reopen with my previous window configuration."

Research only; no app code changed. Tags: `[doc]` = read on the vendor's own
pages this session (sometimes via the search engine's quote of them),
`[recall]` = general knowledge, not checked again. `[code]` = read in this
repo today.

---

## 0. What the code does today `[code]`

- `#noteeditor` is `makeWindow("noteeditor", {dockable: true})`
  (src/ui/wm.js L794) with **no** `S.wmOpeners` entry, so `wmRestoreOpen`
  skips it on relaunch (the cause of #245).
- `openEditor(note, presetType, opts)` (src/ui/note-editor.js L369) fills
  from/to from `S.rangeSel` for a new entry. Type: `presetType`, else a span
  > 2 bars = section (#160), else `localStorage "ff1roll-dragtype"` (the last
  type **saved**). With a span it focuses `#nchordsym` or `#ntext` after 50 ms,
  **which raises the iPad keyboard**. Section focuses `#nsectlabel`.
- **Save** (`#nsave`) pushes the annotation, sets `S.rangeSel = null`, and
  **closes the window** (`editor.classList.remove("on")`). Delete closes it too.
- **Save and Delete push no undo step**, except for a song note (L867). Every
  other annotation path does push one: band-edge drag, the Ask tools, the
  analysis adopt, the study sheet. So today an editor Save can't be undone.
  This matters more once he is saving span after span.
- `dropSupersededBy` replaces a chord only on the **exact same span**. Saving
  a chord over part of an existing chord gives you two overlapping bands in
  separate lanes.
- Band tap (`tap()`, src/input/gestures.js L838): a single tap reads out, sets
  `rangeSel` to the band (only if View › Display › Ruler highlight is on) and
  moves the cursor. A **double-tap** opens the editor. Band taps work while
  playing. A double-tap on any other flag (text note/tempo/meter/loop) opens
  it, but only while stopped.
- `rangeSel` changes in four ways: a ruler drag (L1375), a stretch by an edge,
  a slide by the middle, and a band tap. It is also cleared four ways: a
  double-tap on the span, a tap outside a parked span, Esc, and turning off
  Ruler highlight. It is **restored per song on load** (session/song.js L388).
- Esc: wm.js L981 closes the topmost `.overlay.on`, **docked ones included**.
  The global Esc in chrome.js L2020 clears `rangeSel`, but only when focus
  isn't in a field.
- Floating = a modal overlay with a backdrop, so the roll can't be touched
  while it's up. Docked = no backdrop (`.overlay.docked`, css/app.css L1027).
- `S.rollnotesReadOnly` (a newer-format lock) and `LINK_SONGS` (someone
  else's song) refuse every edit. A **notes-locked capture** is neither of
  these: annotations are editable there.

## 1. What other tools do

| Tool | Follows selection? | Many selected | Commit model |
|---|---|---|---|
| Logic Pro Event List, Link = Content | Shows the contents of the region selected in the focused window `[doc]` | "always shows the events of the last selected region (also when selecting multiple regions via Shift-click)" `[doc]` | Edits apply at once, with undo `[recall]` |
| Logic Pro Region Inspector | Shows the selected region's parameters `[recall]` | Changes apply to all selected regions, and differing values show as mixed `[recall]` | Live, with undo `[recall]` |
| MuseScore 4 Properties | Shows whatever is selected; with nothing selected it shows score-wide settings `[doc]` | Shows settings for a mixed selection, and edits affect "only the object(s) you have selected" `[doc]` | Live `[recall]` (the handbook doesn't say) |
| Dorico Properties panel | Context-sensitive to the selection `[doc]` (forum and tutorial quotes) | Shows only the properties the selected items share `[doc]` | Live, with undo `[recall]` |

What we can take from them:
1. A panel that follows selection is the normal pattern. It never pops up and
   never steals the keyboard; you click into it when you want to type `[recall]`.
2. With several items selected, they either show the last one (Logic) or the
   common properties (Dorico, MuseScore). **None of them makes a new item from
   a multi-selection.**
3. They all commit live. Josh asked for an explicit **Save**, and he should
   keep it. A chord built from chips passes through wrong states (C, then Cm,
   then Cm7), so committing live would write half-built chords to his song.
   Keeping Save means we need the unsaved-draft rule in §3.

## 2. The rule set (recommended)

The window has two **modes**, decided only by where it is:
- **Docked → follow mode.** Everything in this section applies.
- **Floating → today's pop-up, unchanged.** It opens on demand, Save closes
  it, and the backdrop covers the roll. You can't select in the ruler under a
  modal, so following makes no sense there. The one exception: rule R10
  (undo) applies in both modes.

The window always shows one of five **states**:

| State | Shows | Save button |
|---|---|---|
| **Idle** | "Select bars in the ruler, or tap a chord or section." The type chips stay visible and can be tapped (to pre-pick). Fields are blank. | disabled |
| **New** | Blank entry. From/end are filled from the span. The type is the last type saved. The chord chips and symbol are empty. | Save (adds) |
| **Editing** | The existing annotation's fields, plus Delete | Save (updates) |
| **Several** | "3 chords in this span:" with one tappable row per chord (`G · bar 4–5`) | disabled |
| **Read-only** | The reason (someone else's song, or a newer-format lock). The fields are visible but greyed. | disabled |

### R1. Tapping an existing band (chord/section lane)
A single tap loads it → **Editing**. Docked, he doesn't need a double-tap.
The existing tap behaviour still happens: readout, cursor, and highlight when
the switch is on.
*Example:* the window is docked and he taps the "G7" band at bars 9–10. The
window shows G7, from 9 beat 1, end 11 beat 1, and Delete. No keyboard comes up.

Double-tapping a text note, tempo, meter, loop or key flag still loads it
(same gesture as today), but now into the docked window.

### R2. A ruler span over **one** chord (of the window's current type)
→ **Editing**, if the span **matches** that chord (both edges within one beat)
or sits **inside** it. "Over a chord" counts only annotations of the type the
window is working in (chord or section). In a chord run, a section band above
doesn't make bars "taken."
*Example:* he drags bars 9–10 exactly, or just bar 9, under G7 (9–10). G7 loads.

### R3. A span over **several** chords, or one chord that only **partly** overlaps
→ **Several.** It lists each chord it touches, in bar order. Tapping a row
loads that chord (Editing) and moves the highlight to it. The list also has one
button: **"New chord over the whole span anyway"** (→ New). It is never
automatic, because saving would make overlapping bands.
*Example:* he drags 9–14 over G7 (9–10) and C (11–12). The window lists
"G7 · bar 9–10" and "C · bar 11–12". Bars 13–14 are empty, so he can drag
just 13–14 for a fresh entry.

### R4. A span over empty bars (nothing of this type)
→ **New.** From and end come from the span. Type = the last type saved, so
peeking at a section in the middle of a chord run doesn't flip the run.
Nothing comes from the music: no chord guessed, no symbol, no root lit.
**No field gets focus** (see R11).
*Example:* he saved "C" at 11–12 and drags 13–14. The window shows Chord,
from 13 beat 1, end 15 beat 1, and empty chips. He taps G, then 7, then Save.

The #160 rule (a span over 2 bars opens as a section) applies only when the
window's last Save in this session wasn't a chord. Once he is in a chord run,
a 3-bar chord stays a chord.

### R5. Save
- Add (New) or replace (Editing). This is the same write as today, plus
  **one undo step** (see R10).
- **The window stays open.** It shows "Saved G7 · bar 13–14" in the status
  line and goes to **Idle** for the next span.
- The span is **not** cleared. `rangeSel = null` after Save is dropped in
  docked mode, so he sees where he just wrote. The next drag replaces it.
  Without the change, the window would keep showing the chord it just saved
  (R2) and he'd stay at Idle with no readout.
- The type is remembered for the next New (this already happens through
  `ff1roll-dragtype`).
- The next span does **not** default to anything. The window waits for him.
  (Auto-advancing to the next bars is open question Q3.)
- Return in the symbol box = Save. This is unchanged.

### R6. The selection moves while there are unsaved changes
"Unsaved" means the fields differ from what they were loaded or blank-filled
with. A change only to from/end made **by the span itself** doesn't count.

- **A New draft, and the span moves to other empty bars:** the draft carries
  over and from/end follow the span. Fixing the span after building the chord
  is the same job, so it must not lose the chord.
  *Example:* he builds "Am" and then notices the span should end at bar 6, not
  5. He stretches the edge, and the window still shows Am with end = 6.
- **Any other move with unsaved changes** (the draft is left for an existing
  chord, or he was editing one and taps elsewhere): the window **holds** and
  shows one inline strip: "Unsaved Am (bar 4–5) — **Save** · **Discard**".
  It is not a dialog and not `appConfirm`, and the roll stays live. Either tap
  then loads the new selection. If he ignores the strip and selects again, the
  strip stays put and the newest selection is the one that loads afterwards.
- It never auto-saves.

### R7. The selection goes away (span cleared: double-tap, Esc, switch off)
No unsaved changes → **Idle**. Unsaved changes → the draft stays, and from/end
keep their last values. Clearing the span isn't a request to throw away work.

### R8. Cancel / ✕ / Esc
- **Docked:** the Cancel button reads **Clear**. It drops the draft and goes
  back to whatever the current selection says (R1–R4) or Idle. ✕ closes the
  window and keeps its dock (today's `wmCloseWindow`). Unsaved changes on ✕
  get the same inline strip as R6.
  **Esc never closes a docked editor.** wm.js L981's topmost-overlay Esc must
  skip `.docked`. With focus in a field, Esc blurs the field (which drops the
  keyboard). With focus elsewhere, today's global Esc clears the span.
- **Floating:** unchanged (Cancel/✕/Esc/backdrop close it).

### R9. Delete
It is undoable (R10). Docked, the window stays open and goes to Idle with
"Deleted G7 · bar 9–10".

### R10. Undo (both modes)
- Every editor Save and Delete pushes `{kind: "anno", json: before}`. This is
  **missing today** for everything except song notes, so it is a fix that
  should ship first, on its own.
- After undo or redo, a docked window re-reads the current selection (R1–R4).
  An Editing state whose annotation has disappeared goes to New or Idle,
  never to a ghost.
- ⌘Z with focus in the symbol/text box is the browser's own text undo. This is
  unchanged (the global key handler already skips inputs).

### R11. Keyboard focus (the iPad keyboard)
- Docked: **no state change ever focuses a field** (R1–R4, Save, Clear, undo).
  The chips are the way in. Typing starts only when he taps the symbol box or
  text box.
- `openEditor`'s `setTimeout(…focus(), 50)` and the section/note/song
  auto-focus stay **floating-only**.
- When the window moves to another state, it blurs any field inside itself, so
  a keyboard that was up for the previous chord goes down.

### R12. Notes-locked songs (captures)
No difference: annotations are editable, which matches today. Only
`rollnotesReadOnly` and `LINK_SONGS` give **Read-only**. That state follows
the selection too, so he can still read what's there.

### R13. Ruler highlight switch OFF
Band taps don't set `rangeSel`, but R1 still loads the tapped band. The window
follows **the band he tapped**, not the highlight. Ruler drags still make a
span (the switch only governs band taps), so R2–R4 work unchanged.

### R14. Notes lane vs bands
- Tapping a **note** in the roll doesn't change the window. Notes aren't
  annotations, and tapping notes to *hear* them while deciding on a chord is
  the core loop.
- A **lasso that reaches into the ruler** (`S.lassoAnno`) counts as a
  selection: one annotation → Editing, several → Several, none → no change.
- Tracks view and Score view: same rules (the ruler and band lanes are shared).

### R15. Playback running
Selection rules apply the same way while playing. The window **never follows
the playhead**, and a cycle that loops doesn't change it. Save while playing
doesn't stop or seek. Sliding the cycle (the "mid" drag) is a selection move,
so R6 applies: a New draft follows the cycle.

### R16. Song change
The window stays docked. No unsaved changes → Idle (or loads that song's
restored span by R1–R4). Unsaved changes → discard. A chord belongs to its
song's bars and can't carry across. The status line says "Unsaved Am on
<old title> was dropped" so the loss is never silent.

### R17. Relaunch (Terminal #245)
- Register `S.wmOpeners.noteeditor` with an opener that shows the window in
  **Idle**: no `openEditor(null)` call, no focus, no keyboard.
- `wmRestoreOpen` already runs "after the first song is in". If that song's
  span was restored, the window evaluates it right away (R2–R4), but it
  **still focuses nothing**.
- If it was **floating** at quit, it does not come back. A modal with a
  backdrop appearing on launch would block the roll. Only a docked one
  returns. The wm.js L794 comment then becomes "docked only."

### R18. Other ways in, while docked
**+ Note**, a ☰ Notes row, a study-sheet row, the LCD's key/meter/tempo
segments: all of these load into the docked window instead of floating a
copy. They follow R6 if a draft is unsaved. **+ Note** with no span → New at
the cursor, as today.

## 3. Edge cases to test

1. A span of exactly one 16th (a 16th chord, #154): end = start + a 16th,
   kept through Save.
2. The span starts in the middle of a chord and ends in empty bars → Several
   (one row) plus "New … anyway".
3. Two chords on the **exact** same span (old data): Several, two rows.
4. Saving New over a span someone else already filled since it loaded (Ask
   added a chord there): Save replaces on an exact-span match through
   `dropSupersededBy`; otherwise it adds, as today.
5. A meter or chop change while docked re-bars the song: the window re-reads
   the selection, and a New draft's from/end come from the span's ticks again.
6. A band-edge drag on the chord that is being edited: from/end in the window
   follow live, with no strip (it is that annotation's own edit).
7. A phone-width resize floats every docked window (wm.js L873): it becomes
   the floating pop-up. A draft that's in progress stays, and Save then
   closes, as floating does.
8. Docked inside a side **tab group** with Mixer/AI: a selection change does
   **not** bring the annotation tab forward. It updates in the background, so
   a span tap never hides the AI chat.
9. Learning mode: no state ever shows an Analyze-layer estimate or a chord
   name he didn't write. Several lists only his own annotations
   (`visibleNotes()`).
10. Time signature / chop types: their two-tap re-bar warning still needs the
    second Save, and `S.rebarArmed` resets when the selection moves.
11. 🎤 dictation running when the selection moves: stop it (`micStop(true)`)
    before loading anything else. A late result must not land in the next
    chord's note.
12. The Ask tool: a new `act` action isn't needed if the window's behaviour is
    UI-only. But `select_span` (actions.js L119) moving `rangeSel` must go
    through the same "selection changed" hook so the docked window follows
    it too.

**Implementation note:** one function, `editorFollowSelection()`, called from
every `rangeSel` writer and from band/flag taps, lasso finalize, undo/redo and
song load. It makes the R1–R4 decision. That beats sprinkling the checks into
each gesture. The writers are listed in §0.

## 4. Questions for Josh (each has my default)

**Q1. You built a chord but didn't press Save, then you selected somewhere
else. What should happen?**
- (a) A small bar in the window: "Unsaved Am — Save · Discard". You tap one.
- (b) It saves Am automatically.
- (c) It quietly throws Am away.

*Default: (a).* One extra tap only on the times you forget. Nothing is ever
saved behind your back or lost. If the move is just fixing the span of a new
chord (stretching its end), nothing pops up; the chord simply follows.

**Q2. When the window loads a new empty span, should the chord box be ready
for typing?**
- (a) No. You tap chips, or tap the box when you want to type. The iPad
  keyboard never comes up by itself.
- (b) Yes, it's always ready (the keyboard comes up on every span).

*Default: (a).* You've said the keyboard popping up unasked is a problem.

**Q3. After you press Save, what should the next span be?**
- (a) Nothing. You drag the next span yourself.
- (b) A **Next ›** button in the window that selects the same number of bars
  right after the one you just saved, so a run of 2-bar chords is: tap chips,
  Save, Next, tap chips, Save, Next…

*Default: (a) now, with (b) as a small follow-up if you want it.* (b) saves a
drag per chord, but it guesses your rhythm, and chords often change length.
