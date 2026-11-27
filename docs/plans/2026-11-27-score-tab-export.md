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
