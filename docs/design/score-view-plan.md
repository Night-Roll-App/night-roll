# Score View Plan — sheet music in Night Roll

**Status: SHIPPED.** Built overnight 2026-07-30, reviewed and committed
2026-07-31, then extended the same evening: track-colored beams/ties/rests,
intro clef column, smooth playhead that hops signature glyphs, key-discovery
system (default C, live dial, `key:` rollnotes directives incl. ranged keys
with cancellation naturals), lasso chord ID, notes manager, type-first
editor. Tier 1 (pre-rendered MuseScore) was never needed.

## What was built (tier 2, live)

- **𝄞 Score / ▦ Roll toggle** in the header (choice persists). Same timeline,
  same ruler/sections/markers/cursor/subtitles/playhead — the score is an
  alternative rendering where measure width is proportional to time.
- VexFlow vendored (no CDN); engraving computed in-browser from the parsed
  MIDI: 16th-grid quantization, chord grouping, rhythm spelling with dots,
  ties and gap-filling rests, beaming, accidentals vs. the key signature.
- One staff per non-drum track in the track's color; clef by range; key
  signature read from the (now fixed) MIDI metadata, with an in-browser
  Krumhansl fallback for loaded files.
- **Tap a notehead** → inspector + preview; tap empty staff → cursor moves;
  cursor draggable; + Note anchors as in roll view. Playhead follows the
  engraved note positions (piecewise map — the self-made ".spos").
- Per-measure render cache (LRU 60) — Battle's 529 measures scroll fine.
- All 24 catalog songs engrave without errors (verified programmatically).

## Also done en route

- Every MIDI now carries its true key signature (tools/fix_keysigs.py:
  Krumhansl + bass weighting + loop-cadence bonus; analysis-known keys
  pinned: Overworld G, Cornelia D, both compositions). Battle = G minor.
- Fixed a corrupt-file bug: ff1battle.mid declares wrong track lengths; both
  parsers now find tracks by MTrk scan. Battle went from 1 visible track to
  its full 5; ff1ship.mid (truncated) now partially recovers instead of
  crashing.

## Fixes after Josh's 2026-07-31 iPad report

- Beams / ties / rests now take the track color (were default light gray).
- Bar 1 un-cramped: clef + key + time moved to a dedicated intro column
  that sits left of bar 1 (scroll to the very start to see it).
- Score playhead uses time-linear motion (smooth like the roll) instead of
  following engraved glyph spacing (which stuttered).
- iPad pinch overhauled: true 2-D pinch distance (vertical/diagonal pinches
  now work), page-level Safari zoom suppressed (was hiding the footer),
  lifting one finger hands off smoothly to a pan. **Needs a real-device
  test — desktop can't simulate iPad gestures.**

## Added 2026-07-31 (second batch, same uncommitted tree)

- **Mute = hide.** Muting a track now removes it visually too — roll notes
  gone, score staff gone (score rebuilds on toggle). Advanced variants
  (dim-but-visible, audio-only mute) deferred until wanted.
- **Lasso mode** (footer ⊞ Lasso toggle): one-finger drag selects notes
  instead of panning — a pitch-range box in the roll, a staff/time box in
  the score. Selected notes outline gold; the footer lists the pitch names
  low→high (spelled per the song's key). The chord name hides behind a
  **Chord?** button so Josh names it first. Identifier knows triads, 6ths,
  7ths, 9ths, sus, dim7, power dyads ("G5"), inversions as slash chords
  ("D/F#"), and tolerates a missing 5th ("C7 (no 5th)").

## Known limitations (v1)

1. Chromatic spelling is a static heuristic (#1/#4/#5 sharp, b3/b7 flat
   relative to the key). Gets Overworld's G# and Bb right; spells the
   Baseball song's Ab as G#. Context-aware spelling is a future pass.
2. Ties across barlines aren't drawn (the notes are correct; the arc is
   missing). Within-measure ties work.
3. No triplets — everything quantizes to the 16th grid.
4. Live-played (unquantized) MIDIs engrave messily; quantize in Logic first.
5. Drum tracks are audio-only — no percussion staff.
6. Muting a track doesn't gray its staff (audio-only, like the roll's dim).
7. Playhead is time-accurate but may not sit exactly on a notehead when the
   engraver compressed spacing inside a measure.

## Decision rule (kept for reference)

Tier 1 never happened; if the live view proves inadequate, MuseScore
pre-renders remain an option for print-quality pages.

Goal: read the songs as engraved notation in Night Roll, not just piano roll —
without losing playback, the cursor, or rollnotes.

## Tier 1 — pre-rendered scores (do first, ~an evening)

Batch-render all 22 MIDIs to SVG with MuseScore's CLI on the Mac, commit the
renders, add a Score/Roll toggle to the player.

- MuseScore also exports a **position map** (.spos/.mpos: beat segment ↔ x,y on
  the page — what musescore.com uses for playback highlighting). This gives us:
  - playhead sweeping the score during playback (beat resolution)
  - tap the score → cursor moves to that beat → Play from there
  - **+ Note works from the score view** — rollnotes anchor to beats, not
    noteheads, so the full bedtime annotation loop is covered
- Audio is untouched: playback always comes from the MIDI data, NES voices.
- Known limits (permanent for this tier):
  - no tap-a-notehead inspector (SVG doesn't know which ink is which note)
  - no pencil editing on the score; pencil-added roll notes don't render on it
  - engraving quirks likely (FF1 MIDIs all claim C major in metadata — key
    signatures may need forcing per song)

## Tier 2 — live engraving (long-term, multi-session, only if tier 1 chafes)

VexFlow vendored into the repo (no CDN at runtime); engrave from the parsed
MIDI in the browser. Full interactivity: tap noteheads for the inspector,
score reflects edits, layout control (solo a staff, transpose display).

- Hard part is not drawing — it's MIDI→notation decisions: rhythm spelling
  (dots/ties), voice separation, enharmonic spelling from an undeclared key.
- In our favor: NES tracks are monophonic and grid-quantized (best case).
  Live-played files (KeyChangeTest) need quantization or they engrave badly.
- Tier 1's beat↔position plumbing carries over.

## Decision rule

Build tier 1, live with it. Start tier 2 when actual annoyance — wanting to
touch the notes themselves on the score — shows up repeatedly, not before.

## Open questions for tomorrow

1. Does MuseScore install/run headless cleanly on the Mac (`brew install musescore`)?
2. Force correct key signatures per song at render time, or accept C-major spelling?
3. Score view on iPad: page-based or one long horizontal strip?
4. Where do renders live — `scores/` directory, one SVG per song (multi-page)?
