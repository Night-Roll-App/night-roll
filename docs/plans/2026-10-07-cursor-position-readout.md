# Cursor position readout: bar, beat, subdivision (advisor, 2026-10-07)

Josh, Terminal #175: "It would be cool to have a way To see where the cursor
is at. Like the exact location in number,subdivision etc. I can currently only
see bar and beat. But I'm not sure the best way to present it. Please review
other daws in an advisor"

Research only. No app code was changed. Source tags: `[doc]` means confirmed
in the product's own manual or support pages this session, and `[recall]`
means general knowledge that wasn't re-checked.

---

## 1. What other tools do

| Tool | Format at the playhead | Where | Type to jump? | Subdivision chosen by |
|---|---|---|---|---|
| Logic Pro (Mac) | `bar beat division tick`, e.g. `4 2 3 120`. Division default 1/16, 240 ticks per division (3840 per whole note) `[doc]` | LCD in the control bar; time (h:m:s:f) on the other row `[doc]` | Yes: double-click a field, or drag it `[doc]` | A **Division** field under the time signature (1/16 by default) `[doc]` |
| Logic Pro for iPad | Bars and beats on the LCD's top line; Position menu: Beats, Time, or Beats & Time `[doc]` | Control-bar LCD, next to tempo, key and meter (the layout Night Roll's LCD copies) `[doc]` | Tap the LCD to get a ruler you swipe. A position can be pasted in (2.1) `[doc]` | Not shown on the compact LCD `[doc]` |
| GarageBand for iPad | **No numeric readout.** The ruler shows bars and beats, and you drag the playhead or double-tap the ruler `[doc]` | Ruler only | No | n/a |
| Ableton Live | `bars.beats.sixteenths`, e.g. `4.2.3` `[doc]` | Arrangement Position fields in the control bar `[doc]` | Yes: click and type, drag up/down, or use the arrow keys `[doc]` | Always 16ths. The grid doesn't change it `[doc]` |
| Cubase | `bars.beats.16ths.ticks`, 120 ticks per 16th by default `[doc]` | Primary and secondary time displays on the Transport, plus the Info Line for the selected event `[doc]` | Yes, on the Info Line and the display `[doc]` | MIDI Display Resolution preference `[doc]` |
| Studio One | `bar.beat.16th.tick`, 100 ticks per 16th (0–99) `[doc]` | Transport, with a second ruler in seconds `[doc]` | Yes `[recall]` | Fixed 16ths `[doc]` |
| Bitwig | `bar.beat.tick.%`, e.g. `1.3.4.50` = bar 1, beat 3, 4th 16th, halfway to the next one `[doc]` | Transport | Yes `[recall]` | A "tick" setting: 8, 12, 16, 24, 32 or 48 (triplet values included) `[doc]` |
| FL Studio | `B:S:T` (bar : step : tick), 4 steps per beat, ticks from the project PPQ (96 default) `[doc]` | Toolbar song-position panel. Click to switch to M:S:CS `[doc]` | Limited `[recall]` | Steps per beat in Project Settings `[doc]` |
| Pro Tools | `bar| beat| tick`, e.g. `4| 2| 480`, 960 ticks per quarter. No 16ths field `[recall]` | Main and sub counters | Yes, type into the counter `[recall]` | n/a (ticks only) `[recall]` |
| Reaper | `measure.beat.hundredths`, e.g. `7.1.00` or `1.3.50` (halfway through beat 3) `[doc]` | Transport, a big clock, and the MIDI editor's event fields `[doc]` | Yes `[recall]` | Always a decimal fraction of the beat `[doc]` |
| MuseScore 4 | Status bar: "Measure N, Beat B" for the selection. The playback counter shows measures/beats and elapsed time `[doc]` | Status bar (bottom left) and the playback toolbar `[doc]` | Go-to-measure only `[recall]` | Beat shown as a fraction where needed `[recall]` |
| Dorico | Status bar shows the **bar number** of the selection. The caret shows the rhythmic grid value, and ruler marks above the staff show beat divisions `[doc]`. Users have asked for beat/tick in the status bar, which it doesn't have `[doc]` | Status bar and caret | Go to bar `[recall]` | The rhythmic grid (status bar) `[doc]` |
| Renoise (tracker) | Pattern + **line number**. Position *is* the row, and LPB (lines per beat, default 4) sets the resolution `[doc]` | Pattern editor row numbers, highlighted every beat `[doc]` | Jump to row `[recall]` | LPB (lines per beat) `[doc]` |

**Takeaways**

