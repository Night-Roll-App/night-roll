# Plan: chip-music sets with more than one file (found by the GB Tetris investigation)

Status: draft → Fable review → Fable build. Evidence: docs/investigations/2026-10-04-gb-tetris-korobeiniki.md.

## Bug (generic, not Tetris-specific)
A rip pack can hold several chip files (Zophar GB Tetris: DMG-TRA-0.gbs v1.0 + DMG-TRA-1.gbs v1.1, 18 m3u lines). src/import/hub.js openPickedFiles imports only nsfs[0] and applies ALL m3u lines to it; parseM3u drops each line's file prefix, so titles collide (last write wins) and the second file is never captured or archived. One vault per album (src/import/capture.js ~L177) makes a second file impossible to hold today.

## Fix
1. parseM3u keeps the `file` part of each line; titles apply only to the matching chip file (by filename, case-insensitive).
2. Albums may reference more than one vault: album.json `nsf.tracks[slug].vault` optional per-track override (default = `nsf.vault`); every reader (capture, chip render/preview, album-order, archive upload, package, tools/import-set.mjs, tests) honours it. Schema stays backward-compatible (no rewrite of existing albums).
3. openPickedFiles / import-set.mjs: every chip file in the set is captured; tracks are slugged from their own m3u titles; both files archived (archive upload per file).
4. Guard + warning: a set with >1 chip file and no m3u lists each file's tracks separately (no silent merge).
No per-game tables (CLAUDE.md capture-engine rule).

## Tetris repair (data, after the code lands; Josh's annotated tracks untouched)
- Re-run the import for the Zophar pack (in /Users/joshuacough/.claude/jobs/c9506483/tmp/archive-compare/tetris-zophar/unz/) into albums/game-boy/tetris/ with the fixed importer, as a dry run first: the existing 17 v1.0 tracks keep their slugs/files (the two annotated ones byte-identical — verify), the mislabelled n=2 track gets its true title "A-Type Music (version 1.0)" (slug rename via the app's own rename path so rollnotes/keys follow; if it has annotations, it doesn't — verify), and the v1.1 tracks that differ from v1.0 (at least A-Type = Korobeiniki) are added with vault DMG-TRA-1.gbs.
- Output lands on the builder's branch; the main session archives the new .gbs and publishes.

## Tests
m3u fixture (tests/fixtures/m3u/game-boy-tetris) → parse with file prefixes; title mapping per file; multi-vault album round trip (capture → album.json → render path resolves the right vault); import-set dry run on the fixture set; old single-vault albums unchanged (snapshot a few album.json files).

## Verify
npm test, smoke, package.mjs, check.mjs; the interval search finds Korobeiniki in the new Tetris track; main session: play it in the app (web + iPad).
