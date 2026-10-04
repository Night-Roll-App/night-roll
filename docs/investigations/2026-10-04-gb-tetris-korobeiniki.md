# Game Boy › Tetris — where is Korobeiniki? (2026-10-04)

Investigation per docs/plans/2026-10-04-gb-tetris.md (Fable-reviewed). No
app code changed; nothing under albums/ touched; rips stayed outside the repo
(/Users/joshuacough/.claude/jobs/c9506483/tmp/archive-compare/, tmp/).

## Answer

The rip lacks it. Zophar's Game Boy Tetris pack is TWO .gbs files —
`DMG-TRA-0.gbs` (header "Tetris v1.0", 17 songs) and `DMG-TRA-1.gbs` (header
"Tetris", 17 songs, the v1.1 ROM). Our archive holds only the v1.0 file
(byte-identical to DMG-TRA-0.gbs). Korobeiniki is subsong 2 (n=2) of
`DMG-TRA-1.gbs`, pulse2, from the first note; no subsong of the v1.0 file
contains it. Not a capture bug — the capture engine reproduced every v1.0
subsong correctly (verified on the raw APU dump, not the published .mid).

Side finding: our album's "A-Type Music (version 1.1)" is mislabelled. That
.mid is subsong 2 of the v1.0 file, i.e. the v1.0 A-Type. The "(version
1.1)" title came from the one m3u line that names the OTHER file.

## Evidence