1. Almost every desktop DAW shows **bar . beat . 16th . fine remainder**. The
   only real differences are the remainder's unit (ticks out of 120, 240 or
   100, a percent like Bitwig, or hundredths of a beat like Reaper) and
   whether the division can be set.
2. The fine remainder is shown in **file-independent units** (Logic 240 per
   division, Studio One 100, Bitwig %). FL and Pro Tools are the exceptions
   and expose raw PPQ ticks.
3. iPad apps stay coarse. GarageBand shows no number at all, and Logic for
   iPad shows bars and beats with a menu to change the format. Touch apps
   jump through the ruler or a paste, not a numeric keypad.
4. Notation apps (MuseScore, Dorico) show bar and beat for the selection, not
   ticks.
5. The subdivision usually comes from a setting (Logic's Division, Bitwig's
   tick, Renoise's LPB). Only Ableton and Studio One fix it at 16ths, and
   nobody switches it automatically as you zoom.

---

## 2. Night Roll today: six notations for one spot

Example spot: **bar 4, beat 2, the "&"** (halfway through beat 2).

| Where | Code | Shows | Notation |
|---|---|---|---|
| Transport LCD | `updateLCD`, src/ui/chrome.js:1134 | `4` (bar) and `2` (beat). Both are floored, so the "&" is invisible | bar, beat (integers) |
| Status line on a note tap | `noteLabel`/`beatLabel`, src/input/gestures.js:169 | `bar 4 beat 2&` | e/&/a syllables, falling back to `beat.toFixed(2)`, e.g. `beat 2.33` for a triplet |
| Clip, Drummer and Bassist messages | `fmtBarBeat`, src/gen/drummer.js:217 | `4.2.5` | bar.beat-decimal, beat rounded to 2 places |
| Annotation list and study sheet | src/ui/notes.js:465, src/ui/study-sheet.js:219 | `bar 4.2.5` | bar.beat-decimal (the stored `b1`/`q1`, quarter steps via `snapBeat`) |
| Analysis/sheet list | src/ui/sheets.js:1096 | `[4.2.5]` | the same, bracketed |
| Annotation editor pickers | src/ui/note-editor.js:162 | bar ▾, beat ▾, then `· e & a` ▾ | syllable picker |
| Ask context | `askViewCursorLine`, src/ask/context.js:349 | `cursor: bar 4 beat 2.5` | decimal beat |
| Go to bar sheet | `barJumpGo`, src/input/gestures.js:527 | `bar 4` | bar only |

**Inconsistencies that matter**

- The one place that shows *where the cursor is* (the LCD) is the only one
  that drops the subdivision.
- **The dotted forms collide with DAW notation.** Night Roll's `4.2.5` means
  "bar 4, beat 2½". In Ableton, Studio One, Bitwig or Logic, `4.2.3` means
  "bar 4, beat 2, third 16th", which is the same spot. If the LCD adopts
  DAW-style dotted numbers while the annotation list keeps `4.2.5`, the same
  spot reads two different ways with the same punctuation. Whatever Josh
  picks, the LCD must not use `a.b.c` dots unless the text readouts change
  with it.
- `beatLabel`'s fallback (`2.33`, `4.39`) appears only for off-grid positions
  (triplets, scrubbed or captured timing), so the same readout switches
  between syllables and decimals.
- **"Beat" is the meter's denominator note** (`beatTicks()` = ppq·4/den, so
  eighths in 6/8). That means e/&/a in 6/8 are 32nds. This is consistent with
  the anchors (`[1.4]` = the fourth eighth) and with the Ask prompt. It's a
  fact of the declared meter, so showing it tells Josh nothing he didn't
  declare. An undeclared song uses the neutral 4/4 ruler ("4/4?").
- **Ticks are per file.** `S.song.ppq` comes from the MIDI and differs between
  captures and his compositions. A raw tick number would change scale from
  song to song, which is why DAWs normalize.
- **Where the cursor can be.** A strip tap is beat-snapped, a ruler drag snaps
  to 16ths, and scrubbing and playback can be anywhere. So the subdivision is
  mostly visible while dragging, while playing, and when a note is picked.

---

## 3. Options

All three keep the LCD's bar cell tappable for Go to bar, and none of them
show a key, chord or meter verdict. Position is a fact.

### A. A DAW counter: bar | beat | 16th, plus a small remainder

Add a third LCD cell labelled **16th** (1–4). Below it, in small type, show
**how far into that 16th** as a percent, only when the position isn't on a
16th (Bitwig's unit, which doesn't depend on the file).

- On the "&" of beat 2 in bar 4: `4 | 2 | 3`
- On the second note of an eighth-note triplet on beat 2: `4 | 2 | 2` with
  `+33%` underneath
- Bar 4 downbeat: `4 | 1 | 1`

