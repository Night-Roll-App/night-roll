# Song origins, one rule table, one publish function, annotations v2 — plan (2026-09-30)

Advisor plan (full report in the session log); Josh checks the rule table
(open-items Q4, Q6–Q9) before anything is rewritten.

## Origins
composition (made in Night Roll) · copy (Save As; records `from`) ·
import (a MIDI file brought in; its own labels kept in `source`) ·
capture (game pipeline, FF1 included) · starter (bundled pieces).
Where a song lives (not saved / local copy / published) stays separate.

## Rule table (advisor's recommendation — Josh's rulings 2026-09-30 Q4/Q6/Q9, AS BUILT in P1: see RULES in index.html)
- composition / copy: edit notes + tracks; mix annotations; tempo notes
  BAKE into the .mid; **meter also bakes (Q9 changed the original "never" —
  key still never bakes)**; publish writes .mid + annotations; Save Version
  / Move / Save As / Rename.
- import: same as copy (Q6) — tempo AND meter bake same as copy; the file's
  own OTHER labels (key signature, any raw leftovers) written back verbatim.
- capture: notes/tracks locked ("✎ Make it mine" makes an editable copy,
  not Save As's form); mix annotations yes; tempo/meter notes record only
  (never baked); publish writes annotations only (the .mid once, at capture
  commit); re-capture via the tool behind the notes-identical gate.
- starter: like capture, no re-capture, never writes the .mid.
Josh's alternative (Q4, "your copy is yours" — captures editable in place,
tempo bakes, a re-capture restores) was NOT taken; see the addendum below,
which was.

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
  FIXED in P1: `updateEditBtnVis`'s `editable` and `askContext`'s `own` now
  call `editableSong()` (which already had both guards) instead of their own
  `isComposition()||isLocalDraft()||songKey===null`.
- tools/nsf/meter_audit.mjs, tools/loop_target_bass.mjs read the legacy text
  grammar; tools/nsf/dump-all.mjs writes a stale path. (Not touched by P1 —
  still open.)
- Found while building P1's "Make it mine": `forkCurrentSong` (Save As)
  called `saveDraft()` at the end, but `saveDraft`'s `isComposition()` gate
  requires an EXISTING draft — a brand-new own-folder key has none, so the
  very first fork silently wrote nothing and the copy was never actually
  editable. Fixed with an explicit `draftWrite(key, draftDoc(false))` first
  (same bootstrap `editHereNow`/"✎ Edit locally" already needed). Affects
  every Save As, not just Make it mine.

## Build phases
P0 characterization tests · **P1 DONE (2026-09-30): originOf + RULES + one
editable test (canEditMusic/editableSong) + the syncable fix (already done
in P0/P2) + "✎ Make it mine" + meter baking (Q9)** — see NIGHT-ROLL.md
"Origins, RULES, 'Make it mine', meter baking" and
tests/night-roll.test.mjs's "P1:" tests · P2 one publishSong (bakeTempos
pure, annotationsFor with tombstones, markPublished, tempo in dirty) — DONE
· P3 v2 reader + version guard (refuse to publish a newer-version file) +
schema, then an iPad build before P4 · P4 stored origin + v2 writer · P5
batch migration (Josh: format conversion isn't editing — no per-song
approval) · P6 tools + docs.
Anchors stay [bar, beat] (readable, diffable; re-bar conversion exists).

## Addendum (advisor, after Josh's "your copy is yours" idea) — TAKEN, built in P1
Recommendation: captures stay locked; the edit button on a capture/starter
becomes "✎ Make it mine" — makeItMine() = forkCurrentSong(title,
lastFolder || "my-covers") with no form, origin {kind: copy, fromKind:
capture}. Built as originOf() returning "copy" for the fork (fromKind isn't
stored yet — P4). Reasons against editing in place: edits would only sound on synth
(captures play chip audio); re-capture isn't a reliable undo (6 rips not on
the Mac; the pipeline changes — FFX); published captures are shared as "the
game's music"; a wrong note is a pipeline bug to fix at the source.
Migration (Josh ruled format conversion isn't editing): ONE batch of every
annotations file incl. compositions, via tools/migrate-rollnotes-v2.mjs
(harness-backed; round-trip deepEqual or refuse; --dry-run default; one
commit per album) — only after P3 (v2 reader + version guard) is on every
device incl. an iPad rebuild.
