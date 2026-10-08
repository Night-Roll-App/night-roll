# Chord and Roman pickers as primitives — plan (2026-10-08)

Josh, Terminal #287: "I think we can simply chord naming by just supplying the primitives. We have a lot
of repetition." #288: "Roman numerals could also be simplified but in a different way. Just choose 1-7,
add major or minor, flat/sharp, etc."

Binding rules:
- Learning mode: nothing is pre-filled. A chord opens empty, and the pickers spell only what he taps.
- The text boxes stay the truth. Typing wins, and the chips stand down for anything they can't spell.
- Stored data doesn't change. A chord is still a symbol string ("Cmaj9"), and a Roman numeral is still
  the string he entered ("bVII7"). Only the chips change.
- Touch first; his hands hurt, so the common chords should take the fewest taps.

## Chord picker (src/ui/note-editor.js, src/theory/chords.js)

Today: root row, ♭♮♯, a quality row (maj m dim aug sus2 sus4 5), and an extensions row of 18 chips
(`CHORD_EXTS`: 6 7 maj7 9 maj9 11 maj11 13 maj13 add9 add11 add13 b5 #5 b9 #9 #11 b13). The extensions
repeat themselves: maj9/maj11/maj13 are "maj7 + a tension", and add9/add11/add13 are "a tension with no
seventh".

Proposed primitives:
- Root and accidental: unchanged.
- Quality: unchanged (maj m dim aug sus2 sus4 5). It is already one choice.
- **Seventh**, pick at most one: `6`, `7`, `maj7`.
- **Tensions**, stack: `9`, `11`, `13`.
- **Alterations:** a ♭/♯ applied to 5, 9, 11 or 13. The advisor picks between two options. (a) Keep the
  six real alteration chips (b5 #5 b9 #9 #11 b13); they're already primitives. (b) An alter mode where ♭
  or ♯ is tapped, then the degree.
- Composition follows standard naming:
  - a seventh plus tensions names the highest tension: 7+9 → "9", maj7+9 → "maj9", m+7+11 → "m11",
    7+13 → "13";
  - tensions with no seventh → "add9" / "add11" / "add13";
  - 6+9 → "6/9";
  - alterations append ("7b9", "7#11").
- Parse back: `chordQualParse` must turn every symbol the old chips could spell into the new chip state,
  so an existing chord lights the right chips. Anything else stands the chips down, as today.

## Roman picker (#nromanbox, from de80641)

Today: an upper row I–VII (major), a lower row i–vii (minor), then ♭ ♯ · ° dim + aug · 7 maj7 ø7 6.

Proposed primitives, per #288:
- **One degree row:** 1–7, shown as I…VII.
- **Major / minor:** a two-state toggle that sets the case. Default major.
- **♭ / ♯:** as today.
- **Quality:** ° dim, ø (half-dim: lower case + "ø7"), + aug.
- **Seventh:** 7, maj7, 6. This could share the chord picker's seventh primitives.
- Keep the fold (▸ Roman numeral, summary shows the value), the text box last, and "tap again to take
  it off".

## Tests

- chords.js: compose and parse round trips for every symbol the old 18 chips could spell (generated from
  the old `CHORD_EXTS` combinations), plus the composition rules above.
- note-editor: chip taps → symbol; existing symbol → chip state; Roman one-row + toggle → the same
  strings as before (bVII, ii°, viiø7, V7).
- Help sheet entries ("Chords", "Roman numeral and no 5") updated, then `node tools/build_help.mjs`.

## Shipping

The usual checklist. Ask tool: not applicable (the act tool already writes chord symbols and Roman
numerals as text; there is no new action). Browser check at iPad width. Push, then iPad build.

## Advisor review (2026-10-08) — REVISE; this section wins where it differs

Blocking:
- **"6/9" breaks the parser.** `parseChordSym` reads `/` as a slash bass, so compose **"69"**
  (a test already pins it).
- **`chordQualParse` keeps its `{base, exts}` shape.** roman.js, bassist.js and note-editor.js consume
  it. Add a separate picker layer, `chordPickParse(rest)` → `{base, sev, tens, alts}` and
  `chordPickCompose(...)`. Only composeChord, setChordWidget and the input listener switch to it.
- **Remove every trace of the Roman lower-case row:** `nromandegl` in refreshRomanChips, romanTap,
  mkRoman, index.html, the tests and help.html.

Decisions:
- **Alterations:** keep the six chips (b5 #5 b9 #9 #11 b13). A chip is one tap with no hidden state, and
  it only spells real alterations. Dim them until there is a seventh, a 6 or a non-major base; today
  "Cb5" re-parses as a C♭ chord.
- **Chord rules:**
  - Seventh: at most one of 6/7/maj7.
  - With a seventh, the tensions 9/11/13 are pick-one and name the chord: 7+13 → "13", maj7+11 →
    "maj11", m+7+9 → "m9". Parsing "13" lights 7 and 13.
  - Without a seventh: 6+9 → "69"; otherwise add9/add11/add13, ascending.
  - Order: base, seventh-or-tension, sus, then alterations in the order b5 #5 b9 #9 #11 b13.
  - m(maj7) → "mmaj7" / "mmaj9".
  - Half-diminished stays "m7b5"; never write ø in a chord.
  - dim+7 → "dim7".
  - 7sus4 composes as "7sus4" and parses as both "7sus4" and "sus47".
- **Re-spellings:** they happen only on a chip tap, since opening a chord never rewrites the box.
  - Dsus47 → D7sus4.
  - 7add9 / maj7add9 / m7add9 → 9 / maj9 / m9.
  - 9 alone now composes as add9; "C9" parses as 7+9.
  - The help example "Cm7add9" changes.
  - Every other stored chord value is unchanged (checked against albums/**/*.rollnotes.json).
- **Roman:**
  - One degree row, I–VII, plus a major/minor toggle. Each new chord starts on major; the case never
    carries over from the previous chord.
  - The toggle re-cases the numeral in the box, or sets the case for the next degree.
  - ° and ø switch the toggle to minor; + switches it to major. Tapping major clears °/ø; tapping minor
    clears +.
  - ø writes "ø7" and clears the seventh chip.
  - romanCompose and romanParse are unchanged.
  - A minor chord now takes two taps; Josh asked for this layout in #288.

Builder steps:
1. The chords.js picker layer, with tests for every rule above, plus every stored chord value (parse →
   compose → the same string, or a listed re-spelling).
2. Rebuild the chord rows (seventh / tensions / alterations, alterations dimmed). Tap tests, plus a test
   that opening a stored chord leaves the box alone.
3. Roman: one degree row plus the case toggle. Rewrite the existing roman taps so they still produce
   bVII, ii°, V7 and viiø7.
4. Both help.html entries, then build_help, then the full vm suite.
5. Optional: chordQualParse accepts a trailing sus, so the bassist reads "G7sus4".
