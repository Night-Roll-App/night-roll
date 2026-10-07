# Song notes: many, or one with paragraphs? (advisor, 2026-10-06)

Question (open-items, the two 2026-10-06 "song-level notes" entries): should
a song have many separate top-level notes, or one song note with paragraphs?
Motivating case: in Shop, Josh found the "sway" (long/short contrast; the
long-short-long sandwich is the strongest). It applies in many places, and
today it is repeated as a text note at every spot. He wants it said once,
with a couple of example bars. This is an independent view. It is not bound
by his earlier lean.

## What already exists (and settles part of this)

- **Analysis answers are already song-level notes.** The `analysis` type
  (docs/annotations-v2.md) is anchored at [1,1] only because every note needs
  an anchor. It is never drawn, bar edits never move it, and each prompt gets
  one entry. So a "note not tied to a bar" is a solved storage problem. A song
  note is that pattern with a free title in place of a fixed prompt id.
- **Annotations sync and merge one whole note at a time.** Editing a
  published note retires the old one (a tombstone) and adds the new one
  (`putStudyEntry`, `mergeLocalAdditions`). Nothing merges inside a note's
  text.
- **Ask edits a note by replacing its whole text** (`edit_annotation`, by id
  or by bar + current text).
- **A filing tag is already planned.** Step S3 of the Analysis-sheet plan
  adds an optional `topic` field to bar notes ("File under", `#ntopic`), so a
  bar note can be listed under a prompt while staying on its bar. It is not
  built yet. That is the back-link this feature needs.

## The two options, tested on real situations

**1. Dictating a new idea on the iPad.** In Shop, he spots a second idea,
such as "the bass never moves on the sway bars".
- Many: tap "+ song note", speak, Done. That is 3 taps and nothing else is
  touched.
- One: open the note, place the cursor at the end (fiddly on iPad), say "new
  paragraph", speak, Done. If dictation puts the cursor in the middle, his
  words land inside the sway paragraph. That is more taps and more risk for
  hands that hurt.

**2. Finding and fixing one idea weeks later.**
- Many: the list shows titles ("Sway", "Bass pedal"). Tap one and edit a
  short text.
- One: scroll a growing block of text to find the right paragraph. Editing it
  re-saves everything, including paragraphs he didn't touch.

**3. Ask edits one idea** ("add bar 21 as a sway example").
- Many: `edit_annotation` rewrites about 3 lines. A mistake can only damage
  that one idea.
- One: Ask has to send back the whole note, every paragraph, word for word,
  to change one sentence. That costs more output tokens, and any slip can
  quietly change words in his other ideas. Those are his discoveries, and
  the Learning-mode rule makes damaging them the worst possible failure. The
  cost of reading is the same either way, because every annotation already
  goes into the context on each turn.

**4. The iPad and the Mac both edit, then both publish.**
- Many: one device changes "Sway" and the other adds "Bass pedal". Both
  survive, because they are different notes.
- One: both devices edited the same note, so each retired the old one and
  wrote its own version. The result is either two near-copies of the whole
  essay or a lost edit. The finer the pieces, the fewer the collisions.

**5. Linking an idea to its example bars.** This decides it.
- Many: each idea has a stable handle, so a bar note can be "filed under:
  Sway" through S3's `topic` field. The sway note then lists its examples
  automatically: "bar 5, bar 12, bar 21". Tap one and the roll jumps there.
  The example bar notes can be one word ("sandwich") or nearly empty,
  because the explanation lives once in the idea. That is exactly the
  "stop repeating it everywhere" he asked for. Examples also stay correct
  through insert_bars and delete_bars, because they are ordinary bar notes
  and bar edits already move those.
- One: there is nothing for a bar note to point at except "paragraph 2",
  which breaks as soon as he reorders. Example bars would have to live as
  text inside the paragraph ("see bar 12"). That text does not move when he
  inserts bars, which is also why the analysis notes say "bar edits never
  move it".

**6. Reading it as a whole.** This is the real strength of the one-note
option, because a song's ideas read nicely as one page. You get that with
many notes too: the list can show them stacked, title then body, like one
document. Storage stays split and reading stays whole.

**7. Simplicity.** One note per song is simpler to build: one box and no
list. But once the "filed under" link is wanted (point 5), one note needs
paragraph ids, which is the many-notes design hidden inside a single string.
Many notes is the simpler design that still delivers what he asked for.

## Overlap with the Analysis sheet

The sheet's song-wide boxes (Rhythm and groove, What it does in the scene,
Summary) answer the guide's fixed questions. A song note is his own idea,
named by him, and it fits no prompt. The sway does touch "Rhythm and
groove", but it is a rule he found, not his answer to that prompt. They
should stay separate types, with a shared look and a shared home: song notes
appear as a "MY IDEAS" group at the top of the Analysis sheet and as a "SONG
NOTES" group in ☰ All notes. A song note can also carry its own `topic` if he
wants it to show under a prompt as well. There is no second filing system,
just the S3 field reused.

## Shape (for whoever plans it, not a spec)

`{"at":[1,1],"type":"songnote","item":"sway","title":"Sway","note":"…"}`.
- `item` is a slug made once, at creation, from the first title. Renaming the
  title never changes it, so links survive a rename.
- A bar note links back to it with `"topic":"idea:sway"` (S3's field).
- The note is never drawn, and bar edits never move it, the same as
  `analysis`.
- An older client reads it as a text note at bar 1, the same graceful
  degrade as `analysis`. The forward-compatibility reader keeps it.
- Ask writes it with `add_annotation` / `edit_annotation` / `delete_annotation`
  (kind `songnote`), as his standing rule requires. In the compact bridge
  context it is one line: `id [song] songnote Sway: …`.

## Recommendation

**Many separate song notes, each a short titled idea, with bar notes able to
be "filed under" one so its example bars list themselves and stay correct.**

UI consequences:
1. A "+ song note" button (title + Speak + Done) on the Analysis sheet's new
   MY IDEAS group and in ☰ All notes' new SONG NOTES group. The list shows
   ideas stacked, title then body, so they still read as one page.
2. Each song note shows "Examples: bar 5 · bar 12 · bar 21". These come from
   the bar notes filed under it, and tapping one jumps the roll to it.
3. The bar-note editor's "File under" chip row (S3) also offers the song's
   ideas, so marking a new sway spot takes one tap and no repeated text.
