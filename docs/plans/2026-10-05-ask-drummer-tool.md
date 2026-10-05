# Plan: `drummer` Ask tool — speak a drum request, Ask runs the real Drummer (2026-10-05)

Josh (open-items "Ask tool for the Drummer", via Ask on ambush): "rerun the A part
with slightly less energy settings than the maximum I used for the entire thing";
"redo the intro, probably to match pulse one and pulse two rather than following the
triangle". Ask must invoke `src/gen/drummer.js`, never hand-write hits.

## Tool: `drummer` (src/ask/tools.js, same plumbing as write_notes / copy_bars)
Arguments (all optional except a range):
- `from_bar`, `to_bar` — whole bars, inclusive; OR `section` — the exact text of ONE
  of the user's declared section labels ("Intro", "A"). The label resolves to its
  bar span (first bar of its start, last bar of its end); a label that matches more
  than one span, or none, is an error naming the spans/labels — never a guess.
- `energy` 1–5 — shorthand: sets `busy` and `hard` together (the generator's own
  legacy mapping, bit-identical to the positional call). `busy` 1–5 and `hard` 1–5
  override it individually. Default 3/3.
- `fills` 0–5 (the dialog's Fills knob; 0 = off), default 3.
- `feel` normal | half | double, default normal.
- `parts` subset of kick/snare/hats/fills, default all (a scoped reroll, as the chips).
- `follow` — what the kick listens to: an array of track names (`["pulse1",
  "pulse2"]`, matched like write_notes' `track`, never the selected track), or
  `"chords"`, or `"off"`. Default: the detected bass (same as the dialog).
- `seed` integer — a reroll with the same seed is the same take; omitted = random,
  and the reply states the seed so "that one again, quieter" can replay it.
Reply (one line): `"Drummer: 61 hits in bars 5–12 · busy 2 · hard 2 · fills 3 ·
following pulse1+pulse2 · seed 123 (one undo restores what was there)"`. The take
is pushed onto `S.drTakes`, so the Drummer sheet's take chips show and replay it.

## Mapping onto the generator
`askDrummer(a)` → validates everything → ONE call `drGenerate(seed, {busy, hard,
fillAmt, feel, parts, follow, followTis, fromBar, toBar})`. drGenerate already:
creates the drum track when none (folded into the same undo), erases only kit notes
in `[t0, t1)`, pushes exactly one group undo, saves, redraws. It never touches
non-drum tracks or annotations (it only reads them).

## What the generator lacks, and the additive change
`follow` is a single track (`followTi`, else `drBassTrack()`). New opt `followTis:
[ti, …]` — a SET of followed tracks:
- the followed notes = those tracks' live notes in range, merged by onset tick
  (one candidate per tick, the longest duration — pulse1 and pulse2 striking
  together is one kick, not two), sorted by time;
- break detection ("texture thins to the followed track alone") excludes every
  followed track, not just one.
When `followTis` is absent, the code path is byte-for-byte the old one (`bassTi`
single track, no merge, no sort) — the day's golden tests and the hard/legacy
bit-identity test stay green. `followTis` of length 1 is also unmerged on purpose
(a chord on one track today yields two candidates; that stays as is). The dialog's
take-chip replay passes `followTis` through (one line) so an Ask take replays whole.

## Safety
- Gate = `askWritableGate()` (write_notes' rule): the user's own editable songs
  only; a locked capture/starter, a repo link, or compare mode refuses with the
  same messages, nothing changed, no undo entry.
- Meter change inside the range: refused with the generator's own sentence,
  BEFORE anything is erased (drGenerate would return 0 via setInfo; the tool
  checks first and throws so Ask reports it).
- Description text tells the model: only when the user explicitly asks for drums;
  prefer this over write_notes for anything drum-shaped; own editable songs only.
- Learning mode untouched: no key/chord naming; the generator reads only the
  user's own declared sections/chords as it always did.
- `ASK_SONG_ONLY_TOOLS` gains `drummer` (hidden in the general chat). Never run on
  albums/compositions/ in tests — scratch songKeys only.

## Tests (tests/night-roll.test.mjs, vm)
1. runs on bars 2–3 of a 4-track scratch song with hand-placed drums in and out of
   range: hits land only in range, out-of-range drum hits and every non-drum track
   and the annotations are untouched, exactly one undo entry, one ⟲ restores every
   track exactly; `energy` E equals the legacy `drGenerate(seed, E, from, to)`.
2. follow source: `follow: ["pulse1","pulse2"]` kicks the pulses' offbeat onsets
   (one kick per shared tick), differs from the triangle default; `followTis: [ti]`
   equals `followTi: ti` bit-for-bit; default unchanged (existing golden tests).
3. `section: "A"` resolves to its bars; an ambiguous label and an unknown label
   error with nothing changed; unknown follow track names error.
4. refuses on a locked capture (nothing changed, no undo); hidden in general chat;
   bad ranges error.

## Docs
help/help.html AI entry (+ keyword "run the Drummer" in FEATURES), `node
tools/build_help.mjs`, NIGHT-ROLL.md ✦ Ask tools entry, Ask system prompt sentence
(tool count thirteen), open-items entry closed. No new module → no preload/SW change.
