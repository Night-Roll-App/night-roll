# Plan: "✦ Annotate this song for me" — Normal mode only

Status: draft → **Fable-reviewed 2026-10-04 (this version)** → Fable build.
Spec source: open-items "QUEUED IDEA (Josh, 2026-09-27)" (L1614) + the
overnight-plan ruling (L5878): Normal mode ONLY, on-demand per tap, never
volunteered, AI-written annotations tagged, reviewable, clearable in one go;
MIDI-derived songs only (chip imports included); audio tracks have no notes.

## Learning mode (CLAUDE.md: Learning never seeds analysis)
- The menu item is ABSENT in Learning, not dimmed — the same mechanism as `vwAnalyze` (src/ui/chrome.js L589–593: `style.display = analysisAvailable() ? "" : "none"`). The item goes in the Mode row right under `vwAnalyze` (index.html L2306) as `vwAnnotate` "✦ Annotate this song…".
- No new ASK tool: `ASK_TOOLS` (src/ask/tools.js) and `askToolsNow` are untouched, so "tool absent" and "context free of it" hold by construction — the job never goes through the chat (`askRun`), it calls `aiProvider().chat(...)` directly with its own system prompt and `tools: []`.
- The runner re-checks `analysisAvailable()` and refuses in Learning even if called from the console/e2e.
- Normal mode: the sheet's title and status say "AI estimates"; nothing is written until the Run tap.
- Josh's rule "nothing from Normal mode may leak into Learning's UI/AI context/repo files": an annotation written here is real song state (he tapped). The `ai` tag makes them identifiable; the Notes list shows a "✦ AI" badge; Clear removes them in one undo step. Claude sessions with Josh never run this on his songs without his per-instance ask.

