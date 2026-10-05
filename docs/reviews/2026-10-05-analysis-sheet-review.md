# Review: docs/plans/2026-10-05-analysis-sheet.md

Reviewer: Opus subagent, 2026-10-05. Read: CLAUDE.md, the plan, open-items' request
entry (L7368), src/model/rollnotes.js, edits.js, selection.js, note-editor.js,
render/roll.js, input/gestures.js, ui/notes.js, ask/tools.js, session/song.js,
the v2 schema, tools/annotations.mjs + query-lib.mjs, build_help.mjs, the tests.

**Verdict: ship with fixes.** Option C is the right call, and the plan respects
"annotations + the .mid are the only real state". Two storage bugs would lose his
answers (findings 1–2). Fix them in S1 before any UI can write to the file. S0 (the
guide) can ship now.

## Findings

1. **BLOCKER: re-dictating a published answer gets lost on reload.**
   Evidence: the plan replaces the old answer with `dropSupersededBy` (§3a). That
   function only filters `S.rollnotes` and never tombstones the old entry
   (rollnotes.js:334-343). On reload, `loadNotes` brings back the repo copy
   (song.js:257-266). Then `mergeLocalAdditions` *skips* the new local answer,
   because its de-dupe key is `b1+q1+text` (rollnotes.js:450). For an analysis line
   the text is `analysis: summary.what done=1` whatever the body says. Result: he
   sees his old answer, and the new one is gone. Ticking does not trigger it,
   because `done` changes the text. Editing the body does.
   Fix: every sheet and Ask write calls `retireEdited(existing)` (edits.js:167,
   which tombstones the old entry) for the entry with the same `item`, then pushes
   the new one. `dropSupersededBy` stays only as a safety net. Also add `cnote` to
   the de-dupe key in `mergeLocalAdditions` for analysis entries. Test: take a
   synced (`added:false`) entry, change its body, save the local store, run the
   loadNotes merge, and expect the new body exactly once.

2. **BLOCKER: older builds silently delete analysis entries and drop `topic`.**
   Evidence: §3a says "an older app reads it as a text note at bar 1 — degraded, not
   broken". That is false. In an old build, `jsonToRawNote`'s `default:` branch reads
   `j.text` (rollnotes.js:80). An analysis entry has no `text`, so the result is "".
   `deriveNoteTypes` then drops it with `out.filter(n => n.text)` (rollnotes.js:189).
   If any stale client publishes after that (an iPad bundle not yet rebuilt, or a
   service-worker-cached tab), it rewrites the file without his answers. Old builds
   also never carry `topic`, so every filing tag is stripped the same way.
   Fix: (a) roll out reader first. S1 ships only parse/serialize support, nothing
   writes. Rebuild the iPad and wait for the deploy. Only then do S2/S3 write.
   (b) In S1, add forward-compat so this cannot happen again: an unknown `type`, or
   unknown fields on a known type, is kept verbatim (stash `j` on the raw note and
   write it back in `noteToJSONBase`). Alternative: use the version guard that
   already exists (`ROLLNOTES_MAX_VERSION`, rollnotes.js:97). That locks old builds
   read-only instead of letting them destroy data, but it is heavier.

3. **SHOULD-FIX: `isDirective` does not stop flags.**
   Evidence: `isDirective` has only two consumers, chrome.js:1165 and roll.js:212.
   The flag loop at roll.js:489 skips only `section/chord/chopdir`, so every analysis
   entry would draw a gold flag at 1.1 (up to 16 stacked). The flag tap test at
   gestures.js:866-868 takes the *first* note within 14 px. An analysis entry can
   therefore shadow the key marker at 1.1, whose tap opens the editor.
   Fix: skip `n.analysis` in both loops, and in `annoInLasso` (already excluded via
   `isCopyableAnno`). Add tests for both.

