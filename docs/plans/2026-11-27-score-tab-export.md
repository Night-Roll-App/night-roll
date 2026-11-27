# Score + tab export — parts, formats, whole albums (plan, 2026-11-27)

Advisor plan (Fable), no code. Builder: read this, then `NIGHT-ROLL.md` "Export score — printable
pages" and `src/render/score-print.js` before touching anything.

## 0. The ask

Josh (#1154, then voice, 2026-11-27): export tab files and sheet music for every track of every
song; whole albums in one go; finer control of which voices go into the output; formats open —
"a webpage, PDFs, maybe Guitar Pro, who knows what people would actually want".

Scope note (not legal advice, said to him once already): the game compositions are copyrighted;
selling or publishing transcriptions needs a publisher's print license. Personal use and use
inside the app are fine. This plan builds for his own use; nothing here writes a copyright line,
a watermark or a warning into the files — the title and album line, as today.

Hard constraints (CLAUDE.md): web AND native; web = plain ES modules under `src/`, state on `S`,
new module in index.html's modulepreload list + `sw.js` `APP_MODULES` + `tools/split/check.mjs`
layer table; an action in `src/ask/actions.js`; Learning mode — the output never carries a key,
chord or meter he didn't declare; his songs are never modified by an export (read-only, like
Export everything); few taps (hands hurt).

## 1. What exists today

| Piece | Web (`night-roll-daw`) | Native (`night-roll-ipad`) | Guitar app (`night-roll-guitar`) |
|---|---|---|---|
| Score model | `buildScoreModelImpl` (src/render/score.js:72): shown non-drum tracks → staves (16th grid, chord groups, rests, ties across barlines), kit staff last with hands/feet voices; key from `sfAt`, meter from `barTicks()`; `pxqMin` | `ScoreModel.swift` (Packages/NightRollCore/…/Score/), a port of the same, plus `ChordMark`/`SectionMark` from his annotations (the view draws them; the print crops them) | `Notation` package: its own tab + score layout for exercises (`NotationKind.tab`) |
| Engraver | VexFlow 4.2.2 (`vendor/vexflow.js` — has `TabStave`/`TabNote`/`TabSlide`), one `engraveMeasure` for view + print | `ScoreEngraver.swift`, Bravura outlines, glyph list drawn by CoreGraphics | SMuFL layout in `Layout.swift` |
| Print | `exportScore(paper)` (score-print.js): pages → one self-contained HTML of SVGs → `deliverAudioFile` (share sheet / download). `#filedlscore`, `#filescoreform`, pref `ff1roll-score-paper` | `ScorePDF.make(plan:…)` → real PDF via `UIGraphicsPDFRenderer`; `ExportScoreSheet` (Share.swift:177); `Exporter.deliver` → share sheet | — |
| MIDI writer | `writeMidi(doc)` (src/midi/write.js), format-1, key only when the song had one | native writer (Download .mid) | — |
| Bulk export | `platform/export-core.js` + `session/export-all.js`: read-only engine, three sinks — `nativeSink` (Files → Night Roll → folder), `pickedFolderSink` (desktop `showDirectoryPicker`), `zipSink` (store-only zip, self-written) — progress, manifest | `ExportEverything.swift` (same folder format) | — |
| Headless song read | `askReadSong` (src/ask/tools.js:630): `readData("songs", path)` + `parseMidi` — notes only, no annotation resolve (key regions, meter, track: directives need `finalizeNotes`, which runs on the OPEN song) | `SongPlan.make(song:annotations:path:)` — fully headless | — |
| Catalog | `S.CATALOG` `{album: [[title, path]…]}`, `albumEffectiveOrder(album)` (game order / A–Z), 61 albums, 3401 songs, biggest 257 | `CatalogStore`, `Album` | — |
| Jobs | `JOB_KINDS.<kind>` + `S.jobs` (footer ⏳, progress, retry) | `JobRunner.start(kind:title:items:…)` | — |
| Fretboard | `GTR_TUNING [64,59,55,50,45,40]`, 24 frets, `gtrFold` octave fold (src/render/instrument.js) | `GuitarGeom` — same numbers, `fold`, `positions(of:)` | `GuitarTheory`: `Fretboard.positions`, `TabFallback.position` (lowest fret in a window), `Fingering.assign` (DP over string/fret with hand span, bends, slides) |
| Format readers | — | — | `Import/Sources/ScoreImport/`: `MusicXMLParser` (partwise, tab staves, ties, grace, endings, drums), `GP5Parser` (.gp5 v5.10), `GPIFParser` (.gp 7/8 = zip + `Content/score.gpif`), `TextTabParser`, `MiniZip`; fixtures under `Import/Tests/ScoreImportTests/Fixtures/` (incl. `x4-tab-staff.musicxml`, `w3c-tutorial-tablature.musicxml`); `docs/research/guitar-pro-format.md` (clean-room notes on gpif + gp5) |
| On the Mac | — | — | Guitar Pro 8 is installed in /Applications (no MuseScore, no LilyPond) |

Web score view shows: staves of the shown tracks, declared key signature (none when none), declared
time signature (none when none), track names. No chord names, no section labels, no analysis. The
native view adds his section bands and chord annotations above the staves; its print leaves them out.

## 2. Formats — who uses them, cost here, what to reuse

