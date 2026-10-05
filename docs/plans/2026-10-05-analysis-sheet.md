# Plan: the Analysis sheet — one place per song for the whole analysis

Status: draft (Fable advisor, 2026-10-05) → Josh reads → Fable review → Fable build.
Josh's ask (speech-to-text): "an analysis sheet for every song … a checklist like
all the things you mentioned, or different sections where I could fill out all
that stuff … we already have the annotations, so maybe reference those … a
centralized place where I can have all the analysis … the notes you just gave me
about what comes in an analysis should be available on the sheet." Follow-up
(Terminal #130): could all of this be handled in annotations? He rarely writes
about rhythm.

## 0. The analysis guide — required whatever happens to the sheet (ships first)

Josh (Terminal #133): "I still need some sort of analysis directions … not a
checklist that I fill in — it's just here's all the things that analysis needs.
And I read that and mentally make sure I check them all off in my annotations …
with maybe deeper explanations of each thing … something that can help me learn
how to get better at analysis."

**Where it lives.** A new tab in the Help sheet, **Help → Analysis**
(`data-hs="analysis"` button in index.html's `#helptabs`; the body is a new
`.hsec data-hsec="analysis"` in help/help.html, the file every other help tab
already loads once and keeps offline). `node tools/build_help.mjs` then puts the
same text in docs/HELP.md, so he can read it on GitHub or anywhere without the
app. It is plain reference text — generic, never about the open song — so
Learning mode has nothing to object to.

**How it is reached** (touch first): ☰ Notes ▴ → **Analysis guide** (one tap;
`openHelp("analysis")` already exists); Help → Analysis tab; and, if the sheet
ships, each section's "What to look for ▸" fold shows that section's part of the
guide. Keyboard: the Help sheet's tab strip is already keyboard-reachable.

**Outline and depth.** One screen at the top, then depth below it:
1. *The one-screen list* — the sixteen things an analysis covers, grouped Form /
   Harmony / Melody / Texture & rhythm / In the game / Summary, one line each, in
   the order a working analyst takes them (form first, because every other item
   is "per phrase"). This is the part he reads and mentally ticks.
2. *One section per group*, 250–450 words each, same four headings every time so
   it is skimmable: **What to find** (the concept, in plain words); **How to find
   it in Night Roll** (the actual tools: ruler drag + section bands for phrases,
   the Chord? lasso and chord bands for harmony, `find:` to light one pitch for
   motif hunting, the Circle of fifths for key relations, spanned text notes for
   bass lines and tension, the notes strip to read while it plays); **How to
   write it down** (which annotation carries it: a section with a note, a chord's
   attached note for its numeral, a text note at the cadence beat, one note per
   motif return); **Common mistakes** (naming chords without saying their job;
   calling every repeated idea a motif; counting a pickup as a bar; stopping at
   the key and never writing the cadence). Terms link to docs/learning/
   glossary.md's entries (cadence, motif, Roman numeral, Phrygian cadence…).
3. *Getting better* — a short ladder, not a syllabus: analyse one song with ONE
   group only (all cadences, nothing else), then the next with two; re-read an
   old song's notes a month on and add the numeral to every chord; compare two
   songs by the same composer side by side (the album list makes this a tap);
   five generic questions worth asking the AI tutor ("where does this phrase
   rest, and is that open or closed?") that stay inside Learning's rule.
4. *Worked example* — one eight-bar GENERIC progression written out as an
   analyst would (a made-up I–V–vi–IV loop, no game named): the form line, the
   numerals, the cadence labels, the bass line, the two-sentence summary. Shows
   the finished shape without touching any song of his.

Roughly 2,500–3,000 words in all; the §5 S4 draft paragraphs are the seed for
part 2. Builder unit **S0** below: help/help.html + the tab button + drift
keyword `"Analysis guide"` + `build_help` + a glossary pass + a one-line NIGHT-
ROLL.md note. No app code beyond the drop-up item; it can ship the same day,
before any decision on the sheet.

## 1. Three ways to build it, and the one I recommend

I looked at what his analysis actually looks like in the files before deciding.
Airship: 38 chord bands, two keys, two sections, and seven text notes — the key
argument ("I'm second-guessing the key being F…") parked at bar 1.1, "Bass is all
8th notes…" at 1.1, "First time the chord rhythm changes" at 15.2. Chaos Temple:
the best harmony reading ("Neapolitan from Phrygian. Goes to Dsus4, not the
dominant") is a comment ON the F chord band; "Tension fades by step" is a comment
on the Turn section. So: most of his analysis is already bar-anchored, and the
annotation types carry it well. What has no home today is the song-level
statement — airship's key argument and the bass-texture note sit at bar 1 only
because every note needs a bar, and from there they show as a gold flag and roll
past as a subtitle.

Now go down the five categories and ask where each item naturally lives:

| Item | Lives at a bar? | Carried today by |
|---|---|---|
| Sections, phrase lengths, how phrases pair | yes (a span) | section bands, nested, with a note |
| Roman numerals | yes (a chord) | a chord band's attached note ("V7/ii") |
| Cadences | yes (a beat) | a text note or a section's note |
| Bass line as a melody; tension/release | yes (a span) | a spanned text note |
| Scale degrees landed on; melodic shape | yes (a phrase) | a spanned text note |
| Motifs that return changed | yes (each return) | text notes, one per return |
| Which voice has the tune / harmony / bass | mostly song-level | nothing (a bar-1 note) |
| Rhythm, the groove | song-level, breaks at bars | nothing + a text note at the break |
| What it does in the scene | song-level | nothing |
| Summary; comparison with the composer's other pieces | song-level | nothing |

Twelve of sixteen are annotations already. Four are not, and neither are the
reference text nor a checklist. So the three options:

**A. A separate form** (sixteen boxes per song). Rejected. It pulls bar-located
analysis away from the bars where he writes it best, doubles his typing, and a
form with sixteen empty boxes on 1,200 songs reads as homework — an empty box is
one word away from "you haven't done this yet", which Learning mode forbids.

**B. Annotations only — no window.** His question, taken literally: new typed
annotations (a numeral field on chords, a cadence marker, a motif label, a phrase
span) and nothing else. Honest answer: for storage this is right and the plan
below does exactly that — every byte lives in `.rollnotes.json`. But three things
do not fit a bar: the four song-level items have no home except bar 1's flag; the
reference text ("what to look for") has no place to be read; and a checklist is a
view, not a note. And each new typed annotation only pays for itself when the app
DRAWS it (numerals on bands, cadence marks in the ruler) — real features, each its
own plan, none needed to write the analysis today: a chord's attached note already
holds "V7/ii", a text note already holds "half cadence". New types for their own
sake are the worst of both: more editor rows, nothing shown.

**C. Annotations + a grouped view (recommended).** Keep writing analysis where it
happens — on bands and bar notes — and add ONE new note type for the four
song-level items and the ticks, ONE optional tag so a bar note can be filed under
a prompt, and a WINDOW that groups it all by the five categories, with the generic
reference text folded under each. The window never computes anything about the
music; it only sorts his own notes and shows his own ticks. Example on Chaos
Temple: Form shows his bands "A 1.1–8.4, B 9.1–14.4, Turn 15.1–16" and the
Turn's note; Harmony shows "key: Em", "18 chord bands ▸", and his F-chord comment
filed under Cadences; Scene and Summary show an empty box each; "What to look
for ▸" under Harmony opens the paragraph on cadences. He taps Summary, dictates
two sentences, taps Done — one new line in chaos-temple.rollnotes.json.

On rhythm: he rarely writes about it, which is exactly what a prompt with the
reference text folded under it is for — and a prompt is all it should be. No
nudge, no count, no "0 rhythm notes". (Airship's "First time the chord rhythm
changes" at 15.2 shows he does write it when he hears it.)

Follow-ons this plan deliberately leaves out, each a plan of its own if he wants
it: numerals DRAWN on chord bands (a `numeral` field + band rendering; in
Learning only ever his, in Normal the harmony toolkit could estimate); cadence
marks in the ruler; motif labels coloured like chords (same label = same colour).

## 2. Where it lives and what it looks like

Access (touch first): footer **☰ Notes ▴ → Analysis sheet** (a third item in
`#notesmenu`, with "+ New note" and "All notes"), and **View ▾ → Panels → Analysis
sheet** (a toggle like Mixer: `set("vwAnalysis", …)` in `renderViewMenu`). No new
keyboard shortcut; the View menu is keyboard-reachable. The window is
`#analysissheet`, registered `makeWindow("analysissheet", {dockable: true})`
beside asksheet/notelistsheet, so on the iPad it docks as a TAB in the same
right-hand group as the AI window (wm.js phase B tab groups); dock state is
device-local like every window. Mockup at a 380 px dock:

```
┌ ANALYSIS — Chaos Temple ──────────────── Dock ▸  ✕ ┐
│ Form 2/3 · Harmony 1/5 · Melody 0/3 · Texture 0/3 · Summary 0/2 │  ← jump chips; the fractions are HIS ticks
├────────────────────────────────────────────────────┤
│ FORM                              What to look for ▸│
│  ☑ Sections                                      +  │
│     ■ A      1.1–8.4                                │  ← his bands (tap = jump to the bar + open its editor)
│     ■ B      9.1–14.4                               │
│     ■ Turn   15.1–16   ✱ No B in bars 15 and 16…    │
│  ☑ Phrase lengths and how they pair              +  │  ← a LOCATED prompt: his notes filed here, + adds one
│     ✱ 1.1–4.4 "question — ends on D"                │
│  ☐ Phrases that repeat with a changed ending     +  │  ← empty: tick box, prompt, +. Nothing else.
├────────────────────────────────────────────────────┤
│ HARMONY                           What to look for ▸│
│  ☐ Key and chords                                 + │
│     key: Em  bar 1                                  │
│     ▸ 18 chord bands                                │  ← collapsed; open = the rows All notes shows
│  ☐ Roman numerals (chords by their job in the key)+ │
│  ☑ Cadences — where phrases rest, and what kind   + │
│     ✱ 14.1 chord F "F is not in the key… Neapolitan"│  ← a chord comment he filed here
│  ☐ The bass line as its own melody                + │
│  ☐ Where tension builds and releases              + │
├────────────────────────────────────────────────────┤
│ MELODY  (located prompts: degrees · shape · motifs) │
│ TEXTURE & RHYTHM                                    │
│  ☐ Who carries the tune / harmony / bass   [answer] │  ← a SONG-LEVEL prompt: tap = dictate
│  ☐ Rhythm and groove                       [answer] │
│  ☐ What it does in the scene               [answer] │
│ SUMMARY                                             │
│  ☐ What the piece does and why it works    [answer] │
│  ☐ Compared with the composer's other work [answer] │
├────────────────────────────────────────────────────┤
│ ▸ Bar notes not filed under a prompt (3)            │
└────────────────────────────────────────────────────┘
```

Two kinds of prompt row, one table (`ANALYSIS_TOPICS` in the new module; the
ids are stored, so they never change once shipped):

- **Located prompts** (form `sections`, `phrases`, `pairing`; harmony `chords`,
  `numerals`, `cadences`, `bass`, `tension`; melody `degrees`, `shape`,
  `motifs`): the row lists his annotations that belong there — by TYPE for
  `sections` (section bands) and `chords` (key lines + chord bands), by his own
  FILING tag for the rest — and its **+** opens the ordinary annotation editor
  at the cursor/ruler selection with that prompt pre-selected in the "File under"
  chips (§3b). Example: cursor on 4.4, tap + beside Cadences → editor opens, type
  Text note, chips show Cadences lit, he dictates "half — stops on D", Save. A
  normal bar note, visible on the roll, listed here.
- **Song-level prompts** (texture `roles`, `rhythm`, `scene`; summary `what`,
  `compare`): the row has an answer box. Tap → an inline box with the editor's
  Speak button (`SPEECH`, `micStop`); saves on Done or when the box closes, one
  undo step (`pushUndo` kind "anno", the editor's pattern).

Every row has a tick. One tap toggles it; a prompt may be ticked with no text
(the bar notes cover it). The app never sets a tick.

**The Learning-mode line, argued both ways.** "18 chord bands" and "0 cadence
notes" are different claims. The first counts a type HE wrote — a fact about his
notes, the same number ☰ All notes' jump bar shows ("CHORDS 38") — keep it. The
second needs the app to decide what counts as a cadence note, and its natural
wording ("none yet") is a nudge about his analysis — a volunteered verdict. Rule
for the build: counts of annotation TYPES only; an empty prompt shows the prompt,
the tick box and +/answer, never "missing", "yet", "gap", a coverage figure, or a
bar count the app worked out. The jump chips' "1/5" counts his ticks. The sheet
reads `visibleNotes()`, so in Learning an ✦ AI-estimate band is absent here as
everywhere; Normal shows the identical sheet and adds nothing.

**"Tell me what I'm missing" (Josh, Terminal #136) — yes, on demand, with one
hard edge.** CLAUDE.md's corollary (2026-08-19) allows fact reports he asks for;
"Check vs file" and "Check labels" are the precedents: a button, never a badge,
wording that reveals nothing he did not write. So the sheet gets a **Check
coverage** button in its header. Tap → one line in the sheet's status, cleared
when the sheet closes, never shown unasked, never a count on the footer:
"Nothing filed or ticked under: cadences, motifs, rhythm, scene, summary. 14 of
18 chord bands have no note." Everything in that sentence is computed from HIS
ticks, HIS filing tags and the TYPES of his notes — the same arithmetic the jump
chips do, said once, when asked. The edge: it never reads the music. It will not
say "bar 8 is a half cadence you didn't mark" or "the triangle has a motif in
bars 5–6" — that is the app analysing the song, forbidden in Learning whatever
the mode of the ask. Two honest consequences: (1) the report can only be as good
as his filing — a cadence written as a bare text note he never filed counts as
"nothing under cadences", which is why the chips and the sheet's + exist; the
report says so in its last words ("— file a note under a prompt to count it").
(2) The music-aware version he is picturing ("you have chords but never marked
the V–I at bar 8") exists in two legal forms only: asking the AI tutor, which
has his notes and the bars in context and answers under Learning's RULE (hint
first, plain answer if he insists); or, later, Normal mode's harmony toolkit
(`hmCadences`, Normal-only by design, labelled an estimate, never leaking into
Learning). Neither is this button. Example: on Chaos Temple today the button
would say "Nothing filed or ticked under: phrases, numerals, cadences, bass,
tension, degrees, shape, motifs, roles, rhythm, scene, summary, compare. 15 of 18
chord bands have no note." — long, true, and entirely about his notes; two
minutes of filing his existing F-chord and Turn comments shortens it.

## 3. Storage — annotations only; one new type, one new field

Everything on the sheet is a note in `<song>.rollnotes.json` (v2,
docs/annotations-v2.md). Nothing in localStorage beyond the normal unsynced-notes
store. Publish needs nothing new: these are notes like any other — counted
unsynced, written by `serializeNotesList`, tombstoned on delete, printed by
`tools/annotations.mjs` for a web session.

**(a) New note type `analysis`** — one line per prompt that has a tick or an
answer, anchored at [1,1] because a note needs an anchor, never drawn:

```json
{"at":[1,1],"type":"analysis","item":"summary.what","done":true,"note":"A loop that never lands: every phrase ends on D or Cmaj7, so bar 1's Em keeps arriving."}
```

Round trip the way `track:` does (text prefixes are truth): `jsonToRawNote` →
text `analysis: summary.what done=1` with the body as the attached note;
`deriveNoteTypes` sets `n.analysis = {item, done}` (`analysis` joins the `typed`
regex so the body splits into `cnote`); `noteToJSONBase` writes `type/item/done/
note` back. `isDirective` returns true for it, so the roll draws no flag, the
subtitle skips it (render/roll.js L211), `hasNotes` (chrome.js L1165) ignores it.
`dropSupersededBy`: a fresh entry drops an existing one with the same `item` —
re-dictating never stacks (the chord-on-the-same-span rule). An older app reads it
as a text note at bar 1 (the `default:` branch) — degraded, not broken. Schema:
`analysis` in the type enum; `item` (string) and `done` (boolean) on the note.

**(b) Optional `topic` on any OTHER note** — the filing tag. `"topic":
"harmony.cadences"` on a text note, chord, section or key means "list me under
that prompt"; the note stays exactly where it is on the roll. Example: airship's
bar-1 key argument filed under `harmony.chords` appears in the sheet's Harmony
list with "bar 1" beside it. Written by one chip row in the annotation editor
("File under", `#ntopic`, one tap, optional, nothing lit by default; the sheet's
+ pre-lights one); carried like `ai` is (`noteToJSON`/`jsonToRawNote`, the local
store, `annoSnapshot`). Unfiled text notes appear in the sheet's last fold, "Bar
notes not filed under a prompt (N)" → tap → editor → file it. The legacy v1 text
grammar gets neither field (every file has been v2 since 2026-10-01); the
format-identity test covers the `analysis:` text line only.

## 4. The AI (Ask)

- **Reading — yes, automatically.** Sheet entries are his own words and already
  reach the context: `askAnnotationsText` sends full JSON; the bridge's compact
  form gets one line `12 [1.1] analysis summary.what ✓: A loop that never
  lands…` (two lines in `askAnnotationsTextCompact`/`askNoteValue`; a filed note
  gains ` (filed: harmony.cadences)`). One sentence joins `ASK_SYS_BASE2`:
  "analysis entries are the user's own answers on the song's Analysis sheet —
  build on them; never write, change or tick one unless the user asks for that
  exact entry." Learning's RULE text governs the rest.
- **Writing — only when he asks for that entry.** `add_annotation` gains kind
  `analysis` (`item`, `done`, `text`) and an optional `topic` on the other kinds;
  the existing "only when the user explicitly asks" wording covers it. Example:
  "put that in my summary" → one tool call, one line, undoable, lands unsynced.
  "Fill in my sheet" in Learning gets the usual answer: hints first, his findings.
  Claude sessions with Josh follow the same rule: never fill his sheet unasked.

## 5. Implementation steps (each a builder unit; files; tests)

Hot files several lanes touch — merge one at a time (ORDER.md rule): sw.js,
index.html's modulepreload list, src/devtools.js, tests/modules.test.mjs
fileCount, the help sheet + FEATURES list, src/state.js, tests/boot-order.test.mjs.

**S0 — the analysis guide (independent of everything below; ships first).**
`help/help.html` (the `analysis` `.hsec`, §0's four parts, one `<dt>` per group
with `data-topic` on its `<dd>` so S4 can clone a part), index.html (`#helptabs`
button "Analysis"; `#notesmenu` item `#notesguide` "Analysis guide" →
`openHelp("analysis")` in notes.js's `initNotes2`), the annot tab's `<dt>Analysis
guide</dt>` line, FEATURES keyword `"Analysis guide"`, `node tools/build_help.mjs`
(docs/HELP.md gains the tab; check its tab-order regex picks the new button up),
docs/learning/glossary.md links, NIGHT-ROLL.md one paragraph. Tests: the existing
help-sheet tests (tab count, `helpSource()` keywords, HELP.md regenerated = no
diff) plus a Learning net on the fragment: the analysis section names no song
from `S.CATALOG` and no FF title. Main session eyeballs the tab at iPad width.

**S1 — model.** `src/model/rollnotes.js` (type `analysis` in `jsonToRawNote`,
`deriveNoteTypes`, `noteToJSONBase`, `isDirective`, `dropSupersededBy`; `topic` in
`noteToJSON`/`jsonToRawNote`), `docs/annotations-v2.schema.json`,
`docs/annotations-v2.md` ("notes" paragraph), NIGHT-ROLL.md ".rollnotes format".
Tests (tests/night-roll.test.mjs, beside "rollnotes round-trip"): JSON → parse →
serialize byte-identical for an analysis line and for `topic` on each type; same
`item` replaces; `isDirective` true → the subtitle function and `hasNotes` skip
it; `[1.1] analysis: summary.what done=1` in the text grammar parses to the same
object (format identity).

**S2 — the window.** New `src/ui/analysis.js` (layer ui; imports `visibleNotes`,
`openEditor`, `pushUndo`, `saveLocalNotes`, `finalizeNotes`, `draw`, the editor's
speech helpers; exports `ANALYSIS_TOPICS`, `analysisGroups(notes)` — pure: notes →
per-prompt {auto, filed, entry}, `renderAnalysis`, `openAnalysis`/`toggleAnalysis`,
`initAnalysis1`). index.html: `#analysissheet` overlay with `#analysissheet-h2`
and a `#analysissheet-home` wrapper (asksheet's pattern), `#notesanalysis` in
`#notesmenu`, `vwAnalysis` in the Panels row, the modulepreload line.
`css/app.css` (reuse `.notegroup/.ghead/.noterow`; new `.aprompt`, `.atick`,
`.aanswer`). `src/ui/wm.js` (`makeWindow`), `src/ui/chrome.js` (`renderViewMenu`
set + `on("vwAnalysis")`), `src/main.js` (`initAnalysis1()` after `initNotes3`),
sw.js (`APP_MODULES` + `SW_VERSION`), `src/devtools.js`, tests/modules.test.mjs
fileCount, tests/boot-order.test.mjs snapshot; re-render wherever `renderNoteList`
is re-run (notes.js L406/L507, sheets.js L1221) and after `finalizeNotes`. Tests:
`analysisGroups` on the chaos-temple fixture → 3 bands under `form.sections`, 1
key + 18 chords under `harmony.chords`, a `topic:"harmony.cadences"` chord under
that prompt, the rest unfiled; a tick writes exactly one analysis line and one
undo restores the previous `serializeRollnotes()`; the Learning net — render on a
song with NO annotations and assert the sheet's text has no pitch, chord or key
name and none of `missing|yet|gap|%|bars long` (the `fileCheckLine` spy-test
style); `analysisCoverage(notes)` (pure) on the chaos-temple fixture names every
unfiled prompt and "15 of 18 chord bands have no note", and its text is empty
until the button's handler runs (a spy on `estimateKey`/`hmCadences` proves the
check never touches the music); Learning with an `ai` band present → absent; wm: `wmSetSide` round trip
with "analysissheet" (the notelistsheet tests); `docking.spec` WINDOWS gains it
(CI only).

**S3 — filing + All notes.** `src/ui/note-editor.js` + the editor markup: the
"File under" chip row (`#ntopic`; `openEditor(note, presetType, {topic})` pre-lights
one), saved with the note; `src/ui/notes.js`: `NOTE_GROUPS` gains `{title:
"ANALYSIS", match: n => n.analysis}` before TEXT NOTES (so "All notes lists every
annotation" stays true); its rows open the sheet at that prompt instead of the
editor. Tests: save with a chip → `topic` in `serializeRollnotes()`; `topic`
survives an edit that changes only the text; the ANALYSIS group's count.

**S4 — the sheet's folds + help + docs.** The sheet's "What to look for ▸" calls
`ensureHelpLoaded()` and clones `#helpbody .hsec[data-hsec="analysis"]
[data-topic="harmony"]` out of S0's guide — one source, one fetch, offline
through the existing precache, nothing duplicated. The annot tab gets
`<dt>Analysis sheet</dt>` (☰ Notes ▴ → Analysis sheet first, View ▾ → Panels
after; what is stored; ticks and answers are yours; "File under"; Check coverage counts your
filing and ticks, never reads the music). FEATURES drift keywords: `"Analysis
sheet"`, `"File under"`, `"Check coverage"`. Doc sweep: NIGHT-ROLL.md "Analysis
sheet" section; WEB-SESSION.md (a session reads the sheet's lines via
tools/annotations.mjs); README.md one line if it lists features;
docs/learning/glossary.md — add "phrase pairing (antecedent / consequent)" as
encountered; open-items: close this item, record the decisions. Seed text for
S0's "What to find" paragraphs (learner-level, generic, no song named; the
builder expands each to §0's four headings):
- Form: Find where the music starts over or changes idea; those are sections.
  Count each phrase in bars — most game loops use 4 or 8, and an odd length is
  worth a note. Phrases often come in pairs: a question that ends open and an
  answer that closes, or the same phrase twice with a changed ending. Write the
  plan as letters (A A' B A) with the bar counts.
- Harmony: Chord names are the surface. A Roman numeral says what job a chord
  does in its key (I is home, V pulls home, IV leans away) — the same job sounds
  the same in any key. A cadence is where a phrase rests: on V it feels open
  (half), V to I closes (authentic), IV to I is softer (plagal), V to vi dodges
  (deceptive). Follow the lowest voice as a tune of its own — a bass walking down
  by step is a plan, not an accident. Mark where the pull is strongest and where
  it lets go.
- Melody: Note which scale degree the tune lands on at downbeats and phrase ends
  — 1 closes, 5 or 2 stays open, 7 leans hard toward 1. Describe the shape:
  mostly steps or leaps, rising or falling, where the highest note is and whether
  it happens once. A motif is a short idea that comes back changed — moved up a
  step, flipped, stretched; name it and list its returns.
- Texture and rhythm: Say which voice has the tune, which outlines the chords
  (arpeggios, repeated chords), which holds the bass, and where they swap. For
  rhythm: the groove, any ostinato, how often the chords change, and the bar
  where the pattern breaks. In a game, ask what the scene needs — tension, calm,
  forward motion — and how the music supplies it.
- Summary: One plain paragraph: what the piece does and why it works, in your
  own words. Then compare it with other pieces by the same composer — a shared
  habit (the same cadence, the same bass motion, the same loop plan) is the real
  lesson.

**S5 — Ask.** `src/ask/tools.js` (kind `analysis` + `item`/`done`, optional
`topic`, in `add_annotation`; `askAddAnnotation` builds the `analysis:` text; the
compact line), `src/ask/context.js` (the one sentence). Tests (tests/ai.test.mjs's
fake-server style): a tool call writes one line that round-trips; the compact
block carries the ✓ and body; the system prompt contains the sentence.

Verification before each merge: `npm test` under the alarm, `node
tools/split/check.mjs`, `node tools/package.mjs --check`, `node
tools/build_help.mjs`. Main session, real browser (iPad width and 1024 px): open
on Chaos Temple READ-ONLY (never dictate a test answer on his song — writes go on
a scratch composition), dock right beside AI as a tab, tick/untick + undo on the
scratch song, dictate one answer, + beside Cadences → editor with the chip lit,
phone width (no Dock button), reload → entries persist, Publish shows the song
pending. Push, iPad build, email on deploy.

## 6. Open questions for Josh (defaults let the work proceed)

1. **The prompt list** — the sixteen prompts in §2 as written, or fewer to
   start? Default: ship as written; it is one table and a help paragraph, cheap
   to change; the ids stay even if the wording does not.
2. **"File under" chips in the annotation editor** — one more row in an editor
   he uses constantly, or filing only through the sheet's + buttons? Default:
   both — the chip row, one line under the text box, nothing lit unless tapped;
   the sheet's + pre-lights it.
3. **Counts of his own annotation types on the sheet** ("18 chord bands") —
   show them, as All notes does, or hide every number except his ticks?
   Default: show type counts; never a word about what is missing.