4. **SHOULD-FIX: the plan's list of places `topic` must ride is incomplete.**
   "Carried like `ai`" misses these:
   - `saveLocalNotes`' explicit field list (edits.js:75-78): an unsynced filed note
     loses its tag on reload.
   - The editor Save, which builds `fresh` from scratch in 8 type branches
     (note-editor.js ~760-825).
   - `askEditAnnotation`, which rebuilds the note through the text grammar
     (tools.js:404-417) and drops both `topic` and `ai`.
   - `askAddAnnotation`, which also parses the text grammar (tools.js:379-383), so
     `topic` must be set on `fresh` after parsing.

   Fix: name every one of these paths in S1/S3, with a test per path.

5. **SHOULD-FIX: Ask details missing from S5.**
   - `askNoteKind` (tools.js:185) must return `"analysis"`. Otherwise
     `edit_annotation` treats the entry as a plain note.
   - The compact line should keep the existing shape
     `i [at] kind: value — cnote` (tools.js:80).
   - S5's tool write must use the retire path from finding 1.
   - Reading is already automatic: full JSON goes through `askAnnotationsText`
     (tools.js:61).

6. **SHOULD-FIX (Learning): two problems.**
   - (a) The header jump chips ("Form 2/3 · Melody 0/3 …") are a coverage figure
     that is always on screen and never asked for. That is homework, and it
     contradicts the plan's own rule ("never … a coverage figure") and the
     2026-08-19 on-demand corollary. Fix: the chips show bare group names. Numbers
     appear only inside the Check coverage line.
   - (b) The plan contains Claude-written readings of Chaos Temple: the §3a summary
     ("every phrase ends on D or Cmaj7, so bar 1's Em keeps arriving"), the §2 row
     "question — ends on D", and "half — stops on D" at 4.4. None of these are his
     (checked against chaos-temple.rollnotes.json). They volunteer analysis in a doc
     he reads, and builders will copy them into fixtures. Fix: replace them with
     neutral placeholders (`"<your summary>"`) on a scratch song.
   - Check coverage itself is compliant. It runs on demand, counts only his ticks,
     tags and annotation types, and stops when the sheet closes. Keep the spy test
     on `estimateKey` and `hmCadences`.

7. **SHOULD-FIX: the fixture numbers are wrong and the source is a moving target.**
   Chaos Temple has **16** chord bands, 3 of them with notes, so the line should read
   "13 of 16". The plan says 18 and "15 of 18", and S2's tests hardcode those
   numbers. The file also changes as he annotates (commit 4212c40b today). Fix: test
   against a frozen copy in tests/fixtures/, and compute the expected numbers from
   that copy.

8. **SHOULD-FIX: the new names sit beside Normal-only estimate code.**
   - Already in the codebase (Normal-only): `#analyzesheet` / `openAnalyzeSheet`
     (index.html:706, sheets.js:305), `vwAnalyze`, `S.analysisOn`,
     `analysisAvailable()`, `src/gen/analysis.js`.
   - The plan adds: `#analysissheet`, `vwAnalysis`, `src/ui/analysis.js`.

   Each new name is a letter or two from Normal-only code. A builder who picks the
   wrong one, or wraps the sheet in `analysisAvailable()`, either hides his sheet in
   Learning or leaks estimates. Fix: use a distinct stem (e.g. `#studysheet`,
   `src/ui/study-sheet.js`). Josh picks the visible label from 2–3 options
   (propose-UI-wording rule).

9. **SHOULD-FIX: the answer box can save into the wrong song.**
   It "saves when the box closes". But album runs auto-advance songs, and
   `loadNotes` swaps `S.rollnotes` while the box is still open, so a late save lands
   in the next song. Fix: record `S.songKey` when the box opens. On save, if the key
   no longer matches, keep the text as a device-local draft instead of writing. Also
   refuse writes when `S.rollnotesReadOnly` or `LINK_SONGS` is set (the editor's
   guard, note-editor.js:842).

