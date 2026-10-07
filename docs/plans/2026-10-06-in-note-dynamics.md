# Loudness inside a held note (advisor, 2026-10-06)

Question (open-items, "2026-10-06 Ask (shop) — in-note volume dynamics"):
how do other DAWs let you shape loudness *inside* one held note, and what
should Night Roll's version be? Motivating case: FF1 Shop, bars 25–28. Pulse2
plays one note per bar; the chip volume goes 8 at beat 1, up to 15 by beat
1.78, back to 8 by beat 2.67, then stays at 8 (#510 facts, from $4004).
Constraint (Josh): splitting the note into pieces with different velocities
is out, because each piece gets a new attack.

## 1. What Night Roll already has (the starting point)

- **Velocity**: one number per note, the loudness at the attack.
- **`ve`, the NES "decay target"**: one extra number per note, the level at
  its end. The synth ramps from velocity down to it (src/audio/voices.js
  ~L318). In the .mid it is a single polyphonic-aftertouch event (status 0xA0,
  "key pressure" for that pitch) at the note-on tick (tools/nsf/midi-write.mjs
  L55–57, src/midi/write.js L108, read back in src/midi/parse.js L132–138).
  It can only go **down**. The capture keeps only non-increasing writes
  (tools/nsf/notes.mjs L97), so Shop's swell up is thrown away. That is why
  the .mid is flat.
- **PS1 `n.gain`**: real breakpoints inside a note (`[{t, l}]`, ticks from the
  note's start), built by tools/psx/akao.mjs ~L519–532 and followed sample by
  sample in `renderSpu`. It exists **only inside the console render**. It is
  rebuilt from the AKAO data each time and never written to the .mid. So a
  PS1 track on an instrument voice is flat too.
- **Console voice**: a capture played on the chip replays every register
  write. Shop *already* swells in its default voice (#513). The gap is (1) a
  capture track on an instrument voice, (2) any of Josh's own songs.
- **Unknown CCs round-trip already**: parse.js puts any CC it doesn't own
  into `raw`, and write.js writes it back verbatim (phase 2). A CC11 lane in a
  file would survive today, but nothing would play it.

## 2. How other tools do it

There are two families. Either the loudness belongs to **the track over
time**, or it belongs to **the note itself**.

**Track over time (one curve for everything on the channel)**
- **Logic Pro**: region automation, or MIDI Draw in the Piano Roll
  (View → MIDI Draw → Expression). The usual practice: CC7 *Volume* is the
  mixer fader, set once. CC11 *Expression* is "how hard you're playing it"
  and moves all the time, scaled inside CC7.
  [logicprohelp CC1 vs CC7](https://www.logicprohelp.com/forums/topic/146823-cc1-vs-cc7-vs-automation/),
  [vi-control: is CC11 just volume?](https://vi-control.net/community/threads/is-cc-11-expression-just-volume.72676/),
  [Motifkit CC explainer](https://motifkit.com/midi-cc/)
- **Ableton Live**: clip envelopes, a breakpoint line under the clip for
  volume or any CC. Same idea: it belongs to time, not to a note.
  [Live 12 manual](https://www.ableton.com/en/live-manual/12/clip-envelopes/)
- **FL Studio**: channel volume in the Piano Roll's event editor, or
  automation clips. FL's *per-note* properties (velocity, pan, etc.) are one
  value per note. Only its slide notes move during a note, and only for
  pitch. [FL manual: piano roll](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll.htm)
- **Catch**: in MIDI 1.0 these are *channel* messages. On a chord, a swell
  swells every note together. Moving a note leaves the swell behind at its
  old time.

**The note itself (a little curve inside each note)**
- **Cubase Note Expression**: select a note and draw a volume (or pan, or
  pitch) curve inside it. The curve moves with the note. Steinberg notes
  that if it's sent as a plain MIDI CC, it still hits the whole channel.
  Only VST3 volume or poly pressure is truly per note.
  [Steinberg: mapping controllers](https://archive.steinberg.help/cubase_pro_artist/v9/en/cubase_nuendo/topics/note_expression/note_expression_controllers_mapping_c.html),
  [Steinberg forum: CC7 note expression hits later notes](https://forums.steinberg.net/t/note-expression-cc7-affects-volume-of-all-subsequent-notes-on-track/678355)
- **Bitwig**: every note carries **Gain**, Pan, Timbre, Pressure and
  micro-pitch, and each one "can be programmed like automation across the
  length of each note". Velocity is set only at the start. This is the
  closest match to what Josh described.
  [Bitwig user guide: note events](https://www.bitwig.com/userguide/latest/working_with_note_events/)
- **Ableton Live 11/12 MPE**: Note Expression tab with per-note Pressure,
  Slide and Pitch lanes. You draw breakpoints inside the note. "When a note is
  moved, its expression envelopes will move along with it", and they stretch
  when the note stretches. Pressure is stored as **polyphonic aftertouch**.
  [Ableton: Editing MPE](https://www.ableton.com/en/live-manual/12/editing-mpe/)
- **MIDI 2.0**: per-note controllers and per-note pitch bend on one
  channel. This is the standard catching up with Bitwig and Cubase. It isn't
  needed here. Poly aftertouch is the MIDI 1.0 per-note channel everyone
  already reads. [Wikipedia: MIDI 2.0](https://en.wikipedia.org/wiki/MIDI_2.0),
  [MIDI.org 2026 status](https://midi.org/the-state-of-midi-2-0-high-resolution-performance-and-the-rise-of-profiles-update-feb-2026)

**Chip trackers (how Shop was really made)**
- **FamiTracker**: two layers. The *instrument's volume sequence* is a list
  of 0–15 values, one per frame, started fresh by every note: a "macro".
  The *volume column* scales it per row. A swell inside one held note is
  either a sequence with an up-down shape or volume-column edits on later
  rows with no new note (no retrigger).
  [FamiTracker wiki: instruments](http://www.famitracker.com/wiki/index.php?title=Instrument_editor),
  [pattern editor](http://famitracker.com/wiki/index.php?title=Pattern_editor)
- **Furnace**: the same idea, generalised: "a macro automates a note's
  parameters while it plays". It can be a sequence, ADSR or LFO, with step
  length and delay.
  [Furnace docs: instruments](https://github.com/tildearrow/furnace/blob/master/doc/4-instrument/README.md)
- The NSF capture can't tell which of these the composer used. It only sees
  the result: the level at each frame. So whatever we store has to be able to
  hold "the level at each moment of this note". A named macro would be a guess.

## 3. Options for Night Roll

### (a) Expression lane per track (CC11), like Logic

*In plain words:* a second line under the roll for the whole track, meaning
"how hard the player is pushing right now" (0–127, multiplied onto every
sounding note).
*Example:* Shop pulse2 gets points at bar 25 beat 1 → 68, beat 1.78 → 127,
beat 2.67 → 68, repeated each bar.
- **Stored**: CC11 events in the .mid. This is the standard, so Logic and
  GarageBand would read it.
- **Capture**: notes.mjs logs $4004 per frame per channel, and midi-write
  emits CC11 where it changes. NES channels play one note at a time, so this
  is exact.
- **Playback**: a per-track GainNode with ramps from the CC points.
- **iPad edit**: a lane like the velocity lane, with tap to add a point and
  drag to move.
- **Ask**: `edit_expression {track, from_bar, to_bar, points | shape}`.
- **Round-trip**: CC11 already rides `raw`, so it would have to be promoted
  out of `raw` into an owned lane. Foreign files with CC11 would start
  sounding different, which is correct but is a change.
- **Weak spots**: it belongs to time, not the note. Copy bars 25–28 to bar 40
  and the notes come but the swell doesn't, unless the lane is copied too.
  On a chord every note swells together. It also overlaps velocity: is the
  attack level the velocity or the CC? Captures would carry the level twice.
- **Effort**: M–L. That means a new lane, a new gain node per track,
  copy/paste/move rules, and parse ownership.

### (b) Volume shape inside each note, like Bitwig gain / Ableton pressure ← recommended

*In plain words:* a note keeps its velocity as the attack. It can also carry
a few points saying "at this moment of the note, the level is X". The synth
glides between them on one sound, with no new attack. If you move or copy the
note, the shape goes with it.
*Example:* Shop bar 25 pulse2, one note: start 68 (velocity), +0.78 beat →
127, +1.67 beats → 68, then flat to the end. Four numbers.
- **Stored**: in the .mid, as polyphonic aftertouch on that note's pitch at
  the ticks *inside* the note. That is the same per-note message Ableton
  writes for MPE pressure, and the same family as today's `ve`. In memory it
  would be `n.env = [{t, l}]` (ticks from the note's start), the same shape
  as the PS1 `n.gain`. Back-compat rule: one aftertouch **at the note-on
  tick** still means today's `ve`, so files written so far parse exactly as
  now. Aftertouch at later ticks inside the note is the shape.
- **Capture**: NES: notes.mjs already watches $4004 every frame for the open
  note. Keep the whole series, not just the decreasing part, then thin it to
  the corners. Keep a point only where the slope changes, so a 2-frame
  staircase 8→15 becomes one line. Today's `ve` becomes the special case "one
  point, at the end, lower". PS1: makeMidi writes `n.gain` the same way, so
  the PS1 swells (Anxious Heart's pad) also reach the instrument voices.
  SNES and other chips later, by the same rule.
- **Playback**: voices.js already does `linearRampToValueAtTime` to `ve`. That
  becomes a ramp to each point in turn. bounce.js inherits it. Console voices
  are unchanged (they already replay the chip).
- **iPad edit (few taps)**: in the velocity lane (already under the roll),
  a note with a shape draws a line across its own width, as `ve` already
  does faintly. Edits:
  1. Select notes, then a **Shape ▾** chip with presets *Swell*, *Fade*,
     *Swell–fade*, *Flat (clear)*. One tap shapes every selected note,
     scaled to each note's length.
  2. Fine edit: drag a point up or down, tap the line to add a point,
     long-press a point to delete it. One undo per drag, through
     selEditApply, like velocity.
  Locked captures show the line and refuse edits, the same as velocity.
- **Ask**: `edit_notes {op:"shape", from_bar, to_bar, tracks, pitch?,
  shape:"swell"|"fade"|"swell_fade"|"flat", points?:[[beat, level]…]}`, plus
  the query tools (`at`, `span`) printing a note's points as facts.
- **Round-trip**: existing songs have no aftertouch after the note-on, so
  they keep the same bytes and sound the same. An older app reading a new file
  takes the *last* aftertouch as `ve`. That means a ramp to the final level:
  wrong in the middle, but harmless. Foreign files keep today's rule
  (aftertouch stays in `raw`, never read as volume).
- **Weak spots**: Logic shows poly aftertouch as "key pressure" in its
  event list, not as volume, so the swell is kept but not heard as a swell
  there. Overlapping notes of the *same pitch on the same track* can't be
  told apart, but that is already true for `ve`.
- **Effort**: M. That means parse/write (one more event type on an existing
  path), the voices.js ramp loop, the capture series plus thinning, the lane
  drawing, the presets chip, the Ask op, and help, tests and NIGHT-ROLL.

### (c) Named volume macro, like FamiTracker / Furnace

*In plain words:* define a shape once ("shop swell: 8 10 12 15 15 12 10 8 8 8…,
one step per frame"), then tag notes with it.
*Example:* a `macro:` annotation on pulse2 named *swell*, applied to the four
notes in bars 25–28.
- **Stored**: in annotations (the definition, plus which notes use it).
  Notes are referred to by bar, beat and pitch, so the reference breaks when
  a note moves. Other DAWs never see it.
- **Capture**: it would have to guess that four identical series are "one
  macro". That is guessing the composer's method, which the capture can't
  know.
- **Upside**: it's the chiptune composer's own mental model, and it's
  compact when one shape repeats 50 times.
- **Effort**: L, with fragile links.
- Better later as a *preset source* for (b): "save this note's shape as a
  preset" fills the Shape ▾ chip. The data still lives on each note.

## 4. Recommendation: (b), per-note shape

It matches Josh's own words ("a note has one velocity for its whole length",
no new attack). It is what Bitwig, Cubase and Ableton's MPE converged on. It
moves and copies with the note. It extends two things the app already has
(`ve` in the .mid, `n.gain` in the PS1 render) rather than adding a parallel
system. Keep (a) as a later, separate feature for *phrase* dynamics (a
crescendo over eight bars across many notes). Logic users do that with CC11,
and it doesn't conflict: CC11 multiplies the track, while the shape lives
inside the note.

### v1 scope

1. Data: `n.env` in memory. In the .mid, poly aftertouch inside the note
   (note-on-tick aftertouch keeps meaning `ve`). Parse/write tests for: an
   old file is the same bytes, a shaped note round-trips, a foreign file's
   aftertouch stays raw.
2. NES capture: full $4004 series per note, thinned to corners. Re-capture
   FF1 Shop and check that bars 25–28 carry the four-point swell (check the
   facts, then Josh listens with pulse2 on an instrument voice).
3. Playback: the voices.js ramp loop (default and organ voices, plus bounce).
   A note with no shape plays exactly as today.
4. Lane: draw the shape and drag its points. A Shape ▾ chip with Swell / Fade
   / Swell–fade / Flat for the selected notes.
5. Ask: `edit_notes op:"shape"`. The `at`/`span` tools report points.
6. Help sheet (Roll tab: touch first, then keyboard), HELP.md build, a
   FEATURES drift keyword ("Shape"), and a NIGHT-ROLL section next to "Volume
   inside a note".

Not in v1: writing PS1 `n.gain` into the .mid (step 2's twin, a small
follow-up), the CC11 track lane, saved custom presets, pan or tone shapes.

### Learning mode

No impact expected. A shape is performance data like velocity, the capture
side reports measured levels, and presets are tools Josh chooses. One guard:
Ask and the tools describe points as numbers. They don't name the gesture
for him (e.g. a musical term for a swell) unless he raises it. If he does,
it's a glossary "encountered" entry.

### Questions for Josh (for the open-items numbered list, if wanted)

- Preset names: "Swell / Fade / Swell–fade", or chip-style "Up / Down /
  Up-down"? (The wording is his call.)
- Should a shape's levels be absolute (0–127, like velocity), or relative to
  the note's velocity, so that changing velocity rescales the whole shape?
  Advisor lean: relative, so one velocity drag still moves the whole note.
