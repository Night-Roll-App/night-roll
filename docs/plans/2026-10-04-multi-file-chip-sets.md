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

## Review (Fable, 2026-10-04)

Every claim above checked against the code; verdicts, gaps and decisions.

### Claims — verified
- hub.js openPickedFiles imports `nsfs[0]` only and hands every m3u line to it (L259-262) — true.
- parseM3u's regex starts at `::(NSF|GBS)`, so the `file` part of a line is never read — true (hub.js L126; tools/album-order.mjs L69 carries a byte-for-byte mirror with the same gap).
- One vault per album: capture.js chipVaultMeta (L177) writes a single `nsf.vault`; chip.js chipSource (L442-450) fetches only `meta.nsf.vault`; the device record (IndexedDB `nsf` store, storage.js idbNsfPutNow) holds ONE `bytes` per slug — true, and the plan missed that the device record is a third holder of "one file per album" (not only album.json and the archive).
- "titles collide, last write wins": openChipImport builds one DOM row per m3u line but `S.nsfSess.rows[n]` is keyed by slot, so the second n=2 line overwrote the first row's handle; both job items captured slot 2 of the v1.0 file; the second capture overwrote the first draft under the 1.1 title — true (matches the import log the investigation quotes).

### Gaps the plan did not name (each is a decision below)
1. **Row identity is the chip slot, everywhere** — impCapture(n), chipTrackNo, applyM3uNames (`rows[n]`), captureJobStart, chipSource's session branch (`n: S.nsfSess.bytes ? n : 1`), import-set's log. Two files share slot numbers; a second key dimension is unavoidable.
2. **The device record** has one `bytes` per slug (gap above). A track from the second file must carry its own bytes in its track entry — the shape perFile sets already use — and chipSource must not read that as "perFile" (today `perFile = meta.perFile || !!tr.bytes` would then answer `n: 1`).
3. **Archive naming.** "vault DMG-TRA-1.gbs" (the plan's wording) would put a bare source name at the archive root — every Game Boy rip is `DMG-xxx`, so it collides across games and ignores the by-console layout (2026-09-29). A sibling slug (`tetris-2.gbs`) collides with a real album slug (Tetris 2 exists). Instruments folders are `<vault>.instruments/`, so the name must also stay unique there.
4. **commitImports uploads to the archive ROOT** (`vaultFile = slug + ext`, `slug + "/" + base + ext`, L620/L638/L686) while album.json's vault has carried the console folder since 2026-09-29 and every reader fetches that. tools/import-set.mjs uses `meta.vault` (correct). Any in-app publish since the reorg uploaded where no reader looks → other devices fell to synth. A pre-existing bug the plan's "archive upload honours it" line lands on; fixed here because the block is rewritten anyway; flagged in open-items for the main session to audit the archive root.
5. **album-order's "first position per n wins"** (tools/album-order.mjs L323): with two files, n=2 appears twice, so the v1.1 track could never get a position (or would steal v1.0's). Its parseM3u mirror also needs `file`.
6. **applyM3uToAlbum** (a playlist dropped later, hub.js L188) keys tracks by n alone — the same ambiguity.
7. **The m3u-real tests deepEqual whole rows** (`{n, title, len}`); a `file` field changes them — intended, the assertions are updated to include it.
8. **The "rename via the app's own rename path"** is wrong for this case: Rename… on a published song KEEPS the filename and writes a display override (help text, "a committed/repo song keeps its filename"). The repair needs the slug `a-type-music-version-1-1` freed for the real v1.1 music, so this is a repo-level move (git mv + album.json keys), not an app rename. The track carries no .rollnotes.json (only high-score and b-type-game-level-9-high-4-5-ending do — verified by listing), so nothing follows it except device-local state on Josh's devices keyed by the old path (see "Needs Josh").
9. **Manifest**: albums/manifest.json must be rebuilt (tools/build_manifest.mjs) after a track is added — missing from the plan.
10. **Not gaps (checked, nothing to do)**: tools/package.mjs ships only albums/starters and no vault list (the "chip file list" is runtime modules); sw.js caches same-origin only — vault fetches go to raw.githubusercontent and are never cached; the game-instrument library (voices.js gameVoices / instrumentsFolder) is album-level and keyed by `nsf.vault` — the second file's tracks render chip audio from their own bytes, and the album's instrument library stays the first file's (acceptable; a second file of the same game has the same driver).

### Decisions
- **Schema**: `nsf.tracks[slug].vault` (optional, a full archive path like `nsf.vault`), default `nsf.vault`. Nothing else changes; no existing album.json is rewritten.
- **Archive name of a non-first file**: `<console>/<slug>.<slugify(file base name)><ext>` — `game-boy/tetris.dmg-tra-1.gbs`. Dot-separated so it can never equal an album slug (slugs have no dots), unique under `instrumentsFolder` (`tetris.dmg-tra-1.gbs.instruments/`), deterministic on re-import. The FIRST chip file (by name, numeric order) stays the album's `nsf.vault`, exactly as today.
- **Session rows**: row id = `offset(file) + slot`, with offset(file 0) = 0 — a single-file import keeps id == slot, so nothing changes for today's imports, later-dropped playlists or the tests; each row also carries `slot`, and rows from a non-first file carry `parsed`, `bytes`, `vault`. captureChipTrack gets `row.slot`; the device record gets `{n: slot, secs, vault, bytes}` for those rows.
- **m3u lines**: parseM3u returns `{file, n, title, len}` (`file` = the text before `::`, null if empty). In a one-file import the file part is ignored (today's behaviour — rips name files freely). With several files, a line applies to the file whose name matches case-insensitively; a line naming a file that was not picked goes to the first file and the status line says so.
- **No playlist, several files**: each file's slots are listed separately; the first file's rows are `track-NN` as today, the others `<file base> track-NN` — no silent merge, no slug collision.
- **Matching an m3u line to an album track** (album-order.mjs, applyM3uToAlbum): a line naming a non-first file matches the track whose `vault` ends in `.<slugify(file base)><ext>`; any other line matches a track with no `vault`. Same rule in both places; the archive name above is what makes it reversible.
- **Repair = data edit, not a re-capture of the 17**: the fixed importer is run on the whole pack into a temp root as the dry run; if its 17 v1.0 files come back byte-identical to the album's (the album was last re-captured 2026-09-30 through the current writer, 3eb998d9) that is evidence the importer reproduces the album; either way the repo keeps its existing 17 files and only (a) moves the mislabelled n=2 file to `a-type-music-version-1-0.mid` with its album.json entries, (b) adds the v1.1 capture as `a-type-music-version-1-1.mid` with `vault: "game-boy/tetris.dmg-tra-1.gbs"`, (c) rebuilds track numbers with album-order against a copy of the pack (expected: v1.1 A-Type = 3, the rest unchanged) and the manifest.
- **Help**: the import hub's NES/Game Boy text gains one sentence (a pack with more than one chip file imports them all; each playlist line names its file), HELP.md rebuilt, a drift keyword added.

### Needs Josh
- Device-local state on his devices keyed by `albums/game-boy/tetris/a-type-music-version-1-1.mid` (recent list, local edits/notes, if any) will attach to the NEW v1.1 song after the repair; the v1.0 music moves to `…-version-1-0.mid`. He confirmed the current song is "a real, different song" — if he annotated it locally, say so before the deploy.
- The archive-root upload bug (gap 4): the main session should list the archive root for stray files from in-app publishes since 2026-09-29 and move them under their console folders.