## Flow (real names)
1. View ▾ → Mode → "✦ Annotate this song…" → `#annotatesheet` (new overlay in index.html, same shape as `#viewsheet`'s sub-sheets): checkboxes Sections / Chords / Key, a note "Writes AI estimates as annotations; one undo; Clear AI annotations removes them all", Run, Clear AI annotations, status line. No native dialogs (appConfirm for Clear when > 0 exist).
2. Gate (refuse with a reason in the status line): `analysisAvailable()`; `S.song`; ≥ 1 non-audio track with notes; `!S.rollnotesReadOnly` (docs/annotations-v2.md version guard); `!LINK_SONGS`.
3. Context = the song's notes in the compact bar format (`askSpanNotesCompact`, src/ask/context.js) for ALL bars (capped by `askBudget()`; if it does not fit, run in bar windows and merge) + the theory FACTS output as grounding (`factsProvider(doc)` — a parameter; default `null` until src/theory/facts merges, then `formFacts`/`bassFacts`/`patternFacts` from the toolkit).
4. `aiProvider().chat({system: ANNOTATE_SYS, messages: [...], tools: []})` runs inside `jobStart("annotate", …)` (src/ui/sheets.js L983) so the footer ⏳ shows it and ✕ aborts. ANNOTATE_SYS asks for ONLY a JSON object: `{"sections":[{"from_bar":1,"to_bar":8,"label":"A"}],"chords":[{"bar":1,"beat":1,"end_bar":1,"end_beat":4,"symbol":"Am"}],"keys":[{"bar":1,"name":"A minor"}]}`.
5. Validate (src/ask/annotate.js, pure functions, every failure named, nothing written on any failure — the `write_notes` discipline): JSON parses; bars within `askBarsCount()`; beats within the bar's beats; `parseChordSym(symbol)` non-null (src/theory/chords.js); `keyNameToSf(name)` defined (src/theory/key.js); labels ≤ 40 chars; sections non-overlapping among themselves.
6. Overlap rule: skip an estimate whose span overlaps an existing NON-ai annotation of the same kind (section/chord band/key region); report "skipped N (yours)" in the status.
7. Write: snapshot `serializeRollnotes()`; for each accepted estimate build the text-grammar line the editor uses (as `askAddAnnotation` does: `[bar.beat - end]` + `section: …` / `chord: …` / `key: …`), `parseRollnotes` → `resolveNote` → set `n.ai = {model: askModelName(), at: ISO}` → push; then `finalizeNotes()`, `saveLocalNotes()`, `pushUndo({kind: "anno", json: before})` ONCE (the tools.js L556 pattern) → one undo step. `draw()`, `updateSongBtn()`, `updateSyncBtn()`.
8. "Clear AI annotations": every `n.ai` note removed through the same delete path the editor uses (tombstones for published ones — reuse `askDeleteAnnotation`'s removal path per note), one `pushUndo` for the batch.

## Persistence of the tag
- `.rollnotes.json` v2 per-note objects allow extra fields (docs/annotations-v2.schema.json L48 `additionalProperties: true` — builder confirms it is the note object). Add optional `ai: {model, at}` to `noteToJSON`/`jsonToRawNote` (src/model/rollnotes.js) so it round-trips; document it in docs/annotations-v2.md "notes" + the schema. The legacy v1 TEXT grammar has no slot — v2 JSON only (all 1196 files are v2 since 2026-10-01).
- Never in localStorage beyond the normal unsynced-notes store (`ff1roll-notes-*`) — annotations are song state.

## Files
src/ask/annotate.js (NEW → index.html modulepreload, sw.js `APP_MODULES` + `SW_VERSION`, src/devtools.js, modules.test fileCount), index.html (menu item, `#annotatesheet`, help entry under data-hsec="ask" — touch gesture first), src/ui/chrome.js (`renderViewMenu` + `on("vwAnnotate")`), src/ui/notes.js (badge), src/model/rollnotes.js (ai round trip), docs/annotations-v2.md + schema, tests, NIGHT-ROLL.md ("✦ Annotate this song" section), docs/HELP.md via build_help, FEATURES keyword `"Annotate this song"`, open-items (close the QUEUED IDEA).

## Tests
- vm (tests/annotate.test.mjs, in tools/run-tests.mjs FILES): validator good/bad JSON (bar out of range, bad chord symbol, unknown key name, overlapping sections) → nothing written, error names the item; tagging + ONE undo restores the exact previous rollnotes; clear-all removes only `ai` notes, one undo; overlap skip; `noteToJSON`/`jsonToRawNote` round-trip of `ai`.
- Learning: `renderViewMenu()` in Learning → `#vwAnnotate` display none; the runner throws "Normal mode only"; `askToolsNow()` unchanged (snapshot of tool names before/after).
- Integration (tests/ai.test.mjs style, fake OpenAI-compatible server): the request carries the song's bars and NO `<context>` chat block; the server returns the JSON above; annotations land tagged; a second run skips the user's own band.
- e2e: none required (no gesture); smoke in CI.

## Depends on
- Theory facts merged (grounding) — else build with `factsProvider = null` and wire after (one-line change + a test that facts text appears in the request).
- AI library step 3 (`aiProvider` delegate stays a bare name — safe either way). ORDER.md puts this after AI-lib step 6 because both edit src/ask/*, index.html's sheet area and the module manifests.

## Verification
`npm test`; `node tools/split/check.mjs`; `node tools/package.mjs --check`; `node tools/build_help.mjs`; main session: Normal mode on a SCRATCH song (never albums/compositions/) — run, see bands, undo, clear; flip to Learning: item gone, badges still show (they are song state) — then switch back and Clear before leaving the scratch song; iPad build.

## Risks
- Writing on Josh's songs: the tap is the approval, but the help text must say what it writes; Claude sessions never trigger it for him.
- Token budget: a long capture (300 s) exceeds `askBudget()` — the windowed run is required, not optional.
- A model that ignores the JSON instruction → the validator rejects; status says "no usable reply", nothing written.
- Tombstones on Clear for published ai notes — reuse the editor's path or published copies resurrect on reload (Bugs found, provenance-plan P0).

## Out of scope
Audio-only songs; a Learning-mode variant; roman numerals (harmony toolkit) — a later checkbox.
