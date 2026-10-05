# Drummer review — how it works, how others do it, what to build (2026-10-05)

Advisor: Opus 5.5. Asked by Josh (Terminal, "look at our drum generation… especially
fills… keep the snare-only fills"; #140 "if it's definitely better, just go for it";
#141 "snare-only fills are just one type of fill"). Code read: `src/gen/drummer.js`
(`drGenerate`, `DR_FILLS`), `src/ui/sheets.js` (`drBuildControls`, `#drgen` handler,
take chips). Output sampled with the vm harness on a scratch 16-bar song (sections
A B A C, melody + triangle bass) — never his songs.

## 1. How it works today (plain words)

Every press of Generate erases all kit notes in the range and writes a fresh take
(one undo). A random seed is drawn once; every bar gets its own random stream made
from (seed, bar) — that's why widening the range never changes bars you liked, and
why a take chip replays exactly.

Per bar, in this order:
1. **Skeleton (never random):** kick on beat 1; snare on the backbeats (2 and 4 in
   4/4, 3 in 3/4, 4 in 6/8, last beat otherwise). `feel` half = one snare mid-bar;
   double = kick every beat, snare on every "and".
2. **Hats:** closed hat on every 8th (on-beats a bit louder). Busy 4–5 sometimes adds
   a 16th right after an "and". Hats are capped below the bar's snare.
3. **Kick follows the bass** (`follow` = a track): where the bass plays off beat 1,
   add a kick with chance 12% + 10% × busy, max 2 per bar. A bass note 1.5 beats or
   longer gets an extra snare on top (the "agogic snare"). `follow` = chords: a kick
   on each declared chord change. `follow` = off: kick on 1 only.
4. **Chord-change accents:** kick/hat on a declared chord change gets +12 velocity.
5. **hard:** adds 7 × (hard − 3) to every velocity. Nothing else.
6. **busy:** only two things — hat 16th pairs (busy ≥ 4) and the bass-kick odds.
   *The Help page says busy also adds "ghosts". There is no ghost-note code.*

**Where fills come from.** Only from *boundaries*: a declared section start or the
loop target inside the range. The bar *before* a boundary may get a fill; the
boundary's beat 1 gets a crash (49) plus the skeleton kick. Nothing else ever fills
— a 16-bar section with no sub-labels plays 15 bars of identical-feeling groove and
never fills in the middle.

**How a fill is picked** (`fills` knob 0–5): fire chance is 35% + 12% × fills
(fills 1 = 47%, 3 = 71%, 5 = 95%). The pool is every fill whose `minE..maxE`
contains the knob value; fills 1–3 pick evenly, 4–5 pick by weight. The fill "owns"
its last N beats: skeleton, hats and bass-kicks stay out of that window.

| fill | beats | knob | what it plays |
|---|---|---|---|
| **run** | 2 | 2–5 | 8 snare 16ths, velocity 70 → 115 straight crescendo |
| **negative** | 2 | 1–2 | hats stop; one snare on the last beat; then silence into 1 |
| **flam** | ¼ | 1–3 | grace snare 30 ticks early + loud snare on the last 16th |
| tomdrop | 2 | 3–5 | snare then 3–5 toms, spread *evenly* over 2 beats |
| buildup | bar | 4–5 | kick/snare alternating 8ths, then 16ths, slow crescendo |
| tomrun | 2 | 4–5 | 8 16ths down snare → toms, two drums doubled at random |
| kitfall | bar | 4–5 | crash + 3 snares, then each beat a tom pattern walking down |
| doublekick | 2 | 4–5 | 8 kick 16ths with snares on the last two beats |

**The snare-only fills are `run`, `negative` and `flam`** — they never draw a
random number and touch nothing but pitch 38. `run` is almost certainly the one he
loves (it is the only snare fill with a real shape). Sampled, 4/4, bar 4 before B:

```
        |1 e & a|2 e & a|3 e & a|4 e & a|      (o soft  x mid  X loud)
 kick   |x . . .|. . . .|. . . .|. . . .|
 hats   |o . - .|o . - .|. . . .|. . . .|      hats stop for the fill
 snare  |. . . .|X . . .|o o o o|x x x X|      ← "run": one drum, one direction, lands
 crash  next bar's 1, with the kick
```

Why it works, and the rule every other fill should obey: **one idea, one direction
(getting louder or going down the kit), on the 16th grid, landing on the next 1.**

## 2. How others do it (sources)

- **Logic Drummer**: an X–Y pad (complexity left→right, loudness down→up), a Fills
  knob that sets "number and length of fills", Swing (8th or 16th), per-piece
  sliders, Follow (kick+snare follow another track's rhythm), and Details: Feel
  (push/pull), **Ghost Notes** ("syncopated snare and kick hits"), Hi-Hat openness.
  Fills: "the main fill will always be at the end of a region"; at higher Fills the
  drummer also adds a crash at the start and "small extra details in the middle".
  [Logic help: edit a performance](https://logicpro.skydocu.com/en/add-drummers-to-your-project/work-in-the-drummer-editor/edit-a-drummers-performance/),
  [Logic help: Drummer](https://logicpro.skydocu.com/en/get-started-with-logic-pro-x/drummer/),
  [9to5Mac on Drummer details](https://9to5mac.com/2015/06/28/logic-how-to-drummer-to-midi/),
  [Dummies](https://www.dummies.com/article/technology/digital-audio-radio/general-digital-audio-radio/how-to-use-logic-pros-virtual-drummer-299400/).
  *We already copied the knob split. What we don't have: the fill hierarchy (big at
  section ends, small in the middle), ghost notes, and a groove that repeats.*
- **Mutable Instruments Grids** (hardware drum generator): each instrument has a
  16-step "terrain" — a height per step learned from real loops. A density knob is
  a "sea level": steps higher than it play. Turning density up adds notes *in a
  musically ranked order* instead of at random.
  [Grids manual](https://pichenettes.github.io/mutable-instruments-documentation/modules/grids/manual/).
- **Ableton Live 12 Rhythm / Euclidean tools**: steps + density + "pattern" +
  "split %" (split some hits in two for variety); Euclidean spreads N hits as evenly
  as possible over M steps.
  [Ableton manual: MIDI Tools](https://www.ableton.com/en/live-manual/12/midi-tools/),
  [Sound On Sound](https://www.soundonsound.com/techniques/ableton-live-12-midi-generators).
- **Euclidean rhythms** (Toussaint 2005): the "evenest" placement of N hits in M
  slots reproduces many traditional patterns (3 in 8 = the tresillo).
  [Wikipedia](https://en.wikipedia.org/wiki/Euclidean_rhythm).
- **Syncopation / metric weight** (Longuet-Higgins & Lee; Witek et al. 2014): give
  each slot a weight (1 strongest, then 3, then 2 and 4, then the "ands", then
  16ths). Groove ratings peak at *medium* syncopation (an upside-down U).
  [Witek et al., PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0094446),
  [Hoesl & Senn 2018](https://journals.sagepub.com/doi/10.1177/2059204318791464).
- **Groove = ghost notes + accents + micro-timing** (Magenta GrooVAE / Groove MIDI
  Dataset, 13.6 h of real drummers).
  [Gillick et al. 2019](https://arxiv.org/pdf/1905.06118),
  [PocketVAE](https://arxiv.org/pdf/2107.05009). Neural models are out of scope (no
  build step, no weights) — but their *three ingredients* are cheap to imitate.
- **Fill craft (drum teaching)**: the most common fill spot is the last 2 beats of
  bar 4 / bar 8 of a phrase; tom fills move high → low and land with a crash;
  **groupings of 3** over 16ths ("snare-tom-kick, snare-tom-kick, snare-snare")
  create tension; **linear** fills never stack two drums; velocity crescendo across
  a fill gives momentum.
  [Drumeo beginner fills](https://www.drumeo.com/beat/beginner-drum-fills/),
  [Linear drumming](https://drumbeatsonline.com/blog/linear-drumming-how-to-play-grooves-and-fills-without-overlapping-hits),
  [hack music theory: 3 types](https://hackmusictheory.com/home/blog/3-types-of-drum-fills),
  [DrumShed fill builder](https://drumshed.studio/guides/fill-builder),
  [What is a drum fill](https://scriptandpad.com/what-is-a-drum-fill/).

## 3. What's weak (found by sampling, not guessed)

1. **Fills only at section edges.** A long section never fills. Logic and every
   drummer mark bar 4 / bar 8 of a phrase too (small ones).
2. **tomdrop plays quintuplets.** It spreads 4, 5 or 6 notes evenly over 2 beats —
   with 5 that's 5-in-the-space-of-4 8ths, off every grid line. That's the "weak,
   wobbly" tom fill. (6 = triplets, 4 = plain 8ths.)
3. **buildup has no shape.** Kick-snare-kick-snare machine-gun at a nearly flat
   velocity; it erases the backbeat for a whole bar and never goes anywhere.
4. **The big knob buries his favorite.** At fills 4–5 the weights are kitfall 3,
   tomrun/doublekick/buildup 2, run/tomdrop 1 → `run` is 1 pick in 11.
5. **The groove never repeats.** Each bar draws its own hats, kick extras and
   velocities, so bars 1, 2, 3 of a section are three different patterns. Real
   drummers loop 1–2 bars and change only the bar before a fill. (Sample, busy 3:
   bar 1 kick on 1+4, bar 2 kick on 1, bar 3 kick on 1+2.)
6. **No ghost notes** despite Help promising them; the snare is two hits a bar.
7. **Same fill twice in a row** is allowed (nothing remembers the last boundary).
8. **Compound meters:** fills measure in "beats" and use beat/4 as the 16th; in 6/8
   the beat is an 8th, so a "16th run" becomes 32nds. Leave `run` alone; new fills
   should step in real 16ths (`ppq / 4`).
9. `follow` off = kick on beat 1 only, all song. Thin; see §4 later list.

## 4. Recommendations, ranked (payoff ÷ effort)

**Settings stay the same five rows** (busy, hard, fills, feel, follow) + parts. No
new knob. The fills knob gains meaning, not buttons.

**R1 — Freeze the snare fills (payoff: safety; effort: tiny).** Golden tests that
`run`, `negative`, `flam` emit exactly today's hits in 4/4 and 3/4. Nobody can
"improve" them by accident. Their knob ranges stay (run 2–5, negative 1–2, flam 1–3).

**R2 — Fix tomdrop → "tomdescent" (high payoff, tiny).** Always 16ths, two per drum,
down the kit, crescendo, kick under the last floor tom:
```
 last 2 beats:  |3 e & a|4 e & a|  →  1
 snare          |x x . .|. . . .|
 toms hi→lo     |. . T1T1|T2T2T3T3|      velocity 84 → 116
 kick           |. . . .|. . . x|  → crash + kick on 1
```
Ear-check: should sound like the classic rock "brrrp down the toms". Test: every
hit on the 16th grid.

**R3 — Phrase-aware fills (highest payoff, medium).** Logic's rule: big fill at the
section end, small "details" inside. Count bars from each section's start (or bar 1
when unsectioned). The fills knob decides how often:
- fills 1–2: section edges only (today).
- fills 3: + a **small fill** on every 8th bar inside a section.
- fills 4–5: + a small fill on every 4th bar too (8th bars get medium ones).
Small fills last ≤ 1 beat and never crash on the next 1 (crashes stay for section
arrivals). Example, 16-bar section at fills 3: small fill at bar 8, section fill at
bar 16. Small-fill vocabulary: `flam`, `negative` (both untouched), `pickup` (snare
on 4 + snare on the "a" of 4), `tomlick` (4 16ths T1 T1 T3 T3 on the last beat).

**R4 — New and better fill types beside the snare ones (high payoff, medium).**
Josh #141: snare-only is one family; grow the others. Every new fill follows the
§1 rule (one idea, a direction, 16th grid, lands on 1):
- **threes** (2 beats, fills 3–5): groups of 3 16ths — snare-tom-kick,
  snare-tom-kick, snare-snare — accents on each group start. Sounds "drummery"
  because the accents fight the beat for two beats, then resolve on 1.
  ```
  |3 e & a|4 e & a|
  |S T K S|T K S S|   accents on S at slots 1, 4, 7 (X); others mid
  ```
- **accel** (full bar, fills 4–5, replaces buildup): snare quarters → 8ths → 16ths,
  kick doubling with it, crescendo 80 → 120. The EDM/rock "riser". Keeps the
  backbeat audible in the first half.
  ```
  |1 e & a|2 e & a|3 e & a|4 e & a|
  |S . . .|S . . .|S . S .|S S S S|  snare
  |K . . .|K . . .|K . K .|K . K .|  kick
  ```
- **stabs** (2 beats, fills 2–5): the band-hit fill. Hats and toms stop; kick +
  snare together on the *other tracks' note starts* inside the window (2–6 of them).
  If the music has none there, default to "and of 3" and 4. This is Logic's Follow
  applied to fills, and it is exactly his bar-13 ear correction (he added a unison
  hit where the band hits together).
- keep tomrun, kitfall, doublekick as they are (rebalanced weights below).

**R5 — Rebalance + no repeats (medium payoff, tiny).** Weights at fills 4–5: run 2,
tomdescent 2, threes 2, accel 2, kitfall 2, tomrun 2, doublekick 1. Two adjacent
boundaries never pick the same fill name (take the next one in the pool).

**R6 — Groove repeats, the 4th bar varies (high payoff, medium).** The groove's
random stream keys on the bar's *position in a 4-bar cycle*: bars 1 & 3 use stream
A, bar 2 uses stream B, bar 4 uses stream C (the variation bar). So a section plays
A B A C A B A C — a 2-bar loop with a turnaround. Bass-following kicks still follow
the actual bass each bar (that part *should* differ). Same-label sections still
restate each other bar-for-bar (the label hash stays in the key).

**R7 — Ghost notes (medium payoff, small).** Busy finally does what Help says.
Soft snares (velocity 28–40) on the 16th just before or after a backbeat:
```
 busy 4:   |1 e & a|2 e & a|3 e & a|4 e & a|
 snare     |. . . g|X . . .|. . . g|X . g .|     g = ghost
```
busy 1–2: none; 3: at most 1 per bar (50%); 4: up to 2; 5: up to 3. Never inside a
fill window, never in feel=double. Ghosts repeat with the groove (R6) because they
share its key. Hats never exceed the backbeat; ghosts sit far below both.

**Later (not definite wins — ask first):**
- L1 `follow` off: a Grids-style ranked kick table instead of "kick on 1 only"
  (busy 1: 1; 2: 1+3; 3: +"and of 3"; 4: +"and of 2"; 5: +"and of 4"). Changes
  what "off" means — Josh decides.
- L2 Open hat on the "and" of 4 in the variation bar.
- L3 Swing (8th/16th, one 3-step chip) — earlier advisor held it back for chip music.
- L4 Phrase-fill crash option ("crash every 8 bars") — Logic does this at high Fills.
- L5 Real-16th versions of run for 6/8 — *only* with Josh's ear, since run is his.

## 5. Tests (objective) and ear checks

Objective (vm suite, scratch songs only):
- Golden: `run`/`negative`/`flam` hits deep-equal frozen arrays (4/4 and 3/4,
  qt 480). And `run` consumes zero rng draws (call with an rng that throws).
- Grid: every non-flam fill hit's offset is a multiple of `ppq/4` (catches R2).
- Shape: tomdescent, accel and run velocities never decrease along time.
- Landing: every *section* fill is followed by a crash + kick on the next 1;
  phrase fills are not followed by a crash.
- Phrase placement: 16-bar unlabeled range, 20 seeds. Fills 3 → bar 8 gets a
  fill in at least one seed; bars 4 and 12 never do. Fills 4 → bar 4 can. Fills 1
  → no fill anywhere inside the section.
- No repeat: 3 adjacent boundaries, 50 seeds → never the same name twice in a row.
- Repetition (R6): follow off, busy 3, 8-bar section: bars 1 & 3 & 5 & 7 identical
  (time-in-bar, pitch, velocity); bar 4 differs from bar 2 in ≥ 1 of 20 seeds.
- Ghosts: velocity ≤ 45 (+hard delta), never on a backbeat slot, never in a fill
  window; busy 2 → zero ghosts; double → zero.
- Existing invariants stay green: determinism, hats-under-snare, breaks silent, one
  undo, parts scoping (all-four == legacy all), metal-tier tom count.

Ear (Josh, on a scratch composition or an FF1 song via "Edit a copy"): fills 2, 3,
5 on a 16-bar section; listen for (a) the run still sounds like the run, (b) bar 8
gets a small lift, (c) tom fills land cleanly, (d) the groove sits in one place
instead of wandering, (e) ghosts at busy 4 add motion without mud.

## 6. BUILD NOW (Josh #140: confident wins, one revertable unit)

Ship as **one commit** on main touching `src/gen/drummer.js`, tests, help, docs —
`git revert <hash>` undoes everything. Build order matters (golden tests first).

| # | change | where | grade |
|---|---|---|---|
| B1 | Golden tests for run/negative/flam (R1) | tests/night-roll.test.mjs | EASY (Sonnet) |
| B2 | tomdrop → tomdescent on 16ths (R2) | `DR_FILLS` | EASY |
| B3 | threes, accel (replaces buildup), stabs (R4) | `DR_FILLS` (+ stabs needs onsets) | TRICKY (Fable) — stabs only; threes/accel EASY |
| B4 | weights + no-repeat pick (R5) | fill pick in `drGenerate` → new `drPickFill()` | EASY |
| B5 | phrase fills + small vocabulary (R3) | `drGenerate` fill block, `fillBarSet`/`inFillScope` | TRICKY (Fable) |
| B6 | 4-bar groove cycle (R6) | `sectionLane` callers in `drGenerate` | TRICKY (Fable) |
| B7 | ghost notes (R7) | `drGenerate` after the snare block | EASY |

Specs:

- **Fill hit contract** (all new fills): `hits(rng, qt, beats, ctx)` — offsets from
  bar start in ticks; step `s = S.song.ppq / 4` (a real 16th); window start
  `w = (beats − len) * qt`. Pass the **fill substream** `frng` (not the groove
  `rng`) to every fill's `hits` — run/negative/flam draw nothing, so they are
  unchanged; tomrun's doubles change (acceptable: takes are session-only).
  `ctx = {bs, onsets}` where `onsets` = sorted unique note starts of every non-drum
  track (bass included) inside the window, relative to bar start.
- **B2 tomdescent** (`minE 3, maxE 5, weight 2, len 2`): seq =
  `[38,38,48,48,47,47,43,43]` (one frng draw: < 0.5 → floor is 41 instead of 43);
  offsets `w + i*s`, v = `round(84 + 32*i/7)`, d 45; plus `{off: w+7*s, p: 36, v: 104}`.
  Remove `tomdrop`.
- **B3 threes** (`3–5, w 2, len 2`): pattern `[38,48,36, 38,45,36, 38,38]` at
  `w + i*s`; v = 112 at i ∈ {0,3,6}, else 86; i = 7 → 118. **accel** (`4–5, w 2,
  len 99`, replaces `buildup`, full bar): snare at beats 1,2 (quarters), 8ths in
  beat 3, 16ths in beat 4 (4/4 shape; for other meters: quarters for the first
  half, 8ths for the next quarter, 16ths for the last beat); kick on every snare
  that falls on an 8th; v ramps 80 → 120 by time. **stabs** (`2–5, w 1, len 2`):
  take `ctx.onsets` on the 8th/16th grid; if 2–6 of them, put 36+38 at each, v
  106 → 118; otherwise at `w + 2*s` (the "and" of the first window beat) and `w + qt`
  (the last beat) — in 4/4, the "and of 3" and beat 4. No hats, no toms.
- **B4** `drPickFill(frng, fillAmt, pool, prevName)`: weighted pick as today at
  fills ≥ 4, even pick below; if result.name === prevName, take the next pool entry
  (wrapping). `prevName` = the fill chosen at the previous boundary *in this
  generation* (walk boundaries in bar order; fill choice still draws from
  `drumRng(seed, bar*7919+13)` so liked bars stay stable). Weights: run 2,
  tomdescent 2, threes 2, accel 2, kitfall 2, tomrun 2, doublekick 1, stabs 1,
  negative/flam 1. Do **not** edit run's `hits`, `len`, `minE`, `maxE`.
- **B5** phrase fills: new `DR_SMALL_FILLS` = `[flam, negative, pickup, tomlick]`
  (reuse the same flam/negative objects — no copies). `pickup`: snare 38 at last
  beat (v 100) and at last-beat + 3s (v 112). `tomlick`: 48,48,45,45 on the last
  beat's 16ths, v 90 → 108. Phrase position: `k` = bar's 1-based offset in its
  deepest section (from `sectionLane`'s section; unsectioned: from bar 1). Phrase
  bar if `k % 8 === 0` (fills ≥ 3) or `k % 4 === 0` (fills ≥ 4), and `bar+1` is not
  a boundary. Fire chance `0.25 + 0.1*fillAmt` from `drumRng(seed, bar*7919+29)`.
  At fills ≥ 4, `k % 8` bars may also pick from the 2-beat pool with weight ≤ 1
  (run, tomdescent, threes). **No crash after a phrase fill.** Scope: add every
  `k % 4 === 0` bar to `fillBarSet` regardless of the knob (so a fills-only reroll
  with fills off strips old phrase fills too — a de-fill still works).
- **B6** groove cycle: in `drGenerate`, `grooveLane(bar)` becomes
  `sectionBase(bar) + [0,1,0,3][(k-1) % 4]` where `sectionBase` is the label hash
  (or a fixed constant `0x2545F491` when unsectioned) and `k` as in B5. Export a
  `drSectionPos(bar) → {base, k}` from drummer.js and keep `sectionLane` as-is for
  the Bassist (it imports it — do not change its behavior). Fills and arrival
  crashes stay keyed on absolute bars.
- **B7** ghosts: substream `drumRng(seed ^ 0x5BD1E995, grooveLane(bar))` (repeats
  with the groove). Candidates: for each backbeat beat b, slots `(b−1)*4 − 1` and
  `(b−1)*4 + 1` in 16ths (step `qt/4`, the meter's own subdivision), dropping
  slots < 1 or ≥ beats*4. Shuffle-draw: for each candidate in order,
  `g() < [0,0,0.5,0.6,0.7][busy-1]` until the cap `[0,0,1,2,3][busy-1]`. Put 38,
  v `28 + g()*12`, d 30, only if `t < fillStart`, feel !== "double". Skip when the
  snare part is not being generated (scope logic already does this in `put`). Add
  a floor so `hard` can't push ghosts to 0: clamp ghosts to ≥ 18 after delta.
- **Tests to add** (all in §5): golden snare fills (B1, must pass before AND after
  every other step), 16th grid, monotone velocity, landing/no-crash, phrase
  placement, no-repeat, groove cycle, ghost rules. Update the help-claim test if
  any asserts the old fill names (grep `tomdrop`, `buildup`).
- **Shipping checklist** (CLAUDE.md): help/help.html Drummer entry — fill list
  (tomdescent, threes, accel, stabs; small fills on 4/8-bar marks at fills 3–5),
  "busy adds ghost notes on the snare" now true, "the groove loops two bars and
  varies the fourth"; `node tools/build_help.mjs`; drift keyword (e.g. "phrase
  fills") in FEATURES; NIGHT-ROLL.md Drummer section (fill contract, frng, groove
  cycle — and delete "unsectioned songs are bit-identical to the old engine");
  open-items: close this review, queue L1–L5. Commit message names this doc so the
  revert is findable. Ear-test song: a scratch composition, never albums/compositions/.

Risk notes: B6 changes the sound of *every* bar (the biggest audible change — if
Josh dislikes the loop, B6 alone can be reverted by restoring `grooveLane =
sectionLane`). B5 adds hits in bars that used to be plain groove; at fills 1–2
nothing changes. `run`, `negative`, `flam` are byte-identical by test.
