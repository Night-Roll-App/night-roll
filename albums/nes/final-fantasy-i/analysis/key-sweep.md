# Key Sweep — every song's opening key

Started 2026-08-01. Scope: the **opening** key of each song only — songs
change keys; tracking every change is out of scope for this pass. Rationale:
determining the key is the first step of every song's analysis anyway, so
this is work pulled forward, and doing it ~20 times in a row builds the
routine and shows the range of ways a key gets established. (Gurgu proved
the scope right: its opening resisted a quick read and pulled the analysis
through the whole piece. NB the sweep says nothing about internal
modulation in any other song — those interiors are unexamined, and several
likely modulate too.)

**Protocol:** (1) predict from the bass at the structural downbeat, written
down first; (2) determine the key from the music — and record **the path,
not just the verdict** ("Key: X" is worth little in a month; "Key: X
because A, then B" survives); (3) verify with the dial. Determining the key
from the music first keeps the hypothesis test non-circular.

**Legitimate move, on the record (Josh, 08-02):** reading the *final
measures* to settle the *opening* key is sound, not cheating — a loop is a
closed circle, and the last bars are engineered to hand off to bar 1. A
descending bass there is a **retransition** aimed at the loop target: the
same structural fact as the hypothesis below, read from the other side.

## Thread: loop seam typology (added 08-02)

Per song, cheap to record, test on every remaining song and retroactively
on the swept nine: **does this song prepare its loop seam, or cut?**
- *Prepared* — final bars carry a retransition (descending bass, dominant
  approach, anything aimed at the bar-1 tonic).
- *Splice* — final bars sit wherever they landed, no approach; hard cut.

Confirmed so far — prepared: Town (bar 8 Gsus4→G7 retransition, the
second clear example) and several earlier sweep songs by bass motion;
splice: **Gurgu** — its block
transposition leaves nothing pointed back home, which is why the usual
ending-clue method found no signal there. Open: does splice-vs-prepared
correlate with whether a song modulates internally?

## Hypothesis under test (revised 2026-08-02)

Original form: *the first bass note of a song is likely the tonic.* Battle
(bass enters bar 2) and Game Over (two-beat pickup) both strained the
definition of "first bass note" — Josh resolved it: the pickup is
anacrusis, never returned to; **the song really starts where the loop
returns.** The loop target identifies the structural downbeat with no
judgment call, and the NSF pipeline computes it frame-exactly.

- **Strong form (machine-checkable):** *the bass note at the loop target is
  the tonic.* Applies to every looping song; scoreable by script
  (`tools/loop-target-bass.mjs` — reports hit/miss for songs whose key is
  already recorded, stays silent about the rest so it can't spoil the
  sweep).
- **General form:** *the bass note at the structural downbeat is the
  tonic.* Applies everywhere, including through-composed pieces (Ending
  Theme, Prelude, Opening Theme), but the downbeat is a judgment call
  there. If the two forms ever disagree on a looping song, investigate.

Why the revision is more interesting than a patch: it's now a claim about
**loop construction** — a looping theme must re-establish its tonic on
every pass, so the seam is where the composer can least afford tonal
ambiguity. Prediction: strongest in short loops, weakest in ceremonial
non-looping pieces.

Status after 10 scored songs (Town joins the hits): **8 hits, 1 flagged** (see Gurgu row). Caveats
still attached:
- A song whose key was decided *using* the rule can't also count as a
  confirmation — mark those unscored.
- The sample isn't random: looping game themes must establish tonality
  within seconds, so the rule may capture a genre convention rather than
  anything specific to Uematsu.

## Tally

| Song | Opening key | Bass at loop target | Scored | Derivation |
| --- | --- | --- | --- | --- |
| Main Theme (overworld) | G major | G | hit | overworld.md |
| Cornelia Castle | D major | D | hit | cornelia-castle.md |
| Airship | F major | F | hit | airship.md |
| Battle Scene | G minor | G | hit (asterisk removed — loops to 3.3, an ordinary hit under the revised form) | battle.md |
| Dungeon (cave) | C minor | C | hit | cave.md |
| Temple of Chaos | E minor | E | hit | chaos-temple.md |
| Dead Music (game-over) | D minor | D | hit — clean non-circular test; called before scoring | game-over.md |
| Ending Theme (epilogue) | G major | G (structural downbeat; no loop) | hit, general form — judgment-based, flagged | epilogue.md |
| Gurgu Volcano | D Dorian | **A** (bass sits on the 5th under a held D) | **flagged — Josh to rule** | gurgu-volcano.md |
| Floating Castle | tonic Bb; mode unresolved | Bb (full-chip unison) | parked — "unclear" is a permitted verdict | floating-castle.md |
| Town | C major | C | hit — non-circular; key called from the chords first | town.md |
| Matoya's Cave | | | | |
| Menu Screen | | | (opened; in progress — no key yet) | menu.md |
| Prelude | | | | |
| Opening Theme (prologue) | | | | |
| Ship | | | | |
| Shop | | | | |
| Undersea Shrine | | | | |
| Victory | | | | |

**The Gurgu flag:** under the strong form the bass pitch at the loop target
is A while the tonic is D — the first candidate miss, and it's exactly the
Cornelia trap (bass on the 5th under a sustained tonic in another voice).
Options: score it a miss, or refine "bass note" to "lowest *structural*
pitch." Josh's call, not the script's; parked for him.

**Script v1 results (2026-08-02, `tools/loop_target_bass.mjs`) — the naive
machine reading disagrees with the human scoring, informatively.** Using
"lowest pitch sounding at the loop target": airship/cave/chaos-temple/
game-over HIT; battle (D under Gm), cornelia (A under D), overworld (D
under G), gurgu (A under D) MISS — **four misses and every one is the
fifth**; epilogue C (anacrusis flourish — general-form caveat applies).
Known artifact: overworld's loop target of 1.2 is the trimmer's note-tail
ring-out, not a musical pickup — its musical target is 1.1. What this
means is Josh's to rule: either the strong form is much weaker than the
by-eye sweep suggested, or "the bass note" means something more structural
than "lowest sounding pitch" (onset vs. held, which voice is functioning
as bass) — and the fifths pattern hints the second. Deciding *that* is
analysis, so the script stops here.

## Open questions (sweep-wide)

- ~~Definition of "first bass note"~~ — **RESOLVED 2026-08-02** by the loop
  target reformulation above.
- **Third outcome category:** "unclear" is a real result; log it rather
  than forcing a verdict. Floating Castle may become its first use.
- ~~Duplicate audit~~ — **RESOLVED**: the NSF is the authoritative track
  list; dungeon and elfland deleted.
- **Gurgu scoring question** (above): does a 5th-in-the-bass under a held
  tonic count against the hypothesis, or refine the hypothesis?