| Format | Who wants it | How hard here | Reuse | Verdict |
|---|---|---|---|---|
| **Printable pages (HTML of SVG → PDF via print)** | anyone who reads music; the "sheet music" ask | exists (web). Needs: part picker, optional TAB staff, album batch | score-print.js whole | **Phase 1** (extend) |
| **PDF (real bytes)** | same | exists on native; web would need a PDF writer — the 2026-10-04 ruling stands (no library; print path makes the PDF) | ScorePDF.swift | native: phase 1; web: stays HTML pages |
| **MusicXML (.musicxml)** | the interchange standard: MuseScore, Guitar Pro 7/8 (File → Import), Sibelius, Finale, Dorico, Soundslice, our guitar app. The one file that opens everywhere and carries both notation and tab | medium — a pure text writer over the score model's events (pitches already spelled by `vexKey`'s inputs, durations already in w/h/q/8/16 + dots, ties, rests, chords, kit roles). ~300 lines JS, same in Swift | score model; guitar app's parser + fixtures as the round-trip oracle; GP8 on the Mac as the second oracle | **Phase 1** |
| **ASCII tab (.txt)** | guitarists; what Ultimate-Guitar/Songsterr text tabs are; readable anywhere, pasteable into notes; the guitar app's `TextTabParser` reads it | small — string/fret assignment + a 6-line grid per system. ~150 lines | `GTR_TUNING`, `gtrFold`; port `TabFallback.position` first, `Fingering.assign` later | **Phase 1** |
| **MIDI (.mid)** | anyone with a DAW; the guitar app; already shipped per song | trivial to add to the bundle with the part filter (filter `doc.tracks`) | `writeMidi` | **Phase 1** (bundle option) |
| **Guitar Pro .gp (7/8: zip + gpif XML)** | Guitar Pro users specifically | medium-high: writing gpif is doable (we have a zip writer in `zipSink`, the gpif structure in guitar's research doc, and `GPIFParser` as an oracle) but GP's own acceptance rules are undocumented; a file GP refuses is a dead end to debug. GP imports MusicXML natively, so a .gp buys little | guitar app's `GPIFParser`, `MiniZip`, `docs/research/guitar-pro-format.md` | **Phase 4, optional**, only if MusicXML-into-GP8 disappoints him |
| **Guitar Pro .gp5** | legacy; TuxGuitar | binary, 49-byte settings blobs, lots of "assumed" fields | `GP5Parser` as oracle | **No** — MusicXML covers it |
| **alphaTex / alphaTab** | web tab renderers | a second renderer; VexFlow already does tab | — | No |
| **ABC / LilyPond** | folk / typesetting nerds | LilyPond output is easy to write but needs LilyPond to render; not installed | — | No |
| **A web page (album book)** | reading on the iPad/laptop, sharing one link | small — one `index.html` per album folder linking each song's pages; later one single-file book | `scoreHtmlDocument` | **Phase 2** (index), book phase 3 |
| **.notes.txt** | LLMs / web sessions | exists (`tools/dump_notes.mjs`, `notesTxtForDoc`) | — | cheap bundle option, phase 2 |

**Recommendation:** MusicXML is the center (opens in GP8, MuseScore, the guitar app). Pages
(web HTML / native PDF) stay the thing he prints. ASCII tab is the "tab file" he asked for and
needs nothing to open. MIDI rides along. Guitar Pro's own format waits.

## 3. The export model (one shape, both platforms, every format)

```
ExportRequest {
  scope:   "song" | "album" | "folder"        // folder = a LOCAL folder (songs not in the catalog)
  parts:   [trackIndex…] | "shown" | "all"     // "voices" in Josh's words = tracks; default "shown" = what the score view shows
  split:   "together" | "per-part"             // per-part = one file per chosen track (the #1154 ask); kit stays whole
  formats: { pages: bool, musicxml: bool, tab: bool, midi: bool }
  tab:     { tracks: [trackIndex…] | "melodic", tuning: "standard", frets: 24, inStaff: bool }
           // inStaff = a TAB staff under that track's notation staff in pages/MusicXML (Guitar Pro's standard+tab shape)
  paper:   "letter" | "a4"
  annotations: false                           // phase 2 option: his section labels / chord annotations as rehearsal marks / <harmony>
}
```

Per song the engine produces `[{name, mime, bytes|text}]`; the delivery decides where they go:

- one song, web: one `Share` call with every file (Capacitor `Share.share({files:[…]})` takes a list — today's `deliverAudioFile` passes one; add `deliverFiles(list)` beside it, browser = sequential `a.download`); native: `Exporter.deliver` with several URLs (`ActivityView` takes `[URL]`).
- album: the existing sinks (`nativeSink` → Files → Night Roll → `Exports/<Album>/`; `pickedFolderSink`; `zipSink`), one `index.html` + `manifest.json` at the root, a folder per song.

File names (`fileNameFor`-safe, reversible): `Exports/<Album>/<nn> <Song>/<Song>.musicxml`, `<Song>-score.html` (native: `.pdf`), `<Song>-<Track>-tab.txt` (one per tab track), `<Song>.mid`; per-part split adds ` — <Track>` before the extension. `nn` = the album's game order when it has track numbers (`albumEffectiveOrder`), else none.

## 4. Learning mode — exactly what each file carries

| | Key | Meter | Chords / sections | Tempo | Pitch spelling |
|---|---|---|---|---|---|
| Pages | as the score view: signature only from `sfAt`/`sfDeclaredAt`, none when none | time signature only when `S.declaredTs` | none (phase 2: his own annotations, opt-in, off by default) | none | `vexKey(p, spellFor(sfAt))` — C spelling when undeclared, as today |
| MusicXML | `<key>` only when declared (at bar 1 and at every declared change, as `engraveMeasure`'s `keyChanged`); omitted otherwise — `<key>` is optional | `<time>` ALWAYS present so readers cut bars where our ruler does, but `print-object="no"` unless declared (then printed). Same facts as the score view: bars where the ruler puts them, no digits unless his | never `<harmony>`, never `<rehearsal>` unless phase 2 opt-in | `<sound tempo>` from the tempo map (tempo may apply; it's the file's own) | `<step>/<alter>/<octave>` from the same spelling |
| ASCII tab | nothing | bar lines where the ruler puts them, no "4/4" header unless declared | nothing | optional `♩=` line from the tempo map | frets only |
| MIDI | as `writeMidi` today (key only if the file already had one) | as today | — | as today | — |

A vm test per format asserts the absence (no `<key>` / no `<harmony>` / no time digits) on a song
with no declarations, and the presence on one with a `key:` and `timesig:` annotation.

## 5. UI

### Web — File ▾ → "Export score / tab…" (replaces the "Export score…" row; same `#filedlscore` id)

One sheet (`makeWindow("exportsheet", {dockable: false})`, an `.overlay > .sheet.help` like the
import hub), top to bottom, every row a tap or a toggle, remembered as device prefs
(`ff1roll-export-*`) so the usual run is **two taps: open, Export**:

1. **What**: `This song` | `This album (<name>, N songs)` | `This folder` (local songs). Segmented. Default: this song.
2. **Formats**: checkboxes `Pages` (on), `MusicXML` (on), `Tab` (on), `MIDI` (off). One line under Tab: "standard tuning, 24 frets — one file per part".
3. **Parts**: the song's tracks as chips with the track colour, ticked = included; drums chip says "kit". Presets as three small buttons: `As shown` (default — mirrors H/hide-drums), `All`, `Each part its own file` (toggles `split`). For an album the chip row says "parts are chosen per song: as shown" and offers only `As shown` / `All` / `Each part its own file` — no per-song picking (257 songs).
4. **Tab for**: chips of the melodic tracks (default: all melodic tracks ticked; drums never). `TAB under the staff` toggle (default off: tab goes to its own .txt files and its own MusicXML TAB staff only when on — see Q3).
5. **Paper**: Letter | A4 (existing pref).
6. **Export** (primary). For an album the button reads `Export N songs…` and starts a ⏳ job (`JOB_KINDS.export`: progress "12/92 · Frog's Theme", Cancel, Retry; the status line says where it landed: "Exports → Final Fantasy (92 songs, 368 files)").

No new keyboard shortcut (menu item). Buttons change only through `setControl()`.

### Native — File ▾ → Export score / tab…

`ExportScoreSheet` grows into `ExportSheet` with the same six rows (Form sections; `Picker`
segmented for What and Paper, `Toggle`s, a chip row for parts using the mixer's track colours).
Album export runs through `JobRunner.start(kind: "export", …)` and writes under
`Documents/Night Roll/Exports/<Album>/` (visible in Files), ending with a "Show in Files" button in
the job dialog; a single song hands its files to the share sheet as today. Album songs are read
headless: `CatalogStore` → `.mid` + `.rollnotes.json` (cached copies, as the album run does) →
`SongPlan.make` → `ScoreModel` → `ScorePDF` / `MusicXMLWriter` / `TabWriter`.

### Ask (both apps' AI panels)

One action, one registry entry:

```
{name: "export", args: "what? formats? parts? split? tab_for? paper?",
 gloss: "export score pages, MusicXML, guitar tab or MIDI for this song, its album or its folder",
 example: "Export tab and MusicXML for this whole album, each part its own file.",
 spec: "export {what?, formats?, parts?, split?, tab_for?, paper?}: what = song (default) | album | folder;
        formats = list of pages|musicxml|tab|midi (default pages, musicxml, tab); parts = shown (default) | all |
        track names; split = together (default) | per_part; tab_for = melodic (default) | track names; paper = letter|a4.
        An album export runs as a ⏳ job and says where the files landed. Never changes the song; writes nothing he
        didn't declare (no key, chord or meter names)."}
```

`song: false` is wrong here (a song export needs the open song); keep it song-scoped, and let
`what: "album"` without an open song resolve the album by name through `askSongPath`'s catalog
lookup (phase 2). Then `node tools/build_ask_help.mjs && node tools/build_help.mjs`; a row in
`docs/ai-parity.md`. Native's AI panel gets the same action name in its registry.

## 6. Build plan

### Phase 1 — one song, four formats, parts (web + native; ~2 sessions)

Web:
- `src/export/musicxml.js` (pure; imports theory/ + model/ only → new `"export"` entry at layer 2 in `check.mjs` LAYERS, beside `model`/`gen`): `musicXmlDocument({title, album, ppq, bt, declaredTs, staves, tempos, keyAt, spellAt, tab})` → string. One `<part>` per staff; `divisions = ppq`; `<attributes>` at bar 1 (and at key changes); notes from the model's events (`pitches`, `dur`, `dots`, `tieFrom`, `rest`, kit `keys` → `<unpitched>` with `display-step/octave` from `DRUM_SCORE` and `<notehead>x</notehead>`); chords via `<chord/>`; `<backup>` between the two kit voices. TAB: when `tab.inStaff` the part gets `<staves>2</staves>`, `<clef number="2"><sign>TAB</sign><line>5</line>`, `<staff-details number="2">` with `<staff-lines>6</staff-lines>` and six `<staff-tuning>` lines (E2 A2 D3 G3 B3 E4), the same notes again on staff 2 with `<technical><string>/<fret>`. The shape MuseScore/GP write; the guitar app's `x4-tab-staff.musicxml` and `w3c-tutorial-tablature.musicxml` fixtures are the spec of what their parser already reads — match those.
- `src/export/tab.js` (pure, layer 2): `tabAssign(events, {tuning, frets, window})` — per staff, port of `TabFallback.position`: candidate strings for the (folded) pitch, prefer the lowest fret inside a sliding window around the last position, tie → higher string; chords: distinct strings, lowest-fret set. Folded notes get a `*` and a footnote count. `asciiTab(staff, bt, ppq, tempoLine)` → text: 6 lines per system (`e|---…`), one column per 16th (`grid = ppq/4`), two-digit frets take two columns and push the row (every string row advances together), `|` at bar lines, 4 bars per system (meter-aware: `floor(64 / sixteenthsPerBar)` bars), bar numbers above each system, the track name as the header, legend line only when something folded.
- `src/session/export-score.js` (layer 4): `buildExportFiles(req, {engrave = engraveScorePages})` → `[{name, mime, data}]` from `S` (the open song): reuses `scorePageLayout` + `scoreHtmlDocument` for pages (now with the part filter applied by building the model from a track set: lift `buildScoreModelImpl`'s body into `buildScoreModelFor(trackSet)` and leave `buildScoreModelImpl` calling it with the shown set — `S.scoreModel` is still only the view's), `writeMidi({...doc, tracks: filtered})`, the two pure writers. `deliverFiles(files)` in `src/audio/bounce.js` next to `deliverAudioFile` (one Share call with every uri; browser: sequential downloads). Pages with `tab.inStaff`: `engraveMeasure` gains an `opts.tab` staff — a `VF.TabStave` under the track's stave with `VF.TabNote`s from the same assignment (same x formatting via `fmt.joinVoices`); view untouched.
- `index.html`: the sheet markup (`#exportsheet`, ids `#exWhat`, `#exFmtPages`…, `#exGo`), the File row relabelled; `css/app.css` rows; `sw.js` + modulepreload for the three modules; `help/help.html` files section (replace the Export score entry; gesture first, "no keyboard shortcut"); FEATURES keyword `"Export score / tab"`; `src/ask/actions.js` `export` action (song scope only in phase 1); `node tools/build_ask_help.mjs && node tools/build_help.mjs`.

Native:
- `NightRollCore/Export/MusicXMLWriter.swift`, `TabWriter.swift` (pure, `swift test`), `ScoreModel(plan:tracks:)` already takes a track set; `ScorePDF.make` gains `tab:`; `ExportSheet` replaces `ExportScoreSheet`; `Exporter.export(request:)` delivers `[URL]`; AI registry action `export`; HELP.md entry.

Ship when: a 3-track FF1 song exports four files in Brave and on the iPad; the `.musicxml` opens in Guitar Pro 8 on the Mac with the right bars and a TAB staff; `cd ~/work/night-roll/night-roll-guitar/Import && swift test` passes with the exported file added as a fixture (see §7).

### Phase 2 — whole album, index page, job (web + native; ~1–2 sessions)

- Web: `JOB_KINDS.export`; `exportAlbumRun(req, sink)` walks `albumEffectiveOrder(album)` and, per song, loads it through the LIVE loader (`loadSong(path)` with `S.exportRun` set, which the loader treats like `S.albumRun`: never asks, keeps drafts, no autoplay, `fitView` skipped), builds the files, writes them through the sink, then reopens the song that was open (and its view). Reason: the annotation resolver (`finalizeNotes` → `S.keyRegions`, `S.declaredTs`, `track:` directives) runs only on the open song; a headless resolver is a refactor (phase 3). The screen will flip through the songs; the job dialog says "exporting — the app is busy until it finishes" with Cancel. Sinks: the three from `export-all.js`, factored out of it into `src/platform/export-sinks.js` (layer 1) so both exporters share them. `index.html` per album (title, one row per song linking its files) + `manifest.json` (same record shape as export-core's). `.notes.txt` as a fifth format option.
- Native: `JobRunner` export job, headless `SongPlan.make` per song — no screen flipping; same folder layout; "Show in Files".
- Ask: `what: "album"` / `"folder"`, album by name without an open song.
- `This folder` scope for local-only songs (`localFolders()`).

### Phase 3 — quality (either order, as he reports)

- Port `Fingering.assign` (guitar `Theory/Sources/GuitarTheory/Fingering.swift`: hand-span DP) to `tab.js`; native links the `GuitarTheory` package by local path (as the guitar app links `night-roll-ear`) instead of porting.
- Headless web resolver: `resolveSongDoc(doc, rollnotes)` → `{keyRegions, declaredTs, trackState}` without touching `S`, so an album export stops flipping the screen and can run `Everything` (3401 songs) in the background.
- His annotations opt-in: section labels → `<rehearsal>` + pages' system labels; chord annotations → `<harmony>`; key/meter already covered. Default off.
- One-file album book (`<Album>-book.html`: every song's pages with a contents page).
- Tunings (drop D, 7-string) and capo in the Tab row.

### Phase 4 — Guitar Pro `.gp` (only if asked)

gpif writer + zip (reuse `zipSink`'s zip; native `MiniZip`), oracle = `GPIFParser` + Guitar Pro 8. Not before he has opened our MusicXML in GP8 and said what is missing.

## 7. Tests

vm suite (`node tools/run-tests.mjs night-roll`; check `ℹ pass N`):
- `musicxml.js`: well-formed (a tiny tag-balance check, no parser), one `<part>` per staff, `<measure>` count = `nMeasures`, `divisions = ppq`, durations sum to `bt` per measure (rests included), `<chord/>` on the 2nd+ pitch, `<tie>`+`<tied>` pairs, kit `<unpitched>`; Learning: no `<key>` and `<time print-object="no">` on an undeclared song; `<key><fifths>` and printed `<time>` after `key:`/`timesig:` annotations; a key change → a new `<attributes>` at that bar; TAB staff: `<staff-lines>6`, tunings, `<string>/<fret>` on every tab note.
- `tab.js`: E2 → string 6 fret 0; E4 → string 1 fret 0 (not string 2 fret 5) under the window rule; a chord lands on distinct strings; C1 folds up with `*` and the footnote; column count per bar = sixteenths per bar for the declared and undeclared meters; a two-digit fret keeps the six rows aligned (every row the same length per system).
- `export-score.js`: with a stand-in engraver (as the Export score test does) — the part filter (hidden track out, `all` brings it back, `per_part` → one pages file per track), file names, `deliverFiles` called once with N files; refusals (no song / no notes) use the status line.
- Registry: `export` offered, its help row generated; FEATURES keyword present; modulepreload + `APP_MODULES` + `check.mjs` layers (`node tools/split/check.mjs`).
- Phase 2: `exportAlbumRun` with a fake loader and a fake sink — order = `albumEffectiveOrder`, reopened song = the one that was open, cancel stops after the current song, manifest totals.

Cross-repo round-trip (the real oracle, run by hand before shipping phase 1): export an FF1 song's `.musicxml` (standard+TAB) in Brave, copy it to `night-roll-guitar/Import/Tests/ScoreImportTests/Fixtures/real/nightroll-<song>.musicxml`, add a parse test (notes count, a known string/fret), `cd Import && swift test`. Commit the fixture in the guitar repo (that session pushes it). Then open the same file in Guitar Pro 8 on the Mac and screenshot (Josh #941-style side by side with our pages).

Native: `swift test` on the two writers with the same assertions; UI test taps the sheet and reads `nr.state export=` (`ProbeRegistry` "export").

Browser-verify (Brave, claude-in-chrome) before push: the sheet at phone width, the pages file opened, the `.txt` tab opened; restore any pref touched. `npm run test:e2e:smoke` only if he isn't using the machine. Full Playwright in CI only.

## 8. Risks

- **A file Guitar Pro refuses** — MusicXML import in GP8 is picky about `<divisions>` vs durations and about `<backup>` totals. Mitigation: durations are the model's own (already consistent per bar), one `<backup>` per measure, the W3C tutorial fixture as the template, GP8 on the Mac before shipping.
- **Album export through the live loader (phase 2 web)** flips the screen and runs `preloadVoices` per song: ~1–3 s per song, a 257-song album ≈ 5–10 min with the app unusable. Acceptable as a cancelable job once; the headless resolver (phase 3) removes it. Never let it ask a question: `S.exportRun` guards the "newer save" confirm exactly as `S.albumRun` does.
- **Draft safety**: the loader can delete draft keys on "take newer" — the export guard keeps the draft, same path as the album run. Test it.
- **Tab assignment reads badly** for NES lines that jump octaves — the window rule is naive; `Fingering.assign` (phase 3) is the real fix; the `*` fold marks keep it honest meanwhile.
- **Learning leak**: a `<time>` with digits on an undeclared song, or `<key>` from the file's own meta. Tests assert absence; the writers take `declaredTs`/`keyAt` from the same functions the score view uses, nothing from `parseMidi`'s meta.
- **Wording**: "Export score / tab…" is a label change — proposed below with alternatives; he vetoes.
- **Two engravers drift** (web VexFlow, native Bravura) — pages already differ in glyphs; MusicXML and tab text are identical by construction (same model), compare them in the parity screenshots instead.

## 9. Questions — defaults the builder uses

- **Q1 File row wording.** Options: "Export score / tab…", "Export sheet music…", "Export…". **default:** "Export score / tab…" (same `#filedlscore`), say so in the --say note.
- **Q2 Which parts by default.** **default:** `shown` — what the score view shows (H flag, hide-drums), the kit included as its own staff; `All` and per-part one tap away.
- **Q3 Tab placement.** **default:** separate `.txt` per melodic track + a TAB staff in the MusicXML (so GP8/the guitar app see it); the HTML pages stay notation-only unless `TAB under the staff` is on (VexFlow TabStave; phase 1 if it fits, else phase 2).
- **Q4 Tuning / frets.** **default:** standard EADGBE, 24 frets (the fretboard's own), fold off-neck pitches with `*`; other tunings phase 3.
- **Q5 Written octave.** **default:** sounding pitch, plain treble/bass clefs, no `<transpose>` — exactly the score view; the guitar convention (8vb) is a reader setting in GP/MuseScore.
- **Q6 Album file layout.** **default:** `Exports/<Album>/<nn> <Song>/` with one folder per song, `index.html` + `manifest.json` at the album root; one-file album book phase 3.
- **Q7 Where an album export lands.** **default:** iPad → Files → Night Roll → Exports (nativeSink); desktop Chrome → a picked folder; other browsers → a zip download (the three sinks that exist).
- **Q8 MIDI in the bundle.** **default:** off (Download .mid and Export everything already give it); one toggle.
- **Q9 His annotations in the files.** **default:** off, phase 2/3 opt-in; the score view today shows none (web).
- **Q10 Everything (all 3401 songs).** **default:** not offered until the headless resolver (phase 3); the scope row stops at album/folder.
- **Q11 Guitar Pro native format.** **default:** not built; MusicXML → GP8 import is the route; revisit on his report.
- **Q12 Legal footer in the files.** **default:** none — title and album line only, as today.

## 10. Doc sweep (per the shipping checklist)

NIGHT-ROLL.md: new section "Export score / tab — parts, MusicXML, tab, albums" (model, writers, sinks, the `S.exportRun` guard, file layout, Learning table from §4) and the module map rows; `tools/README.md` unchanged unless a dump tool is added; `docs/ai-parity.md` row for `export`; `docs/HELP.md` regenerated; `open-items.md`: close #1154's queue line, add the Q-list above (Q47+ in the one list) and the phase 3/4 items; `README.md` one line under what the app exports; `docs/learning/glossary.md`: "tablature", "MusicXML" if they come up with him.

## Review (Fable, 2026-11-27 — checked against the three repos, no code touched)

What the plan names and I verified as real: `scorePageLayout` / `scoreHtmlDocument` / `exportScore(paper, engrave)` (src/render/score-print.js:52,121,170), `buildScoreModelImpl` (src/render/score.js:72, re-bound through `prof()`), `writeMidi` (src/midi/write.js:3, key only from `s.keysig`/`s.source.keysigs`), `deliverAudioFile` (src/audio/bounce.js:74, one `files:[uri]`), the three sinks + `fileNameFor` + `buildManifest` (export-all.js:34-43, export-core.js:15,85), `JOB_KINDS` (model/jobs.js:21, kinds added by init*), `albumEffectiveOrder`, `localFolders`, `notesTxtForDoc`, `GTR_TUNING`/`gtrFold`, VexFlow 4.2.2 with `TabStave`/`TabNote`/`TabSlide`, `makeWindow`, `check.mjs` LAYERS (`["model","gen"]` at index 2), `sw.js` `APP_MODULES`, `tools/build_ask_help.mjs`, `docs/ai-parity.md`, open-items #1154 line. Native: `ScorePDF.make(plan:key:title:album:paper:)` (Sources/ScorePDF.swift:50), `ExportScoreSheet` (Share.swift:177), `Exporter.deliver(_ url:kind:)` (Share.swift:17), `SongPlan.make(song:annotations:path:…)` (NightRollCore/SongPlan.swift:135), `ScoreModel(plan:tracks:)` (Score/ScoreModel.swift:111) with `ChordMark`/`SectionMark`, `JobRunner.start(kind:title:items:…)` (Jobs.swift:149), `ExportEverything.swift`, `GuitarGeom.fold`/`positions(of:)` (GuitarFretboard.swift:49,58 — app target, not Core), `ProbeRegistry`, `CatalogStore.cacheFile`/`cachedRollnotesData`. Guitar: `ScoreImport` with `MusicXMLParser` (reads `staff-tuning`, `string`/`fret`, `unpitched`, `backup`, `tied`, `chord`), `GP5Parser`, `GPIFParser`, `TextTabParser`, `MiniZip`, fixtures `musicxml/x4-tab-staff.musicxml` + `real/w3c-tutorial-tablature.musicxml`, `Fingering.assign(_:open:frets:)`, `docs/research/guitar-pro-format.md`; Guitar Pro 8 in /Applications.

### Blocking (each with the fix)

1. **The score model cannot be built in the vm suite as the plan stands.** `buildScoreModelImpl` returns before building when `VF` is null (score.js:76) and the harness has no VexFlow — the existing Export score test says so (tests/night-roll.test.mjs:12640, "leaves S.scoreModel null here") and stands in a hand-made model. Every §7 writer test over a real song's model would see no staves. **Fix:** the lifted `buildScoreModelFor(trackSet)` is pure over `S.song` and has NO `VF` guard (the body never touches VF); `buildScoreModelImpl` keeps `if (!VF || !S.song) return;` and then calls it with the shown set. `buildExportFiles` calls `buildScoreModelFor` directly. The vm tests then run on real FF1 fixtures, not stand-ins.

2. **Measures are not rest-padded to the bar; the §7 "durations sum to bt" test is false against the real model, and GP8/MuseScore choke on short bars (the plan's own §8 risk).** `pushRest` fills gaps only BEFORE an event; after the last note of a staff the bar stays short, an empty staff (compositions keep empty tracks, score.js:87) has every measure `[]`, and the kit's feet voice ends short too. `nMeasures = ceil(lastTick/bt − 0.05)` makes the last bar partial for most songs. **Fix:** the MusicXML writer pads every measure of every voice to `bt` with rest pieces from `durationPieces` (an all-empty bar = `<note><rest measure="yes"/><duration>bt</duration></note>`); `<backup>` is voice 1's ACTUAL sum, not `bt`; the ASCII tab pads with `-` the same way. Tests: last bar of a song whose final note ends mid-bar; an empty composition track; the kit feet voice.

3. **Key source leaks estimates and the key-dial preview.** §4 names `sfAt`/`sfDeclaredAt`. `sfAt` → `sfShownAt` returns the Krumhansl ESTIMATE in Normal mode (model/song.js:122-128); `sfDeclaredAt` returns `S.previewSf` while the dial is being turned (song.js:130). Native `shownSf(at:)` and the spelling fall back to `estimatedSf` (ScoreModel.swift:72-77). A `<key>` in a file carries no "estimate" label — it reads as his declaration, and the file leaves the app. **Fix:** `<key>` (and any tab header) only from `sfDeclaredAtRaw(tick)` (web) / `declaredSf(at:)` (native), never `sfAt`/`shownSf`/`previewSf`/`estimatedSf`; spelling as `engraveMeasure` really does it — `sfDeclaredAt === null ? SHARP_SPELL : spellFor(sf)` (score.js:257; §4 says "C spelling", the code says sharps). Add a test that sets `appMode` normal + an undeclared song and asserts no `<key>`, and one with `S.previewSf` set. Pages keep the view's behaviour (already shipped).

4. **Native AI parity test will fail the moment `export` joins the web registry.** `Tests/AppToolsTests.swift:93` asserts `AppActionTexts.all` equals the web's registry by name, from `Tests/Fixtures/ask-actions.json` dumped by `night-roll-ipad/tools/gen-ask-actions.mjs`, and every name needs a `handlers` or `unavailable` entry (AppTools.swift:97-175). §5 says only "same action name in its registry". **Fix:** in the same push as the web action: `node tools/gen-ask-actions.mjs` in night-roll-ipad, an `AppActionMeta` row in `AppActionTexts.swift`, and the `"export"` handler (or an `unavailable` text until the native sheet lands — phase 1 ships both, so the handler).

5. **`TabFallback.position` does not exist** — it appears only in guitar plan docs (docs/plans/2026-10-16-notation-views.md:89), never in Theory/ or Notation/. §1 and §6 tell the builder to port it. **Fix:** write the window rule from §6's own description (candidates from `GTR_TUNING`/`gtrFold`; prefer the lowest fret inside a window around the last position; tie → higher string; chords on distinct strings). `Fretboard.positions(midi:frets:open:)` is the only existing candidate lister in guitar; `Fingering.assign` is real and stays phase 3.

6. **Phase 1 is not small.** Web alone: two writers, the model refactor, `buildExportFiles`, `deliverFiles`, a six-row sheet with colour chips and presets, the VexFlow `TabStave` under the staff, the Ask action, help, FEATURES, parity doc; native: two writers, `ScorePDF.make` growing `tab:` AND `tracks:` (it computes the shown set itself, ScorePDF.swift:53), a new `ExportSheet`, multi-URL share (`Exporter.deliver` and `ActivityView` take ONE url today — ShareLink.swift:49 `activityItems: [url]`; §3's "ActivityView takes [URL]" is wrong), the AI handler. **Fix:** cut in-staff TAB engraving (web `TabStave` in pages, native `ScorePDF` `tab:`) to phase 2 — Q3 already hedges; make it definite. Phase 1 = part filter + pages + MusicXML (with its TAB staff) + `.txt` tab + MIDI toggle + sheet + action, web and native. The `TAB under the staff` toggle stays out of the sheet until phase 2 (no dead controls).

### Non-blocking notes

- **`<divisions>`**: `divisions = ppq` gives a non-integer `<duration>` for a dotted 16th (0.375·ppq) whenever ppq isn't a multiple of 8. The model is a 16th grid with dotted pieces, so `divisions = 8` (16th = 2, dotted 16th = 3, … whole = 32) is always integral and ppq-independent; `bt` in divisions = `bt/ppq·8`. Use that; one test with ppq = 100.
- Kit events carry VexFlow key strings (`"c/5/x2"`, score.js:154): parse step/octave from the key, `<notehead>x</notehead>` from the `/x2` suffix; the feet voice's rests are "invisible" in the view (`e.hidden`) — in MusicXML write them as `<rest/>` with `print-object="no"`.
- Native `ScoreModel` carries `ChordMark`/`SectionMark` from his annotations; the Swift `MusicXMLWriter` must not read them in phase 1 — a test on a song with chord annotations asserts no `<harmony>`/`<rehearsal>` (the web test only covers the web model, which has none).
- `GuitarGeom` lives in the app target; a `TabWriter` in NightRollCore cannot import it — move its six numbers + `fold` into Core (Core already has `Score/`), don't duplicate.
- Guitar `TextTabParser` ignores spacing and reads every column as an eighth (TextTabParser.swift:5) — the `.txt` round-trip checks string/fret ORDER only; say so in that test. Its `MusicXMLParser` defaults to 4/4 without `<time>` and ignores `print-object`, so `<time print-object="no">` is right for it; the hidden digits equal `effTs()`'s fallback `[4,4]` (grid.js:96) — the same implicit 4/4 the ruler's bar lines already assume, no new leak.
- Sheet pattern: §5 says `makeWindow(...)` "like the import hub", but `#importsheet` and `#stemssheet` are `.overlay` divs wired by their init (not `makeWindow` windows — wm.js is for dockable windows). Follow `#stemssheet`/`initStems1` (the newest overlay sheet). Buttons via `setControl()` as stated.
- `check.mjs` LAYERS: `["model", "gen", "export"]` is right; `src/export/*` may import theory (0), platform (1), model (2). Bump `SW_VERSION` with the usual note; tests/pwa.test.mjs ties `APP_MODULES` to the modulepreload list.
- Phase 2 live-loader guard: song.js:381 reads `!S.albumRun` for the confirm and :391 for the "draft kept" line — `S.exportRun` must cover both (or one `quietLoad()` predicate). `!d.dirty` still removes identical draft keys — fine, as the album run does.
- Phase 1 Ask action: `what: album|folder` must REFUSE with a plain line ("album export comes in the next build"), never silently export the song; `tab_for`/`parts` by track name through the same resolver `set_track` uses. `run()` returns the status line as `publish_song` does.
- File names: `fileNameFor` only encodes `/ % |`; `<nn> <Song>/` folders come from TITLES, so strip `: ? " * < >` too (Files on iPad tolerates them, a picked Windows folder doesn't).
- `writeMidi({...doc, tracks: filtered})` keeps `s.source` raw events by `srcIndex` (write.js:36,62) — correct; channel numbers follow the filtered index (`trackCh`) — harmless.
- §1 "C spelling when undeclared" → sharps (SHARP_SPELL); §4 wording to match.
- Native album export (phase 2): `CatalogStore.cacheFile(song.path)` + `cachedRollnotesData(key:)` are the headless reads; `ExportEverything.swift` reads `Documents/Songs/*` (local copies), not the catalog cache — don't copy its walker.

### Test strategy — runnable here?

- Web: yes — `node tools/run-tests.mjs night-roll` (check `ℹ pass N`); the harness has `Blob` and the Capacitor stub pattern the Export score test uses (`window.Capacitor` + recorded `nativeCall`s) carries over to `deliverFiles`. No `DOMParser` in the vm (browser-globals.txt only whitelists the name), so the plan's tag-balance check is the right level there.
- Native: writers in NightRollCore → `cd Packages/NightRollCore && swift test --filter MusicXML` (testTarget exists); the sheet → `xcodebuild … -only-testing:NightRollNativeTests/<ExportSheetTests>`; one UI probe, not a suite.
- **MusicXML headless: yes.** `/usr/bin/xmllint` (libxml 2.9.13) is on the Mac: `xmllint --noout` for well-formedness and `xmllint --noout --schema musicxml.xsd` against the W3C MusicXML 4.0 XSD (vendor `musicxml.xsd` + `xml.xsd` + `xlink.xsd` from github.com/w3c/musicxml under tests/fixtures/musicxml-xsd/; W3C Community Final Specification licence) — add `tools/musicxml-check.sh <file>` and run it in the ship checklist on an exported FF1 file. Second oracle: the guitar app's `swift test` with the exported fixture (plan §7). Guitar Pro 8 has no CLI (eyes only); MuseScore isn't installed (Muse Hub is) — `mscore -o x.pdf in.musicxml` would be a third headless oracle if Josh wants it installed; not required.
- No local Playwright: the plan already says so; `test:e2e:smoke` only if he isn't on the machine.

### Verdict

**Ready with fixes** — apply 1–6 before building; 1–3 change the writers' contract (model builder, padding, key source), 4 and 5 are missing steps/nonexistent references, 6 is the scope cut that makes phase 1 shippable in both apps.

## Code review (Fable, 2026-11-27 — phase 1 as built: web worktree 02f81db0 on 8d15d908, night-roll-ipad `export-phase1` 8f2770b, night-roll-guitar `export-roundtrip` a2d0001)

**Verdict: merge after fixes.** The code is right; the fixes are merge-time (web main moved under the branch) plus two nits.

Ran: web `node tools/run-tests.mjs night-roll modules pwa` → ℹ pass 684/685 (0 fail), 6/6, 93/93; `node tools/split/check.mjs` → 118 files, 0 violations. Native Core `swift test --filter 'MusicXMLWriterTests|TabWriterTests'` → 6/6. Guitar `swift test --filter NightRollExportTests` → 2/2 (the exported airship file reads back with its TAB staff). `sh tools/musicxml-check.sh` (W3C 4.0 XSD, xmllint) on the airship fixture, headless dumps of FF1 battle + matoyas-cave (`tools/musicxml-dump.mjs`), and a harness-built composition with a kit (hands + hidden feet rests + `<backup>`), a mid-bar tempo `<offset>`, a key change and an empty track → all four validate. `git merge-tree`: native vs master clean; web vs main conflicts in three files (below).

What the writers do and I checked by hand: durations in divisions = 8 (integral at ppq 100, test), every voice of every bar rest-padded to the bar and `<backup>` = voice 1's actual sum (review blocker 2), `<chord/>` on the 2nd+ pitch, `<tie>`+`<tied>` pairs from the model's `tieFrom` identity (within a bar and across barlines), the kit as `<unpitched>` display positions (hat G5 x-head, snare C5, kick F4) in two voices, TAB staff as `<staves>2</staves>` + `<clef number="2">TAB` + six `<staff-tuning>` lines E2…E4 + `<string>/<fret>` on voice 5 — element order matches the XSD (the validator agrees). Key only from `sfDeclaredAtRaw` (web, src/session/export-score.js:92-93) / `declaredSf(at:)` (native, MusicXMLWriter.swift:80) — tests cover Normal-mode estimate, key-dial preview, a key change, the kit part, `<time print-object="no">` undeclared and printed after `timesig:`, never `<harmony>`/`<rehearsal>` (the native test seeds chord + section marks and asserts they stay out). The airship/battle/matoyas-cave `<key>`s are his own `type:"key"` rollnotes (F mixolydian → −2, Bb mixolydian → −3, Gm, Bm). Nothing writes to a song: `buildExportFiles` reads `S`, `writeMidi` gets a spread copy; native `var q = plan` is a value copy (ExportTests `testExportingDoesNotChangeThePlan`). ES-module rules: `S.exportSheet` on `S`, wiring in `initExport1()`, `export` at layer 2 (tab.js imports nothing; render/instrument.js now takes the fretboard numbers from it), modulepreload + `APP_MODULES` + check.mjs in step. Ask `export` in both registries (native AppActionTexts row + handler + regenerated ask-actions.json, count 37), album/folder refuse out loud. Web and native match row for row (sheet, names, refusal lines, request parser); the one model difference (native `ScoreModel` skips an empty composition track, the web keeps its stave) predates this work and is noted in the native test.

### Must fix (at merge)

1. **sw.js — both sides bumped to `nr-v55`.** main's nr-v55 = `src/audio/chip-pitch.js`; the branch's = the three export modules (sw.js:37). Resolve to `nr-v56` carrying both notes, and `APP_MODULES` (sw.js:45) = main's list (with `src/audio/chip-pitch.js`) + `src/session/export-score.js`, `src/export/musicxml.js`, `src/export/tab.js`. tests/pwa.test.mjs ties it to the modulepreload list (which auto-merges).
2. **tests/modules.test.mjs:343 and :352 — file counts.** main is 104/116, the branch 106/118; the merge is **107/119** (chip-pitch + the three), and the message strings want both notes.
3. **open-items.md (conflict ~line 19-26 of the merge).** Keep main's "SHIPPED 2026-11-27 … web game songs keep pitch" line and DROP the branch's stale "BUILDING (#1152) …" line; keep the branch's "BUILT 2026-11-27 (phase 1 …)" paragraph and the Q47–Q58 list. Then re-run the three suites.

### Nits (fix if touching the files; not blocking)

4. `tools/musicxml-check.sh:13,17` — `status` is a read-only variable in zsh, so `zsh tools/musicxml-check.sh …` dies ("read-only variable: status"); `sh`/the shebang work. Rename it `rc` — the sessions run tools with `zsh` by habit.
5. night-roll-ipad `Sources/ExportFiles.swift:55` — a `.refused` from `ScorePDF.make` is dropped (`if case .made`); with Pages as the only format the user then reads "nothing to export — no staff for those parts" instead of the PDF's own reason. Surface it.
6. A ranged `key:` declaration that ENDS mid-song has no MusicXML expression (no "no key" signature): bars after its end keep the last `<key>` (src/export/musicxml.js:104-106; the same in Swift). Document in NIGHT-ROLL.md's Learning table; nothing to code.
7. Pages in Normal mode still carry the view's estimated key signature — Export score's shipped behaviour, plan §4 says so; Josh's devices are Learning. Noted, not changed.
8. The native share sheet's temp folder (`tmp/export-<uuid>/`, Share.swift:182) is never cleaned; iOS purges tmp eventually. Fine for phase 1.

Owed before ship, as the branch's open-items line already says: Brave check of the sheet at phone width + a `.txt` and the pages opened, GP8 opening an exported `.musicxml` (eyes only), the iPad share sheet with several files.