### Our rip, raw dump (G2)
- `node tools/gbs/dump.mjs <archive>/game-boy/tetris.gbs --bpm 150 --song N
  --seconds 90` for N = 0..19 (header says 17 songs, start song 1; 0 and
  18/19 probed for an index-base slip). Songs 18/19: 0 events. Song 0:
  22 notes on pulse1 (the driver wraps; its material matches song 5's).
- Interval search (E B C D C B A A C E → -5 +1 +2 -2 -1 -2 0 +3 +4; also with
  repeats collapsed; also the first six intervals only) over every channel of
  every .notes.txt: **no hit in any subsong 0–19 of the v1.0 file**.
- The search script was validated first against albums/nes/tetris/track-01
  (dump_notes copy in tmp/): hit at position 0 on track 1, as expected.
- Subsong 2 of the v1.0 file opens (pulse2) A4 B4 A4 G#4 A4 B4 C#5 D5 E5 F#5
  A5 … — not Korobeiniki's contour.
- Index base: `runGBS(gbs, songIndex1Based)` calls INIT with `song - 1`
  (tools/gbs/gbs.mjs:124); the m3u lines are 0-based and parseM3u adds 1
  (src/import/hub.js:149-152). Title 01 "Title" → GBS 0 → n=1 → the 39.6 s
  song with 427 events; "C-Type" → GBS 3 → n=4. Consistent; no slip.

### The standard rip (G1)
- Source: https://www.zophar.net/music/gameboy-gbs/tetris — "Original Music
  Files (14 KB)": https://fi.zophar.net/soundfiles/gameboy-gbs/tetris/Tetris%20%28EMU%29.zophar.zip
  (HTTP 200, content-length 15156; downloaded to archive-compare/, never the
  repo).
- Contents: 18 per-track .m3u (Latin-1) + `DMG-TRA-0.gbs` (6987 B, md5
  5ff6fddf…, == our tetris.gbs) + `DMG-TRA-1.gbs` (7120 B, md5 0e2535c6…).
- The m3u lines, `<file>::GBS,<0-based n>,<title> - Hirokazu Tanaka -
  <game> - ©1989-06-14 Nintendo,<len>` (tests/fixtures/m3u/game-boy-tetris
  is this exact text):

  | m3u | file | GBS n (0-based) | title | game field |
  |---|---|---|---|---|
  | 01 | DMG-TRA-0 | 0 | Title | Tetris v1.0 |
  | 02 | DMG-TRA-0 | 1 | A-Type Music (version 1.0) | Tetris v1.0 |
  | 03 | **DMG-TRA-1** | 1 | A-Type Music (version 1.1) | **Tetris v1.1** |
  | 04 | DMG-TRA-0 | 2 | B-Type Music | Tetris v1.0 |
  | 05 | DMG-TRA-0 | 3 | C-Type Music | Tetris v1.0 |
  | 06–18 | DMG-TRA-0 | 6,7,8,9,10,11,13,14,16,5,15,4,12 | jingles/endings/High Score | Tetris v1.0 |

- Headers (parseGBS): both 17 songs, start 1, v-blank 59.73 Hz; v1.0
  load/init $64E5 play $6553; v1.1 load/init $6465 play $64D3.
- Raw dump of DMG-TRA-1.gbs, N = 0..19, same search: **hit in subsong 2,
  pulse2, at position 0** (E5 B4 C5 D5 C5 B4 | A4 A4 C5 E5 D5 C5 | B4 …).
  Every other subsong's per-channel note counts equal the v1.0 dump's
  (same songs); only subsong 2 differs.

### Why the album says "(version 1.1)" and skips track 3
- src/import/hub.js openPickedFiles (L259-262): a picked set imports
  `nsfs[0]` — the first chip file — and hands ALL m3u lines to it. The line's
  own file name (`DMG-TRA-1.gbs::GBS,…`) is parsed away by parseM3u (regex
  starts at `::GBS`). So line 03 (n=2, from the other file) was applied to
  v1.0's row 2 after line 02, last write wins → "A-Type Music (version 1.1)".
  The import log (jobs tmp/logs/gb-tetris.log) shows it: "18 tracks listed
  of 17 slots", row 2 captured twice under the 1.1 title, "archive: 1 file
  to upload". `DMG-TRA-1.gbs` was in the zip and never captured or archived.
- tools/album-order.mjs numbers tracks by playlist position, keyed by n, so
  n=2 took the first position that named it (2) and position 3 was never
  assigned — hence `track` 1,2,4…18 in album.json.

### Sources on the versions
- TCRF, Tetris (Game Boy), via search summary: "The A-TYPE song in v1.0 is
  Minuet. v1.1 replaced it with Korobeiniki, which had previously been used
  in BPS' Famicom version"; v1.0 was a Japan-only Special Link Bundle release
  (~25,000 copies); the level-up sound also changed. (A direct WebFetch of
  the page returned unrelated content and was discarded.)
  https://tcrf.net/Tetris_(Game_Boy)
- VGMPF, Tetris (GB): A-Type = Korobeiniki; "1.0 release in which the Type-A
  music was an original composition". https://www.vgmpf.com/Wiki/index.php?title=Tetris_%28GB%29
  (The two sources disagree on what the v1.0 A-Type is; neither claim is
  asserted here — the notes are in tmp/tetris-dump/tetris-2.notes.txt for
  whoever wants to hear/read it.)
- Zophar track list (the MP3 pack) lists "A-Type Music (version 1.1)" as
  track 2 and no 1.0 entry: the same single-file reading our import made.

## Recommendation

1. **Add the v1.1 A-Type** (Korobeiniki) from `DMG-TRA-1.gbs`. One vault per
   album (src/import/capture.js:177 — `nsf.vault` is a single file), so a
   track from a second .gbs cannot join albums/game-boy/tetris/ without a
   schema change. Zero-code path: a second album, e.g. slug `tetris-v1-1`,
   title "Tetris (v1.1)", one track. Steps for the main session (Josh's OK
   first; publish-incrementally):
   ```
   mkdir -p /tmp/tetris-v11 && cd /Users/joshuacough/.claude/jobs/c9506483/tmp/archive-compare/tetris-zophar/unz
   cp DMG-TRA-1.gbs "03 A-Type Music (version 1.1).m3u" /tmp/tetris-v11/
   node tools/import-set.mjs /tmp/tetris-v11 --slug tetris-v1-1 --console game-boy --title "Tetris (v1.1)"            # dry run → ../sweep or --out
   node tools/import-set.mjs /tmp/tetris-v11 --slug tetris-v1-1 --console game-boy --title "Tetris (v1.1)" --publish  # archive upload via gh api
   ```
   The one m3u line names DMG-TRA-1.gbs::GBS,1 → n=2, title "A-Type Music
   (version 1.1)". Expect ~38.6 s, pulse2 melody, loop detection as the
   other Type tracks. Alternative if Josh wants it inside the existing
   album: per-track `vault` override in nsf.tracks (schema + chip.js L450 +
   import-set) — a design item, not this investigation's.
2. **Fix the mislabel** in albums/game-boy/tetris/album.json: the n=2 track
   is "A-Type Music (version 1.0)" (m3u 02). Title/slug only — the .mid and
   the two .rollnotes.json files are untouched by a rename of a track that
   carries no annotations (annotated: b-type-…-high-4-5-ending, high-score).
   Main session with Josh.
3. **Generic importer guard (queue, not done here — not a capture bug):**
   parseM3u should keep the `file` prefix; applyM3uNames/import-set should
   apply a line only when its file matches the loaded chip file (or when the
   line names no file), and openPickedFiles should say when a set holds more
   than one chip file ("2 .gbs picked; importing DMG-TRA-0.gbs — DMG-TRA-1.gbs
   not imported"). Test: tests/m3u-real.test.mjs already loads this fixture;
   assert rows 02 and 03 carry different `file` values. Applies to any
   multi-ROM Zophar pack, no per-game knowledge.
4. open-items: close the Korobeiniki question with this file; queue 2 and 3.

## Not done / out of scope
- No re-capture of the existing 17 tracks (nothing wrong with them).
- No app code, no test added: the plan's G3b condition (raw dump has it,
  .mid does not) is false.