For: this is what Logic, Ableton, Cubase, Studio One and Bitwig do, so it
transfers to any DAW Josh opens. It's exact and the same for every file.
Against: "16th 3" is DAW-speak for what Josh calls "the &". It adds a cell to
a transport row that's already full on iPad. In 6/8 the cell counts 32nds,
because the beat is an eighth.

### B. Count it: the beat cell says "2&" (my pick)

Keep two cells. The **beat** cell shows the counted syllable, the same words
the note status line (`beatLabel`) and the annotation editor's `· e & a`
picker already use. When the position isn't on a 16th, a small second line
shows the remainder as a percent of the 16th, the same as A.

- On the "&" of beat 2 in bar 4: `4 | 2&`
- On the "e": `4 | 2e`. On the downbeat: `4 | 2`
- Second note of an eighth-note triplet: `4 | 2e` with `+33%` underneath
- While playing, the cell ticks `1 1e 1& 1a 2 …` like counting aloud.

Text readouts would then use the same words: `fmtBarBeat` and the Ask cursor
line become `bar 4 beat 2&`, and `beatLabel`'s `.toFixed(2)` fallback becomes
`2e +33%`. The annotation list's `4.2.5` can stay because it's the stored
anchor form, or it could follow in a later step. That's Josh's choice, and
it's listed in §5.

For: it's how Josh counts, and he asked for the e/&/a picker split himself
(2026-08-18). It's one vocabulary across the LCD, the status line and the
editor. It needs no new LCD width and no taps. It gives exact positions that
are still facts. Against: it isn't the DAW digit format, so `2&` won't match
Logic's `2 3`. Triplets only show through the `+33%` tail.

### C. Switchable format (A or B, plus time)

Tap the beat cell to cycle through **count** (B), **DAW** (A), and **time**
(`1:23.450`, the m:ss readout listed as not built in docs/daw-inventory.md
row 7). The choice is a device-local preference in localStorage, which is
allowed for UI toggles. This is Logic iPad's Position menu, FL's click to
switch, and Cubase's primary/secondary displays.

- Count: `4 | 2&`. DAW: `4 | 2 | 3`. Time: `0:07.500`

For: it covers both mental models, and time helps when lining up audio clips.
Against: three formats to explain in the help sheet. A one-time tap is cheap,
but an accidental tap on iPad changes the readout with no warning, and the
beat cell has no tap behavior today.

---

## 4. Recommendation

**Build B.** It's the smallest change: one formatter, the existing LCD cell,
zero taps. It uses words Josh already counts in, and it makes the app's
position text agree with itself, which today it doesn't in six places. Leave
C's time format for later, because nothing here needs it yet. If Josh later
works across DAWs and wants their digits, C can add A as an alternate face of
the same cell without changing anything else.

Implementation notes for the builder (not a spec):

- One pure formatter in `model/grid.js`, for example `posParts(t)` returning
  `{bar, beat, syl, pct}`. `syl` is one of `"" "e" "&" "a"` and is the 16th
  within the displayed beat. `pct` (0–99) is how far into that 16th, and is
  omitted when 0. `updateLCD`, `beatLabel`/`noteLabel`, `fmtBarBeat` and
  `askViewCursorLine` all read it. A cache key on `syl` + `pct` keeps the DOM
  writes cheap while playing.
- Round to the nearest tick before splitting, so a captured note 1 tick early
  doesn't read `1a +99%` (use a ±1-tick tolerance, the same idea as
  `beatLabel`'s `0.03`).
- The beat cell gets a fixed min-width (wide enough for `4&` and a small
  `+33%` line) so the LCD doesn't jitter as syllables change. Check the iPad
  width the LCD has today (the transport row and the "resize loops" memory).
- Shipping checklist: help sheet LCD entry, `build_help`, a FEATURES drift
  keyword, an Ask registry action or "not applicable" (the Ask *context*
  cursor line changes, so its wording is the parity), and a NIGHT-ROLL.md
  note on the formatter. Tests: `posParts` at the downbeat, e, &, a, a
  triplet, 6/8, and odd-ppq files.

---

## 5. Questions for Josh (plain words)

1. **How should the LCD show where you are?**
   - "Count it": `4 | 2&` (my pick)
   - DAW numbers: `4 | 2 | 3`
   - Either one, switchable by tapping the beat cell
2. **Should the annotation list switch to the same wording?** Today it says
   `bar 4.2.5`. With the change it would say `bar 4 beat 2&`. This changes
   display only. The saved files don't change either way.
3. **Off-grid spots:** is `2e +33%` clear enough, or do you want the tail
   hidden unless you've picked a note?
