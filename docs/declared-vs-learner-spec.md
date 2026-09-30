# The file's own labels vs the learner's answers — build spec (advisor, 2026-09-30)

Josh (08:41): a learner's key/meter must never overwrite what an imported file
declared; keep both; an ON-DEMAND check compares them.

## True today (index.html as of 1a57ac60)
- The learner's key:/timesig: annotations never reach the .mid (writeMidi emits
  only song.timesig/keysig). Tempo: annotations ARE baked in on his own songs
  (ruled 2026-08-15) — but publishDraftSong uses baseTempos while
  commitCompositionNow uses the baked map: two publish paths, two tempo maps
  (a ruling for Josh).
- Import DROPS the file's key label (drafts copy timesig, not keysig; also
  missing in openDraftDoc, draftDoc, forkCurrentSong, publishDraftSong,
  commitImports). A file that changes meter keeps only its LAST meter, and
  the published copy writes that one from bar 1.
- Leak: notesTxtFor / notesTxtForDoc put the file's meter in notes.txt's
  header even in Learning.
- Rule break: seedImportAnnotations writes key:/timesig: in Normal without a tap.
- Lost from foreign files entirely (phase 2): text/copyright/instrument/lyrics/
  marker/cue metas, extra track names, empty tracks (conductor name),
  SysEx, program changes, channel pressure, pitch bend, all CCs but 10/70,
  mid-song pan changes; foreign CC70 / poly aftertouch misread as chip data.

## Phase 1 build
1. parseMidi collects timesigs[] (every 0x58) and keysigs[] (every 0x59) in
   file order; timesig = FIRST 0x58 (default [4,4]); keysig = first 0x59;
   reads a conductor Text meta `source:file`; returns `source` = {timesigs,
   keysigs} when opts.foreign or the marker is present, else null.
2. Imports (localMidiOpen, midcreate batch) parse with {trust, foreign}; store
   `source` in the draft (NOT for captures, ~16130).
3. Carry `source` through draftDoc, openDraftDoc, forkCurrentSong,
   publishDraftSong, commitImports, setSong (pushVersion stores the raw draft).
4. writeMidi AND tools/nsf/midi-write.mjs writeSongMidi: when s.source exists,
   write 0x58/0x59 verbatim from source at their ticks (none if the file had
   none), a conductor Text `source:file` at tick 0, ignore s.timesig/keysig;
   otherwise byte-identical to today.
5. Remove the Normal auto-seed (seedImportAnnotations).
6. Pure checkKeyVsFile() / checkMeterVsFile() next to estimateKey: his answer
   (declared only — never the estimate) vs the source at the same tick;
   states match | differs | partial-match | noanswer | nofile; a keypartial
   compares tonic only; no 0x58 in the file = nofile for meter.
7. ☰ Notes: a "Check vs file" button in the KEY and METER group headers, on
   EVERY song (seeing it reveals nothing); result in #notelistStatus:
   - match: "Your key matches the file's own label."
   - differs: "The file's label says something else — labels can be wrong
     (many programs write C major / 4/4 by default). Listen again, or keep yours."
   - partial-match: "Matches the file's label for part of the song — labels can be wrong."
   - partial key: "Your tonic matches the file's label; add the mode to check the whole key."
   - noanswer: "Set your key first — this compares your answer with the file's own label."
   - nofile: "This song's file carries no key label of its own — nothing to
     compare (game captures and songs made here never do)."
   (meter: same lines.) LEARNING: never the file's value, never estimateKey.
   NORMAL adds "The file says: D major." + "Estimate from the notes: …" (key)
   + a "Use the file's" button (key: the keysetest path; meter: openEditor
   (null, "timesig") prefilled → the existing re-bar warning).
8. Leaks: notesTxtFor / notesTxtForDoc use HIS declared meter (open song:
   declaredTs; else ff1roll-ts-<key> or his timesig: annotation); none →
   "4/4? (not declared)" and bar by 4/4. askContext never reads song.source
   in Learning.
9. Docs: help entry "Check vs file" (+ FEATURES keyword, build_help),
   NIGHT-ROLL.md (P2 paragraph rewritten; source record; `source:file`),
   WEB-SESSION.md (notes.txt meter = his declared meter), open-items.

## Tests (vm)
- parseMidi: 3/4 @0, 4/4 @bar 5, 0x59 D, 0x59 Em @bar 9 → lists in order, timesig [3,4].
- Import round trip: draft.source = the file's lists; add key: Gm + timesig: 6/8;
  writeMidi(draftDoc) → parseMidi: lists identical, no Gm 0x59, source:file present;
  Save Version + go back keeps source.
- No 0x58/0x59 in the file → none written; source present with empty lists.
- No source (capture / made here) → byte-identical to today; extend the
  writeMidi/writeSongMidi parity test with a source case.
- Replace the P2 seed test: import writes NO ff1roll-notes-* in either mode.
- check* functions: one case per state.
- Learning: status text never contains the file's key name or meter digits;
  estimateKey spy = 0 calls after both buttons.
- Normal: text includes the file's value and the estimate; "Use the file's"
  writes only when tapped.
- The button appears the same on a sourced song and a capture.
- notesTxtFor in Learning with source 3/4 and no annotation: header lacks "3/4".

## Phase 2 (queue; don't bundle)
Keep the rest of a foreign file verbatim (per-track raw metas: markers,
lyrics, text, copyright, instrument names, extra track names, conductor name,
programs, other CCs, pitch bend, SysEx) and write them back verbatim from
both writers; stop reading CC70 / 0xA0 as chip data for foreign files.
Markers = the composer's own sections: never shown in Learning; a later
"Check sections vs file markers" follows the same pattern.
