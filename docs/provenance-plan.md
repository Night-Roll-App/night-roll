# Song origins, one rule table, one publish function, annotations v2 — plan (2026-09-30)

Advisor plan (full report in the session log); Josh checks the rule table
(open-items Q4, Q6–Q9) before anything is rewritten.

## Origins
composition (made in Night Roll) · copy (Save As; records `from`) ·
import (a MIDI file brought in; its own labels kept in `source`) ·
capture (game pipeline, FF1 included) · starter (bundled pieces).
Where a song lives (not saved / local copy / published) stays separate.

## Rule table (advisor's recommendation)
- composition / copy: edit notes + tracks; mix annotations; tempo notes
  BAKE into the .mid; key/meter never into the .mid; publish writes .mid +
  annotations; Save Version / Move / Save As / Rename.
- import: same as copy (Q6); the file's own labels written back verbatim.
- capture: notes/tracks locked (Save As makes an editable copy); mix
  annotations yes; tempo notes record only (never baked); publish writes
  annotations only (the .mid once, at capture commit); re-capture via the
  tool behind the notes-identical gate.
- starter: like capture, no re-capture, never writes the .mid.
Josh's alternative (Q4): "your copy is yours" — captures editable in place,
tempo bakes, a re-capture restores.

## Bugs found on the way (fix in P0–P2 regardless)
- Publish all ignores deleted-annotation tombstones (re-publishes deleted
  notes) and writes the un-baked tempo map; skips recordings, README,
  iPad Files mirror.
- Unpublished capture drafts in console folders pass syncable()/dirtySongs()
  (only albums/imports/ was excluded) → annotations can publish before the .mid.
- A tempo note on an Untitled song doesn't play until Save.
- musicSig ignores tempo, so a tempo-only change never republishes the .mid.
- Tempo baking ratchets: a removed tempo note's baked event never goes away.
- Three copies of the "editable?" test disagree (link mode, compare, local/).
- tools/nsf/meter_audit.mjs, tools/loop_target_bass.mjs read the legacy text
  grammar; tools/nsf/dump-all.mjs writes a stale path.

## Build phases
P0 characterization tests · P1 originOf + RULES + one editable test (+ the
syncable fix) · P2 one publishSong (bakeTempos pure, annotationsFor with
tombstones, markPublished, tempo in dirty) · P3 v2 reader + version guard
(refuse to publish a newer-version file) + schema, then an iPad build before
P4 · P4 stored origin + v2 writer · P5 batch migration (Josh: format
conversion isn't editing — no per-song approval) · P6 tools + docs.
Anchors stay [bar, beat] (readable, diffable; re-bar conversion exists).