10. **SHOULD-FIX: existing tests and schema checks will fail and must be updated in
    the same step.**
    - The schema's per-note `additionalProperties:false` (schema.json:115) needs
      `item`, `done`, `topic` and the `analysis` type.
    - The TYPES list at night-roll.test.mjs:10789 needs `analysis`.
    - The help tab count assert (`8` at :4239) goes up by one.
    - Two fileCount asserts in modules.test.mjs (:349 = 88, :551 = 97) go up.
    - `build_help.mjs:35` parses `.hsec` with a strict regex: exact
      `<div class="hsec" data-hsec="x">` and a closing `\n    </div>`. S0 must not
      nest a `</div>` at that indentation.

11. **SHOULD-FIX: tools/annotations.mjs and the plan disagree.**
    The plan says tools/annotations.mjs prints the entries. It does print them, but
    as type `text` (typeOf, annotations.mjs:15), and query-lib.mjs:62 drops
    `analysis` and `topic`. Add both so a web session can read the sheet
    (WEB-SESSION.md line).

12. **SHOULD-FIX: help and docs ship late.**
    S2 ships a user-facing window, and its help entry, drift keyword and docs wait
    until S4. That breaks the shipping checklist (every feature push carries them).
    Fix: S2 carries its own `<dt>` and keywords. S4 keeps only the folds and the doc
    sweep.

13. **NIT: song-level entries get moved by bar edits.**
    `insertTime`/`closeGap` (selection.js:463), `shiftAnchors` and `convertAnchors`
    move the [1,1] entries. The sheet must find entries by `item`, never by anchor.
    Better: skip `n.analysis` in those loops, the way `shiftAnchors` skips `chopdir`.

14. **NIT: an unticked entry with no text should be removed** (retired), not written
    as `done=0` with an empty body.

15. **NIT: an empty ANALYSIS chip in All notes would open the editor.**
    In All notes, an empty group's chip opens the editor preset to that type
    (notes.js:153-170), and the editor has no analysis type. Make the ANALYSIS chip
    open the sheet instead.

16. **NIT: the S2 Learning-net test needs a narrower scope.** "No pitch/chord/key
    name" must check the *folded* sheet. The cloned guide text contains "V to I" by
    design.

17. **NIT: §6's three questions go into open-items** as numbered Q-items under
    QUESTIONS FOR JOSH.

18. **NIT: check the iPad layout.** A 380 px dock on a ~1000 px iPad leaves about
    620 px of roll, and the long prompt lines wrap. Check at 1000 px and at the
    dock's minimum width.

## Cut for v1

- **S3 (File-under chips + `topic`):** defer until he has used the sheet. It touches
  six write paths (finding 4) and adds a row to his busiest editor. Without it,
  located prompts list by type, and Check coverage counts his ticks and type counts.
  That still answers "tell me what I'm missing" from his own work.
- **S5 writing kind:** defer. Reading already works. Keep the one prompt sentence and
  the `askNoteKind` fix.
- **The jump chips' fractions:** remove (finding 6a).
- **The View ▾ → Panels toggle:** optional; ☰ Notes ▴ is one tap. Keep it only if
  it is free.

## Step table

| Step | Label | Why |
|---|---|---|
| S0 guide | EASY (Sonnet) | Markup and prose in existing patterns. The main session must still read the prose for Learning compliance before it ships. |
| S1 model | TRICKY (Fable) | Data safety: tombstone/merge (f1), forward-compat (f2), every carry path (f4); reader-first rollout. |
| S2 window | TRICKY (Fable) | wm docking, song-switch draft (f9), read-only guard, Learning nets, coverage. Could split into S2a list-only (EASY) and S2b writes + coverage (TRICKY). |
| S3 filing (if kept) | EASY (Sonnet) | Mechanical once S1 names every path; chip row follows existing chip patterns. |
| S4 folds + docs | EASY (Sonnet) | Clone from the help DOM plus a doc sweep; help/drift move into S2 (f12). |
| S5 Ask | EASY (Sonnet) | Small, spec'd: `askNoteKind`, compact line, one sentence; write kind deferred. |

Order: S0 → S1 → deploy + iPad rebuild (wait) → S2 → S4 → (S3, S5 after Josh
uses it). Every step: `npm test` under the alarm, `tools/split/check.mjs`, and
browser checks on a scratch song only.
