# Percussion census: what kitify marks as kit, and what its samples measure (2026-10-09)

Step 3 of §6 in `docs/plans/2026-10-09-percussion-detection.md`. This is a fact
report. No detector change was made. The tool is `tools/percussion-census.mjs`.

## How it was run

```
node tools/percussion-census.mjs --album <console>/<slug> --out /tmp/percussion-census --json
```

- The capture is the app's own: `psfSong` or `ps2Song`, then
  `channelGroups`/`kitify`, the same calls `src/audio/chip.js` makes.
- Rips came from the public archive, the way `recapture.mjs` fetches them.
  They are cached in `/tmp/percussion-census/rips/`.
- One rip was missing: `ps1/chrono-cross/drowning-valley.psf` returned
  HTTP 404.
- **Rule** is the kitify rule that fired, read from the drum flags before
  kitify rewrote them:
  - `drum mode`: AKAO drum mode
  - `VAB kit`: `isDrumProgram`
  - `one pitch ≥12`: rule 2
- **Samples** are the samples the console render plays for the group's
  notes, through the same lookup as `spu-render.mjs`.
  - `os`/`lp`: one-shot or looped. This comes from the ADPCM end flag or the
    AKAO record's loop offset.
  - `r.NN`: `estimateRoot` confidence. `r-` means no clear period.
  - `f`/`h`: flatness and harmonicity from `name.mjs measure`, measured on
    the sample held for 1 s.
  - The last field is the sample's own length.
- **Shape** is a summary of those sample facts for each group:
  - `looped+root`: every sample is looped and has a clear root.
  - `one-shot, no root`: every sample is one-shot with no clear root.
  - `one-shot+root`: every sample is one-shot with a clear root.
  - `one-shot, some root`: every sample is one-shot; some have a root.
  - `looped, no root`: every sample is looped with no clear root.
  - `mixed loop`: the group has both looped and one-shot samples.
  - Shape is not a decision.

## Counts

| Album | Songs | Groups | Marked kit | looped+root | one-shot, no root | one-shot+root | one-shot, some root | looped, no root | mixed loop | Kit groups with > 6 keys |
|---|---|---|---|---|---|---|---|---|---|---|
| ps1/final-fantasy-7 | 90 | 1275 | 184 | 6 | 70 | 84 | 10 | 9 | 5 | 0 |
| ps1/final-fantasy-8 | 84 | 1397 | 208 | 15 | 93 | 85 | 5 | 7 | 3 | 2 |
| ps1/chrono-cross | 67 | 1308 | 243 | 23 | 62 | 122 | 11 | 12 | 13 | 2 |
| ps1/final-fantasy-9 | 108 | 1678 | 251 | 12 | 82 | 121 | 10 | 15 | 11 | 5 |
| ps2/dark-cloud | 59 | 353 | 71 | 3 | 5 | 28 | 23 | 0 | 12 | 20 |

Which rule fired, by shape:
- **FF7:**
  - `one pitch ≥12`: 139 groups, of which 6 are looped+root.
  - `drum mode`: 48 groups.
- **FF8:**
  - `drum mode`: 177 groups, of which 12 are looped+root.
  - `one pitch ≥12`: 31 groups, of which 3 are looped+root.
- **Chrono Cross:**
  - `drum mode`: 231 groups, of which 22 are looped+root.
  - `one pitch ≥12`: 12 groups, of which 1 is looped+root.
- **FF9:**
  - `drum mode`: 250 groups, of which 12 are looped+root.
  - `one pitch ≥12`: 1 group.
- **Dark Cloud:**
  - `VAB kit`: 53 groups.
  - `one pitch ≥12`: 18 groups, of which 3 are looped+root.

## The flagged tracks against Racing Chocobos' drums

| Track | Rule | Keys | Sample facts |
|---|---|---|---|
| FF7 racing-chocobos ch 8 prog 7 (real drum) | one pitch ≥12 | 1 | **looped**, r-, h.35, 0.056 s |
| FF7 racing-chocobos ch 9 prog 10 (real drum) | one pitch ≥12 | 1 | **looped**, r-, h.15, 0.044 s |
| FF7 racing-chocobos ch 10 prog 37,38 (real drum) | drum mode | 2 | one-shot, r-, h.18/.20 |
| FF7 racing-chocobos ch 11 prog 66 (real drum) | drum mode | 1 | one-shot, **r.70**, h.80, 0.318 s |
| FF7 racing-chocobos ch 12 prog 64 (real drum) | drum mode | 1 | one-shot, **r.94**, h.95, 0.143 s |
| FF8 choir-chant ch 1 prog 64..79 | drum mode | 16 | 16 programs, one note each; all one-shot, r.61–.99, h.82–.96, 0.48–0.64 s |
| CC time-of-the-dreamwatch ch 1 prog 48,38 | drum mode | 8 | p38 (31 notes, 7 keys) looped r1.00 h1.00; p48 (2 notes) one-shot r- |
| CC zelbess ch 15 prog 34..40 | drum mode | 7 | 7 programs, one key each; one-shot; 5 of 7 r-, h.30–.54, 0.06–0.21 s |
| FF9 qu-s-marsh ch 12/14/16/18 | drum mode | 16 | 16 programs, one key each; 15 one-shot + 1 looped; all rooted r.76–.93, h.84–.99 |
| FF9 hunter-s-chance ch 29 | drum mode | 10 | 3 samples, all one-shot, 1 rooted (r.78); prog 131 has no sample in the image |

- **One-shot vs looped does not separate them.**
  - Racing Chocobos' ch 8 and ch 9 drums are looped samples.
  - The FF8 choir and FF9 Qu's Marsh false positives are one-shot.
- **Root confidence does not separate them either.**
  - Racing Chocobos' ch 11 (r.70) and ch 12 (r.94) are rooted.
  - Their rooting is as confident as the choir or marsh samples.
- **Every flagged false positive came from rule 1 (AKAO drum mode).** None
  came from rule 2 (one pitch ≥12).
  - §4 keeps rule 1 as the driver's own statement.
  - So §4's sample guard on rule 2 would not change any of them.
- **What these rows show instead.** Each flagged AKAO group has more than 6
  written keys, often one program per key. Racing Chocobos' drum groups have
  1–2 keys.
- **Zelbess ch 15 measures like a drum set.** Its samples are short,
  one-shot, mostly unrooted and low-harmonicity, although it was on the
  "> 6 keys" list.
- **Dark Cloud's > 6-key groups are all `VAB kit`.**
  - The program holds 1–3-key tones on several samples.
  - Most mix rooted and unrooted one-shots.
  - The exception is divine-beast-dran ch 4/5 (and their alternate): 8
    samples, all one-shot, all rooted, h ≥ .97.

## (a) Groups that look melodic by the facts

These are groups where every sample is looped with a clear root (`looped+root`):
- FF7: 6
- FF8: 15
- Chrono Cross: 23
- FF9: 12
- Dark Cloud: 3

The ones from rule 2 (one pitch ≥12) are the pedal-tone candidates of §4.
Those with more than 20 notes:
- FF7 hurry ch 8 prog 24 (r.97)
- FF7 judgement-day ch 12 prog 9 (r.53)
- FF8 dead-end ch 13 prog 78 and never-look-back ch 22 prog 79 (r.83, 256/288 notes)
- FF8 ride-on ch 23 prog 64 (r.74)
- CC life-faraway-promise ch 26 prog 55 (r.91)
- Dark Cloud gallery-of-time ch 2 prog 0 (r.87, 150 notes)

The rest come from AKAO drum mode. One is a long run: CC home-termina
ch 24 prog 59 (r.90, ~200 notes, one key). Several FF8 groups share one sample
(r.72, h.70, e.g. the-mission ch 17, timber-owls ch 9).

Many-key groups whose samples are one-shot but rooted and harmonic (FF8
choir-chant, FF9 qu-s-marsh, Dark Cloud divine-beast-dran) do not have the
looped+root shape. They are listed in the tables below with their facts.

## (b) Groups that look like drums by the facts

These are groups where every sample is one-shot with no clear root (`one-shot, no root`):
- FF7: 70
- FF8: 93
- Chrono Cross: 62
- FF9: 82
- Dark Cloud: 5

Real drums also appear in other shapes:
- `looped, no root`. Example: Racing Chocobos ch 8/9.
- `one-shot+root`, for pitched toms and kicks. Example: Racing Chocobos
  ch 11/12. There are 84–122 such groups per PS1 album.

## Every group marked kit, per album

Columns: song, group, rule, notes, keys {list}, then for each program:
`pN notes/keys: samples`, then the shape. A group whose notes came from two
rules lists both (e.g. `one pitch ≥12+drum mode`).

### ps1/final-fantasy-7 — 90 songs, 1275 groups, 184 marked kit

By sample shape: one-shot, no root 70 · one-shot+root 84 · one-shot, some root 10 · looped, no root 9 · mixed loop 5 · looped+root 6. By rule: drum mode 48 · one pitch ≥12 139. Kit groups with > 6 written keys: 0.

| Song | Group | Rule | Notes | Keys | Samples (per program) | Shape |
|---|---|---|---|---|---|---|
| attacking-weapon | ch 13 prog 38,37 | drum mode | 48 | 2 {30,34} | p37 24n/1k: os r- f.17 h.18 0.095s<br>p38 24n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| attacking-weapon | ch 14 prog 36 | one pitch ≥12 | 44 | 1 {72} | p36 44n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| attacking-weapon | ch 15 prog 45 | one pitch ≥12 | 14 | 1 {19} | p45 14n/1k: os r.60 f.01 h.63 0.341s | one-shot+root |
| barret-s-theme | ch 14 prog 36 | one pitch ≥12 | 136 | 1 {72} | p36 136n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| bombing-mission | ch 13 prog 37 | one pitch ≥12 | 480 | 1 {71} | p37 480n/1k: os r- f.17 h.18 0.095s | one-shot, no root |
| bombing-mission | ch 14 prog 26 | one pitch ≥12 | 18 | 1 {35} | p26 18n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| bombing-mission | ch 15 prog 66,41 | one pitch ≥12 | 1008 | 2 {62,64} | p41 624n/1k: os r- f.40 h.14 0.228s<br>p66 384n/1k: os r.70 f.14 h.80 0.318s | one-shot, some root |
| cait-sith-s-theme | ch 10 prog 16 | one pitch ≥12 | 12 | 1 {64} | p16 12n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| cait-sith-s-theme | ch 11 prog 72 | one pitch ≥12 | 250 | 1 {60} | p72 250n/1k: lp r- f.07 h.26 0.187s | looped, no root |
| cait-sith-s-theme | ch 12 prog 88 | one pitch ≥12 | 79 | 1 {63} | p88 79n/1k: os r- f.23 h.28 0.084s | one-shot, no root |
| cait-sith-s-theme | ch 13 prog 64 | one pitch ≥12 | 140 | 1 {72} | p64 140n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| cid-s-theme | ch 12 prog 41 | one pitch ≥12 | 108 | 1 {56} | p41 108n/1k: os r- f.40 h.14 0.228s | one-shot, no root |
| cid-s-theme | ch 13 prog 36 | one pitch ≥12 | 544 | 1 {72} | p36 544n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| cid-s-theme | ch 14 prog 29 | one pitch ≥12 | 45 | 1 {41} | p29 45n/1k: os r.86 f.05 h.84 0.434s | one-shot+root |
| cid-s-theme | ch 15 prog 17 | one pitch ≥12 | 45 | 1 {36} | p17 45n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| cinco-de-chocobo | ch 11 prog 80,81 | drum mode | 195 | 2 {31,33} | p80 70n/1k: os r.95 f.00 h.98 0.159s<br>p81 125n/1k: os r.65 f.00 h.68 0.19s | one-shot+root |
| cinco-de-chocobo | ch 12 prog 82 | one pitch ≥12 | 412 | 1 {72} | p82 412n/1k: os r- f.13 h.22 0.112s | one-shot, no root |
| cinco-de-chocobo | ch 14 prog 72 | one pitch ≥12 | 321 | 1 {60} | p72 321n/1k: lp r- f.07 h.26 0.187s | looped, no root |
| cinco-de-chocobo | ch 15 prog 75 | one pitch ≥12 | 181 | 1 {72} | p75 181n/1k: os r- f.06 h.50 0.246s | one-shot, no root |
| cinco-de-chocobo | ch 16 prog 64 | one pitch ≥12 | 60 | 1 {72} | p64 60n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| cosmo-canyon | ch 12 prog 16 | one pitch ≥12 | 137 | 1 {66} | p16 137n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| cosmo-canyon | ch 13 prog 70 | one pitch ≥12 | 243 | 1 {57} | p70 243n/1k: os r.65 f.00 h.69 0.268s | one-shot+root |
| cosmo-canyon | ch 14 prog 69 | one pitch ≥12 | 361 | 1 {60} | p69 361n/1k: os r.80 f.00 h.88 0.37s | one-shot+root |
| cosmo-canyon | ch 15 prog 81 | one pitch ≥12 | 39 | 1 {36} | p81 39n/1k: os r.65 f.00 h.68 0.19s | one-shot+root |
| costa-del-sol | ch 6 prog 79 | drum mode | 69 | 1 {34} | p79 69n/1k: os r.52 f.25 h.50 0.095s | one-shot+root |
| costa-del-sol | ch 7 prog 64 | drum mode | 110 | 1 {24} | p64 110n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| costa-del-sol | ch 8 prog 82 | drum mode | 257 | 1 {28} | p82 257n/1k: os r- f.13 h.22 0.112s | one-shot, no root |
| costa-del-sol | ch 9 prog 80,81 | drum mode | 284 | 2 {31,33} | p80 216n/1k: os r.95 f.00 h.98 0.159s<br>p81 68n/1k: os r.65 f.00 h.68 0.19s | one-shot+root |
| costa-del-sol | ch 10 prog 16 | drum mode | 220 | 1 {30} | p16 220n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| crazy-motorcycle-chase | ch 7 prog 26 | one pitch ≥12 | 15 | 1 {35} | p26 15n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| crazy-motorcycle-chase | ch 9 prog 30 kit | one pitch ≥12 | 113 | 1 {39} | p30 113n/1k: os r- f.41 h.15 0.568s | one-shot, no root |
| crazy-motorcycle-chase | ch 10 prog 41 kit | one pitch ≥12 | 120 | 1 {64} | p41 120n/1k: os r- f.40 h.14 0.228s | one-shot, no root |
| crazy-motorcycle-chase | ch 11 prog 16 | one pitch ≥12 | 608 | 1 {64} | p16 608n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| crazy-motorcycle-chase | ch 12 prog 37,38 | drum mode | 936 | 2 {30,34} | p37 792n/1k: os r- f.17 h.18 0.095s<br>p38 144n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| crazy-motorcycle-chase | ch 13 prog 66 | one pitch ≥12 | 145 | 1 {64} | p66 145n/1k: os r.70 f.14 h.80 0.318s | one-shot+root |
| crazy-motorcycle-chase | ch 14 prog 29 | one pitch ≥12 | 145 | 1 {40} | p29 145n/1k: os r.86 f.05 h.84 0.434s | one-shot+root |
| crazy-motorcycle-chase | ch 15 prog 64 | one pitch ≥12 | 304 | 1 {72} | p64 304n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| descendant-of-shinobi | ch 11 prog 82 | one pitch ≥12 | 245 | 1 {72} | p82 245n/1k: os r- f.13 h.22 0.112s | one-shot, no root |
| descendant-of-shinobi | ch 12 prog 16 | one pitch ≥12 | 87 | 1 {64} | p16 87n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| descendant-of-shinobi | ch 13 prog 64 | one pitch ≥12 | 90 | 1 {72} | p64 90n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| electric-de-chocobo | ch 10 prog 53 | drum mode | 12 | 1 {35} | p53 12n/1k: os r.75 f.01 h.74 0.568s | one-shot+root |
| electric-de-chocobo | ch 11 prog 53,65 | drum mode | 18 | 2 {25,33} | p53 15n/1k: os r.75 f.01 h.74 0.568s<br>p65 3n/1k: lp r- f.20 h.23 0.437s | mixed loop |
| electric-de-chocobo | ch 12 prog 72 | drum mode | 577 | 1 {27} | p72 577n/1k: lp r- f.07 h.26 0.187s | looped, no root |
| electric-de-chocobo | ch 13 prog 64,75 | drum mode | 490 | 2 {24,26} | p64 252n/1k: os r.94 f.01 h.95 0.143s<br>p75 238n/1k: os r- f.06 h.50 0.246s | one-shot, some root |
| fanfare | ch 10 prog 16 kit | one pitch ≥12 | 35 | 1 {64} | p16 35n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| fanfare | ch 11 prog 37,38 | drum mode | 82 | 2 {30,34} | p37 75n/1k: os r- f.17 h.18 0.095s<br>p38 7n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| fanfare | ch 13 prog 64 | one pitch ≥12 | 32 | 1 {72} | p64 32n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| fighting | ch 11 prog 26 | one pitch ≥12 | 16 | 1 {35} | p26 16n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| fighting | ch 13 prog 41 kit | one pitch ≥12 | 70 | 1 {68} | p41 70n/1k: os r- f.40 h.14 0.228s | one-shot, no root |
| fighting | ch 15 prog 36 | one pitch ≥12 | 548 | 1 {72} | p36 548n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| fortress-of-the-condor | ch 14 prog 36 | one pitch ≥12 | 936 | 1 {72} | p36 936n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| full-scale-attack | ch 15 prog 36 | one pitch ≥12 | 655 | 1 {72} | p36 655n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| gold-saucer | ch 10 prog 37,38 | drum mode | 221 | 2 {30,34} | p37 133n/1k: os r- f.17 h.18 0.095s<br>p38 88n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| gold-saucer | ch 11 prog 64 | drum mode | 89 | 1 {24} | p64 89n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| gold-saucer | ch 12 prog 16 | one pitch ≥12 | 309 | 1 {64} | p16 309n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| great-warrior | ch 13 prog 70 | one pitch ≥12 | 64 | 1 {57} | p70 64n/1k: os r.65 f.00 h.69 0.268s | one-shot+root |
| great-warrior | ch 14 prog 69 | one pitch ≥12 | 96 | 1 {60} | p69 96n/1k: os r.80 f.00 h.88 0.37s | one-shot+root |
| honeybee-manor | ch 8 prog 16,29 | drum mode | 280 | 3 {24,30,33} | p16 210n/1k: os r- f.13 h.34 0.228s<br>p29 70n/2k: os r.86 f.05 h.84 0.434s | one-shot, some root |
| hurry-faster | ch 13 prog 26 | one pitch ≥12 | 25 | 1 {35} | p26 25n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| hurry-faster | ch 14 prog 38,37 | drum mode | 120 | 2 {30,34} | p37 86n/1k: os r- f.17 h.18 0.095s<br>p38 34n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| hurry-faster | ch 15 prog 36 | one pitch ≥12 | 520 | 1 {72} | p36 520n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| hurry | ch 6 prog 30 kit | one pitch ≥12 | 81 | 1 {40} | p30 81n/1k: os r- f.41 h.15 0.568s | one-shot, no root |
| hurry | ch 8 prog 24 kit | one pitch ≥12 | 20 | 1 {79} | p24 20n/1k: lp r.97 f.01 h.97 0.067s | looped+root |
| hurry | ch 11 prog 16,53 kit | one pitch ≥12+drum mode | 69 | 3 {24,33,64} | p16 32n/1k: os r- f.13 h.34 0.228s<br>p53 37n/2k: os r.75 f.01 h.74 0.568s | one-shot, some root |
| hurry | ch 12 prog 53 kit | drum mode | 37 | 2 {29,33} | p53 37n/2k: os r.75 f.01 h.74 0.568s | one-shot+root |
| hurry | ch 13 prog 37,38 | drum mode | 360 | 2 {30,34} | p37 284n/1k: os r- f.17 h.18 0.095s<br>p38 76n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| hurry | ch 14 prog 64 | one pitch ≥12 | 348 | 1 {72} | p64 348n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| infiltrating-shinra-tower | ch 7 prog 37 | drum mode | 320 | 1 {30} | p37 320n/1k: os r- f.17 h.18 0.095s | one-shot, no root |
| infiltrating-shinra-tower | ch 8 prog 53 | drum mode | 64 | 1 {33} | p53 64n/1k: os r.75 f.01 h.74 0.568s | one-shot+root |
| infiltrating-shinra-tower | ch 9 prog 53 | drum mode | 80 | 1 {29} | p53 80n/1k: os r.75 f.01 h.74 0.568s | one-shot+root |
| it-s-difficult-to-stand-on-both-feet-isn-t-it | ch 9 prog 37,38 | drum mode | 239 | 2 {30,34} | p37 175n/1k: os r- f.17 h.18 0.095s<br>p38 64n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| it-s-difficult-to-stand-on-both-feet-isn-t-it | ch 10 prog 64 | drum mode | 127 | 1 {24} | p64 127n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| j-e-n-o-v-a | ch 13 prog 38,37 | drum mode | 640 | 2 {30,34} | p37 428n/1k: os r- f.17 h.18 0.095s<br>p38 212n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| j-e-n-o-v-a | ch 14 prog 36 | one pitch ≥12 | 141 | 1 {72} | p36 141n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| j-e-n-o-v-a | ch 15 prog 64 | one pitch ≥12 | 224 | 1 {72} | p64 224n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| jenova-absolute | ch 12 prog 26 | one pitch ≥12 | 17 | 1 {35} | p26 17n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| jenova-absolute | ch 13 prog 16 | one pitch ≥12 | 280 | 1 {64} | p16 280n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| jenova-absolute | ch 14 prog 41 | one pitch ≥12 | 481 | 1 {65} | p41 481n/1k: os r- f.40 h.14 0.228s | one-shot, no root |
| jenova-absolute | ch 15 prog 53 | drum mode | 415 | 3 {31,32,35} | p53 415n/3k: os r.75 f.01 h.74 0.568s | one-shot+root |
| judgement-day | ch 11 prog 16 | one pitch ≥12 | 74 | 1 {60} | p16 74n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| judgement-day | ch 12 prog 9 | one pitch ≥12 | 37 | 1 {36} | p9 37n/1k: lp r.53 f.14 h.52 0.108s | looped+root |
| judgement-day | ch 13 prog 82 | one pitch ≥12 | 592 | 1 {72} | p82 592n/1k: os r- f.13 h.22 0.112s | one-shot, no root |
| judgement-day | ch 14 prog 36 | one pitch ≥12 | 444 | 1 {72} | p36 444n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| judgement-day | ch 16 prog 17 | one pitch ≥12 | 74 | 1 {36} | p17 74n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| life-stream | ch 12 prog 17 | one pitch ≥12 | 12 | 1 {36} | p17 12n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| lurking-in-the-darkness | ch 1 prog 38,37 | drum mode | 199 | 2 {30,34} | p37 132n/1k: os r- f.17 h.18 0.095s<br>p38 67n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| mako-reactor | ch 16 prog 7 kit | one pitch ≥12 | 14 | 1 {16} | p7 14n/1k: lp r- f.10 h.35 0.056s | looped, no root |
| on-the-other-side-of-the-mountain | ch 6 prog 71 | one pitch ≥12 | 41 | 1 {72} | p71 41n/1k: os r- f.15 h.22 0.16s | one-shot, no root |
| one-winged-angel | ch 11 prog 26 kit | one pitch ≥12 | 31 | 1 {35} | p26 31n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| one-winged-angel | ch 12 prog 36 kit | one pitch ≥12 | 830 | 1 {72} | p36 830n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| one-winged-angel | ch 13 prog 36,26 kit | one pitch ≥12 | 26 | 2 {35,72} | p26 14n/1k: os r- f.25 h.14 0.455s<br>p36 12n/1k: os r.62 f.16 h.62 0.228s | one-shot, some root |
| one-winged-angel | ch 14 prog 17 kit | one pitch ≥12 | 149 | 1 {36} | p17 149n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| one-winged-angel | ch 15 prog 17,53,54,57 kit | one pitch ≥12 | 89 | 2 {36,60} | p17 66n/1k: os r.65 f.00 h.68 0.568s<br>p53 7n/1k: os r.75 f.01 h.74 0.568s<br>p54 8n/1k: lp r- f.11 h.51 0.345s<br>p57 8n/1k: lp r.77 f.00 h.92 0.166s | mixed loop |
| one-winged-angel | ch 16 prog 30,36,53,54,29,57 kit | one pitch ≥12 | 338 | 4 {39,41,60,72} | p29 36n/1k: os r.86 f.05 h.84 0.434s<br>p30 168n/1k: os r- f.41 h.15 0.568s<br>p36 111n/1k: os r.62 f.16 h.62 0.228s<br>p53 7n/1k: os r.75 f.01 h.74 0.568s<br>p54 8n/1k: lp r- f.11 h.51 0.345s<br>p57 8n/1k: lp r.77 f.00 h.92 0.166s | mixed loop |
| opening-bombing-mission | ch 9 prog 26 kit | one pitch ≥12 | 3 | 1 {35} | p26 3n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| opening-bombing-mission | ch 13 prog 37 kit | one pitch ≥12 | 480 | 1 {71} | p37 480n/1k: os r- f.17 h.18 0.095s | one-shot, no root |
| opening-bombing-mission | ch 14 prog 26 kit | one pitch ≥12 | 18 | 1 {35} | p26 18n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| opening-bombing-mission | ch 15 prog 66,41 kit | one pitch ≥12 | 1008 | 2 {62,64} | p41 624n/1k: os r- f.40 h.14 0.228s<br>p66 384n/1k: os r.70 f.14 h.80 0.318s | one-shot, some root |
| oppressed-people | ch 12 prog 37 | one pitch ≥12 | 339 | 1 {71} | p37 339n/1k: os r- f.17 h.18 0.095s | one-shot, no root |
| oppressed-people | ch 13 prog 36 | one pitch ≥12 | 33 | 1 {74} | p36 33n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| oppressed-people | ch 14 prog 64 | one pitch ≥12 | 58 | 1 {72} | p64 58n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| parochial-town | ch 9 prog 37,38 | drum mode | 202 | 2 {30,34} | p37 175n/1k: os r- f.17 h.18 0.095s<br>p38 27n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| parochial-town | ch 10 prog 16 | one pitch ≥12 | 210 | 1 {66} | p16 210n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| racing-chocobos-place-your-bets | ch 8 prog 7 | one pitch ≥12 | 48 | 1 {48} | p7 48n/1k: lp r- f.10 h.35 0.056s | looped, no root |
| racing-chocobos-place-your-bets | ch 9 prog 10 | one pitch ≥12 | 96 | 1 {31} | p10 96n/1k: lp r- f.20 h.15 0.044s | looped, no root |
| racing-chocobos-place-your-bets | ch 10 prog 37,38 | drum mode | 192 | 2 {30,34} | p37 144n/1k: os r- f.17 h.18 0.095s<br>p38 48n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| racing-chocobos-place-your-bets | ch 11 prog 66 | drum mode | 48 | 1 {26} | p66 48n/1k: os r.70 f.14 h.80 0.318s | one-shot+root |
| racing-chocobos-place-your-bets | ch 12 prog 64 | drum mode | 96 | 1 {24} | p64 96n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| red-xiii-s-theme | ch 14 prog 16 | one pitch ≥12 | 77 | 1 {66} | p16 77n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| red-xiii-s-theme | ch 15 prog 70 | one pitch ≥12 | 152 | 1 {57} | p70 152n/1k: os r.65 f.00 h.69 0.268s | one-shot+root |
| red-xiii-s-theme | ch 16 prog 69 | one pitch ≥12 | 229 | 1 {60} | p69 229n/1k: os r.80 f.00 h.88 0.37s | one-shot+root |
| rufus-welcoming-ceremony | ch 8 prog 36 | one pitch ≥12 | 314 | 1 {72} | p36 314n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| rufus-welcoming-ceremony | ch 9 prog 26 | one pitch ≥12 | 38 | 1 {35} | p26 38n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| rufus-welcoming-ceremony | ch 10 prog 17 | one pitch ≥12 | 64 | 1 {31} | p17 64n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| sandy-badlands | ch 6 prog 82 | one pitch ≥12 | 240 | 1 {64} | p82 240n/1k: os r- f.13 h.22 0.112s | one-shot, no root |
| sandy-badlands | ch 7 prog 29 | one pitch ≥12 | 90 | 1 {41} | p29 90n/1k: os r.86 f.05 h.84 0.434s | one-shot+root |
| sending-a-dream-into-the-universe | ch 9 prog 82 | one pitch ≥12 | 257 | 1 {64} | p82 257n/1k: os r- f.13 h.22 0.112s | one-shot, no root |
| sending-a-dream-into-the-universe | ch 10 prog 29 | one pitch ≥12 | 32 | 1 {41} | p29 32n/1k: os r.86 f.05 h.84 0.434s | one-shot+root |
| sending-a-dream-into-the-universe | ch 11 prog 16 | one pitch ≥12 | 16 | 1 {64} | p16 16n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| sending-a-dream-into-the-universe | ch 12 prog 64 | one pitch ≥12 | 32 | 1 {72} | p64 32n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| shinra-corporation | ch 11 prog 36,54 | one pitch ≥12 | 88 | 2 {64,72} | p36 71n/1k: os r.62 f.16 h.62 0.228s<br>p54 17n/1k: lp r- f.11 h.51 0.345s | mixed loop |
| shinra-corporation | ch 12 prog 29 | one pitch ≥12 | 114 | 1 {40} | p29 114n/1k: os r.86 f.05 h.84 0.434s | one-shot+root |
| shinra-corporation | ch 13 prog 30 | one pitch ≥12 | 60 | 1 {40} | p30 60n/1k: os r- f.41 h.15 0.568s | one-shot, no root |
| staff-roll | ch 14 prog 26 kit | one pitch ≥12 | 3 | 1 {35} | p26 3n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| staff-roll | ch 15 prog 30 kit | one pitch ≥12 | 112 | 1 {40} | p30 112n/1k: os r- f.41 h.15 0.568s | one-shot, no root |
| staff-roll | ch 16 prog 29,26 kit | one pitch ≥12 | 119 | 2 {35,41} | p26 7n/1k: os r- f.25 h.14 0.455s<br>p29 112n/1k: os r.86 f.05 h.84 0.434s | one-shot, some root |
| staff-roll | ch 17 prog 36,26 | one pitch ≥12 | 595 | 2 {35,72} | p26 4n/1k: os r- f.25 h.14 0.455s<br>p36 591n/1k: os r.62 f.16 h.62 0.228s | one-shot, some root |
| staff-roll | ch 18 prog 17,36 kit | one pitch ≥12 | 205 | 2 {36,72} | p17 29n/1k: os r.65 f.00 h.68 0.568s<br>p36 176n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| steal-the-tiny-bronco | ch 15 prog 36 | one pitch ≥12 | 225 | 1 {72} | p36 225n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| still-more-fighting | ch 6 prog 72 | one pitch ≥12 | 113 | 1 {60} | p72 113n/1k: lp r- f.07 h.26 0.187s | looped, no root |
| still-more-fighting | ch 7 prog 65 | one pitch ≥12 | 29 | 1 {59} | p65 29n/1k: lp r- f.20 h.23 0.437s | looped, no root |
| still-more-fighting | ch 8 prog 38,37 | drum mode | 340 | 2 {30,34} | p37 241n/1k: os r- f.17 h.18 0.095s<br>p38 99n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| still-more-fighting | ch 9 prog 53 | drum mode | 106 | 3 {24,29,33} | p53 106n/3k: os r.75 f.01 h.74 0.568s | one-shot+root |
| still-more-fighting | ch 10 prog 53 | drum mode | 63 | 2 {29,33} | p53 63n/2k: os r.75 f.01 h.74 0.568s | one-shot+root |
| still-more-fighting | ch 11 prog 66 | one pitch ≥12 | 121 | 1 {64} | p66 121n/1k: os r.70 f.14 h.80 0.318s | one-shot+root |
| still-more-fighting | ch 12 prog 64 | one pitch ≥12 | 371 | 1 {72} | p64 371n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| stolen-materia | ch 8 prog 16 | one pitch ≥12 | 40 | 1 {64} | p16 40n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| tango-of-tears | ch 6 prog 36 | one pitch ≥12 | 68 | 1 {79} | p36 68n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| the-birth-of-god | ch 13 prog 65,72,26 | drum mode | 34 | 3 {25,27,31} | p26 8n/1k: os r- f.25 h.14 0.455s<br>p65 6n/1k: lp r- f.20 h.23 0.437s<br>p72 20n/1k: lp r- f.07 h.26 0.187s | mixed loop |
| the-birth-of-god | ch 14 prog 38,37 kit | drum mode | 914 | 2 {30,34} | p37 610n/1k: os r- f.17 h.18 0.095s<br>p38 304n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| the-birth-of-god | ch 15 prog 53,45 | one pitch ≥12+drum mode | 58 | 4 {22,29,33,35} | p45 40n/1k: os r.60 f.01 h.63 0.341s<br>p53 18n/3k: os r.75 f.01 h.74 0.568s | one-shot+root |
| the-birth-of-god | ch 16 prog 64,66 | drum mode | 447 | 2 {24,26} | p64 304n/1k: os r.94 f.01 h.95 0.143s<br>p66 143n/1k: os r.70 f.14 h.80 0.318s | one-shot+root |
| the-countdown-begins | ch 15 prog 36 | one pitch ≥12 | 53 | 1 {72} | p36 53n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| the-great-northern-cave | ch 6 prog 66 | one pitch ≥12 | 23 | 1 {21} | p66 23n/1k: os r.70 f.14 h.80 0.318s | one-shot+root |
| the-highwind-takes-to-the-skies | ch 14 prog 36 | one pitch ≥12 | 426 | 1 {72} | p36 426n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| the-highwind-takes-to-the-skies | ch 15 prog 26 | one pitch ≥12 | 18 | 1 {35} | p26 18n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| the-mako-cannon-fires | ch 12 prog 36 | one pitch ≥12 | 484 | 1 {72} | p36 484n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| the-special-pose | ch 6 prog 36 | one pitch ≥12 | 42 | 1 {72} | p36 42n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| those-chosen-by-the-planet-no-intro | ch 12 prog 50 | one pitch ≥12 | 14 | 1 {50} | p50 14n/1k: lp r.87 f.00 h.88 0.225s | looped+root |
| those-chosen-by-the-planet-no-intro | ch 13 prog 17 | one pitch ≥12 | 104 | 1 {29} | p17 104n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| those-chosen-by-the-planet-no-intro | ch 14 prog 40 | one pitch ≥12 | 14 | 1 {14} | p40 14n/1k: lp r.81 f.00 h.87 0.156s | looped+root |
| those-chosen-by-the-planet | ch 12 prog 50 | one pitch ≥12 | 16 | 1 {50} | p50 16n/1k: lp r.87 f.00 h.88 0.225s | looped+root |
| those-chosen-by-the-planet | ch 13 prog 17 | one pitch ≥12 | 120 | 1 {29} | p17 120n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| those-chosen-by-the-planet | ch 14 prog 40 | one pitch ≥12 | 16 | 1 {14} | p40 16n/1k: lp r.81 f.00 h.87 0.156s | looped+root |
| trail-of-blood | ch 15 prog 41 | one pitch ≥12 | 45 | 1 {24} | p41 45n/1k: os r- f.40 h.14 0.228s | one-shot, no root |
| turks-theme | ch 3 prog 82 | one pitch ≥12 | 417 | 1 {72} | p82 417n/1k: os r- f.13 h.22 0.112s | one-shot, no root |
| turks-theme | ch 5 prog 88 | one pitch ≥12 | 48 | 1 {60} | p88 48n/1k: os r- f.23 h.28 0.084s | one-shot, no root |
| turks-theme | ch 6 prog 16 | one pitch ≥12 | 24 | 1 {64} | p16 24n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| turks-theme | ch 7 prog 64 | one pitch ≥12 | 67 | 1 {72} | p64 67n/1k: os r.94 f.01 h.95 0.143s | one-shot+root |
| turks-theme | ch 8 prog 37,38 | drum mode | 115 | 2 {30,34} | p37 92n/1k: os r- f.17 h.18 0.095s<br>p38 23n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| turks-theme | ch 9 prog 30 | one pitch ≥12 | 26 | 1 {40} | p30 26n/1k: os r- f.41 h.15 0.568s | one-shot, no root |
| turks-theme | ch 10 prog 29 | one pitch ≥12 | 67 | 1 {41} | p29 67n/1k: os r.86 f.05 h.84 0.434s | one-shot+root |
| turks-theme | ch 11 prog 17 | one pitch ≥12 | 67 | 1 {36} | p17 67n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| turks-theme | ch 12 prog 53 | drum mode | 120 | 1 {35} | p53 120n/1k: os r.75 f.01 h.74 0.568s | one-shot+root |
| turks-theme | ch 13 prog 53 | drum mode | 120 | 1 {32} | p53 120n/1k: os r.75 f.01 h.74 0.568s | one-shot+root |
| turks-theme | ch 14 prog 53 | drum mode | 120 | 1 {31} | p53 120n/1k: os r.75 f.01 h.74 0.568s | one-shot+root |
| underneath-the-rotting-pizza | ch 13 prog 30 kit | one pitch ≥12 | 64 | 1 {40} | p30 64n/1k: os r- f.41 h.15 0.568s | one-shot, no root |
| underneath-the-rotting-pizza | ch 14 prog 16 | one pitch ≥12 | 289 | 1 {64} | p16 289n/1k: os r- f.13 h.34 0.228s | one-shot, no root |
| underneath-the-rotting-pizza | ch 15 prog 37,38 | drum mode | 565 | 2 {30,34} | p37 488n/1k: os r- f.17 h.18 0.095s<br>p38 77n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| underneath-the-rotting-pizza | ch 16 prog 64,66 | drum mode | 235 | 2 {24,26} | p64 158n/1k: os r.94 f.01 h.95 0.143s<br>p66 77n/1k: os r.70 f.14 h.80 0.318s | one-shot+root |
| waltz-de-chocobo | ch 13 prog 36 | one pitch ≥12 | 46 | 1 {72} | p36 46n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| weapon-raid | ch 13 prog 26 | one pitch ≥12 | 13 | 1 {35} | p26 13n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| weapon-raid | ch 14 prog 36 | one pitch ≥12 | 388 | 1 {72} | p36 388n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| weapon-raid | ch 15 prog 17 | one pitch ≥12 | 120 | 1 {36} | p17 120n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| world-crisis | ch 19 prog 26 kit | one pitch ≥12 | 12 | 1 {35} | p26 12n/1k: os r- f.25 h.14 0.455s | one-shot, no root |
| world-crisis | ch 20 prog 36,26 kit | one pitch ≥12 | 244 | 2 {35,72} | p26 9n/1k: os r- f.25 h.14 0.455s<br>p36 235n/1k: os r.62 f.16 h.62 0.228s | one-shot, some root |
| world-crisis | ch 21 prog 38,37,26 kit | one pitch ≥12+drum mode | 94 | 3 {30,34,35} | p26 4n/1k: os r- f.25 h.14 0.455s<br>p37 60n/1k: os r- f.17 h.18 0.095s<br>p38 30n/1k: os r- f.20 h.20 0.228s | one-shot, no root |
| world-crisis | ch 22 prog 26,17,36 kit | one pitch ≥12 | 56 | 3 {35,36,72} | p17 15n/1k: os r.65 f.00 h.68 0.568s<br>p26 4n/1k: os r- f.25 h.14 0.455s<br>p36 37n/1k: os r.62 f.16 h.62 0.228s | one-shot, some root |
| world-crisis | ch 23 prog 36 kit | one pitch ≥12 | 42 | 1 {72} | p36 42n/1k: os r.62 f.16 h.62 0.228s | one-shot+root |
| world-crisis | ch 24 prog 17 kit | one pitch ≥12 | 50 | 1 {36} | p17 50n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |
| wutai | ch 10 prog 72 | one pitch ≥12 | 154 | 1 {60} | p72 154n/1k: lp r- f.07 h.26 0.187s | looped, no root |
| wutai | ch 11 prog 53 | drum mode | 170 | 2 {24,33} | p53 170n/2k: os r.75 f.01 h.74 0.568s | one-shot+root |
| wutai | ch 12 prog 53 | drum mode | 170 | 2 {29,33} | p53 170n/2k: os r.75 f.01 h.74 0.568s | one-shot+root |
| wutai | ch 13 prog 17 | one pitch ≥12 | 104 | 1 {36} | p17 104n/1k: os r.65 f.00 h.68 0.568s | one-shot+root |

### ps1/final-fantasy-8 — 84 songs, 1397 groups, 208 marked kit

By sample shape: one-shot, no root 93 · looped, no root 7 · one-shot, some root 5 · one-shot+root 85 · looped+root 15 · mixed loop 3. By rule: drum mode 177 · one pitch ≥12 31. Kit groups with > 6 written keys: 2 (one-shot+root 1 · mixed loop 1).

| Song | Group | Rule | Notes | Keys | Samples (per program) | Shape |
|---|---|---|---|---|---|---|
| a-sacrifice | ch 20 prog 74 | drum mode | 80 | 1 {83} | p74 80n/1k: os r- f.07 h.33 0.344s | one-shot, no root |
| a-sacrifice | ch 21 prog 71 | drum mode | 2 | 1 {73} | p71 2n/1k: lp r- f.03 h.35 0.634s | looped, no root |
| alto-chant | ch 1 prog 64,65,66,67 | drum mode | 4 | 4 {36,48,60,72} | p64 1n/1k: os r.99 f.00 h1.00 0.963s<br>p65 1n/1k: os r.97 f.00 h1.00 1.048s<br>p66 1n/1k: os r- f.00 h.98 1.023s<br>p67 1n/1k: os r.67 f.00 h.98 0.941s | one-shot, some root |
| bass-chant | ch 1 prog 64,65,66,67 | drum mode | 4 | 4 {36,48,60,72} | p64 1n/1k: os r.92 f.01 h.90 1.084s<br>p65 1n/1k: os r.89 f.00 h.83 0.971s<br>p66 1n/1k: os r.99 f.01 h.79 1.195s<br>p67 1n/1k: os r.95 f.06 h.67 1.166s | one-shot+root |
| bass-chant | ch 2 prog 68,69,70,71 | drum mode | 4 | 4 {38,50,62,74} | p68 1n/1k: os r.93 f.01 h.69 1.092s<br>p69 1n/1k: os r.98 f.00 h.50 1.142s<br>p70 1n/1k: os r.85 f.01 h.49 1.29s<br>p71 1n/1k: os r.97 f.00 h.71 1.168s | one-shot+root |
| blue-sky | ch 22 prog 65 | drum mode | 2 | 1 {81} | p65 2n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| blue-sky | ch 23 prog 67 | drum mode | 50 | 1 {57} | p67 50n/1k: os r- f.39 h.08 0.83s | one-shot, no root |
| cactus-jack-galbadian-anthem | ch 10 prog 65 | drum mode | 264 | 1 {38} | p65 264n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| cactus-jack-galbadian-anthem | ch 11 prog 69 | drum mode | 12 | 1 {57} | p69 12n/1k: lp r- f.33 h.14 1.418s | looped, no root |
| cactus-jack-galbadian-anthem | ch 13 prog 68 | drum mode | 44 | 1 {36} | p68 44n/1k: os r.60 f.01 h.56 0.519s | one-shot+root |
| celebration-irish-jig | ch 2 prog 74 | drum mode | 751 | 2 {56,57} | p74 751n/2k: os r- f.10 h.36 0.224s | one-shot, no root |
| celebration-rinoa-s-theme | ch 2 prog 74 | drum mode | 751 | 2 {56,57} | p74 751n/2k: os r- f.10 h.36 0.224s | one-shot, no root |
| choir-chant | ch 1 prog 64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79 | drum mode | 16 | 16 {36,38,40,41…60,62} | p64 1n/1k: os r.76 f.01 h.92 0.496s<br>p65 1n/1k: os r.99 f.01 h.96 0.542s<br>p66 1n/1k: os r.98 f.01 h.92 0.603s<br>p67 1n/1k: os r.96 f.03 h.88 0.587s<br>p68 1n/1k: os r.78 f.02 h.90 0.482s<br>p69 1n/1k: os r.80 f.01 h.92 0.546s<br>p70 1n/1k: os r.72 f.01 h.89 0.512s<br>p71 1n/1k: os r.82 f.02 h.88 0.511s<br>p72 1n/1k: os r.86 f.02 h.89 0.635s<br>p73 1n/1k: os r.92 f.01 h.94 0.525s<br>p74 1n/1k: os r.93 f.01 h.90 0.536s<br>p75 1n/1k: os r.90 f.01 h.82 0.523s<br>p76 1n/1k: os r.89 f.01 h.88 0.503s<br>p77 1n/1k: os r.61 f.00 h.83 0.521s<br>p78 1n/1k: os r.94 f.01 h.85 0.544s<br>p79 1n/1k: os r.93 f.01 h.95 0.501s | one-shot+root |
| dance-with-the-balamb-fish | ch 16 prog 64,73 | drum mode | 13 | 2 {80,81} | p64 7n/1k: lp r.72 f.01 h.70 0.72s<br>p73 6n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| dance-with-the-balamb-fish | ch 17 prog 65 | drum mode | 24 | 1 {38} | p65 24n/1k: os r.67 f.15 h.65 0.295s | one-shot+root |
| dance-with-the-balamb-fish | ch 18 prog 66 | drum mode | 20 | 1 {59} | p66 20n/1k: os r- f.27 h.15 2.634s | one-shot, no root |
| dead-end | ch 13 prog 78 | one pitch ≥12 | 256 | 1 {80} | p78 256n/1k: lp r.83 f.01 h.88 0.155s | looped+root |
| dead-end | ch 18 prog 73 | one pitch ≥12 | 113 | 1 {24} | p73 113n/1k: os r- f.28 h.24 0.182s | one-shot, no root |
| dead-end | ch 21 prog 74 | drum mode | 174 | 1 {55} | p74 174n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| don-t-be-afraid-extended-intro | ch 10 prog 64,71 | drum mode | 11 | 8 {26,29,31,33,35,36,38,72} | p64 2n/1k: os r- f.39 h.08 0.83s<br>p71 9n/7k: lp r.89 f.00 h.96 0.203s | mixed loop |
| don-t-be-afraid-extended-intro | ch 11 prog 70,76,64 | drum mode | 38 | 5 {72,74,76,77,79} | p64 1n/1k: os r- f.39 h.08 0.83s<br>p70 32n/1k: os r.51 f.24 h.48 0.334s<br>p76 5n/3k: lp r.84 f.00 h.87 0.352s | mixed loop |
| don-t-be-afraid-extended-intro | ch 12 prog 74 kit | one pitch ≥12 | 278 | 1 {80} | p74 278n/1k: os r.78 f.01 h.76 0.241s | one-shot+root |
| don-t-be-afraid-extended-intro | ch 13 prog 67 kit | one pitch ≥12 | 336 | 1 {33} | p67 336n/1k: os r- f.47 h.22 0.033s | one-shot, no root |
| don-t-be-afraid-extended-intro | ch 14 prog 64 | drum mode | 16 | 1 {72} | p64 16n/1k: os r- f.39 h.08 0.83s | one-shot, no root |
| don-t-be-afraid-extended-intro | ch 15 prog 70 | drum mode | 265 | 1 {55} | p70 265n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| don-t-be-afraid | ch 12 prog 74 | one pitch ≥12 | 278 | 1 {80} | p74 278n/1k: os r.78 f.01 h.76 0.241s | one-shot+root |
| don-t-be-afraid | ch 13 prog 67 | one pitch ≥12 | 336 | 1 {33} | p67 336n/1k: os r- f.47 h.22 0.033s | one-shot, no root |
| don-t-be-afraid | ch 14 prog 64 | drum mode | 16 | 1 {72} | p64 16n/1k: os r- f.39 h.08 0.83s | one-shot, no root |
| don-t-be-afraid | ch 15 prog 70 | drum mode | 269 | 1 {55} | p70 269n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| fear | ch 18 prog 74,75 | drum mode | 64 | 2 {42,46} | p74 50n/1k: os r- f.30 h.15 0.119s<br>p75 14n/1k: os r- f.19 h.26 0.554s | one-shot, no root |
| fear | ch 19 prog 72,71 | drum mode | 21 | 2 {80,81} | p71 6n/1k: lp r.72 f.01 h.70 0.72s<br>p72 15n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| female-chant | ch 1 prog 68,69,70,71 | drum mode | 4 | 4 {38,50,62,74} | p68 1n/1k: os r.97 f.00 h.99 0.928s<br>p69 1n/1k: os r.98 f.00 h.99 0.967s<br>p70 1n/1k: os r.95 f.00 h.97 0.93s<br>p71 1n/1k: os r.88 f.00 h.99 0.842s | one-shot+root |
| fithos-lusec-wecos-vinosec-variation | ch 10 prog 82 | one pitch ≥12 | 21 | 1 {59} | p82 21n/1k: os r- f.09 h.43 0.973s | one-shot, no root |
| fithos-lusec-wecos-vinosec-variation | ch 11 prog 87 | one pitch ≥12 | 146 | 1 {60} | p87 146n/1k: os r- f.12 h.46 0.288s | one-shot, no root |
| fithos-lusec-wecos-vinosec-variation | ch 15 prog 86 | one pitch ≥12 | 264 | 1 {60} | p86 264n/1k: os r.85 f.00 h.97 0.272s | one-shot+root |
| fithos-lusec-wecos-vinosec-variation | ch 18 prog 65 | one pitch ≥12 | 120 | 1 {60} | p65 120n/1k: os r.52 f.10 h.41 0.056s | one-shot+root |
| fithos-lusec-wecos-vinosec-variation | ch 21 prog 85 | drum mode | 244 | 1 {60} | p85 244n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| fithos-lusec-wecos-vinosec | ch 10 prog 82 | one pitch ≥12 | 18 | 1 {59} | p82 18n/1k: os r- f.09 h.43 0.973s | one-shot, no root |
| fithos-lusec-wecos-vinosec | ch 11 prog 87 | one pitch ≥12 | 98 | 1 {60} | p87 98n/1k: os r- f.12 h.46 0.288s | one-shot, no root |
| fithos-lusec-wecos-vinosec | ch 15 prog 86 | one pitch ≥12 | 190 | 1 {60} | p86 190n/1k: os r.85 f.00 h.97 0.272s | one-shot+root |
| fithos-lusec-wecos-vinosec | ch 18 prog 65 | one pitch ≥12 | 70 | 1 {60} | p65 70n/1k: os r.52 f.10 h.41 0.056s | one-shot+root |
| fithos-lusec-wecos-vinosec | ch 21 prog 85 | drum mode | 122 | 1 {60} | p85 122n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| force-your-way | ch 19 prog 79 | drum mode | 28 | 1 {51} | p79 28n/1k: lp r- f.07 h.26 0.187s | looped, no root |
| force-your-way | ch 20 prog 81 | drum mode | 15 | 1 {49} | p81 15n/1k: os r- f.20 h.24 1.291s | one-shot, no root |
| force-your-way | ch 21 prog 73 | drum mode | 721 | 2 {42,46} | p73 721n/2k: os r- f.20 h.17 0.296s | one-shot, no root |
| force-your-way | ch 22 prog 73 | drum mode | 8 | 1 {42} | p73 8n/1k: os r- f.20 h.17 0.296s | one-shot, no root |
| force-your-way | ch 23 prog 70,71,74 | drum mode | 7 | 3 {41,45,48} | p70 4n/1k: os r.86 f.00 h.93 0.368s<br>p71 2n/1k: os r.86 f.00 h.93 0.368s<br>p74 1n/1k: os r.86 f.00 h.93 0.368s | one-shot+root |
| force-your-way | ch 24 prog 71,74 | drum mode | 3 | 2 {41,45} | p71 2n/1k: os r.86 f.00 h.93 0.368s<br>p74 1n/1k: os r.86 f.00 h.93 0.368s | one-shot+root |
| force-your-way | ch 25 prog 74 | drum mode | 1 | 1 {41} | p74 1n/1k: os r.86 f.00 h.93 0.368s | one-shot+root |
| force-your-way | ch 26 prog 68 | drum mode | 233 | 1 {36} | p68 233n/1k: os r.93 f.01 h.96 0.239s | one-shot+root |
| force-your-way | ch 27 prog 69 | drum mode | 82 | 1 {38} | p69 82n/1k: os r- f.23 h.46 0.393s | one-shot, no root |
| galbadia-garden-no-intro | ch 20 prog 71 | drum mode | 236 | 1 {69} | p71 236n/1k: os r- f.23 h.24 0.282s | one-shot, no root |
| galbadia-garden-no-intro | ch 21 prog 69,70 | drum mode | 71 | 2 {45,46} | p69 60n/1k: os r- f.12 h.25 0.077s<br>p70 11n/1k: os r.81 f.01 h.77 0.777s | one-shot, some root |
| galbadia-garden | ch 20 prog 71 | drum mode | 226 | 1 {69} | p71 226n/1k: os r- f.23 h.24 0.282s | one-shot, no root |
| galbadia-garden | ch 21 prog 69,70 | drum mode | 66 | 2 {45,46} | p69 56n/1k: os r- f.12 h.25 0.077s<br>p70 10n/1k: os r.81 f.01 h.77 0.777s | one-shot, some root |
| intruders | ch 1 prog 74,75 | drum mode | 61 | 2 {80,81} | p74 41n/1k: lp r.72 f.01 h.70 0.72s<br>p75 20n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| intruders | ch 10 prog 68 | one pitch ≥12 | 147 | 1 {53} | p68 147n/1k: os r- f.04 h.32 0.731s | one-shot, no root |
| jailed | ch 13 prog 70 | drum mode | 148 | 1 {51} | p70 148n/1k: os r- f.05 h.36 0.46s | one-shot, no root |
| love-grows | ch 26 prog 74 | drum mode | 3 | 1 {81} | p74 3n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| lunatic-pandora | ch 19 prog 73 | drum mode | 360 | 1 {38} | p73 360n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| male-chant | ch 1 prog 68,69,70,71 | drum mode | 4 | 4 {38,50,62,74} | p68 1n/1k: os r.93 f.01 h.69 1.092s<br>p69 1n/1k: os r.98 f.00 h.50 1.142s<br>p70 1n/1k: os r.85 f.01 h.49 1.29s<br>p71 1n/1k: os r.97 f.00 h.71 1.168s | one-shot+root |
| martial-law | ch 27 prog 69 | drum mode | 424 | 1 {69} | p69 424n/1k: os r- f.24 h.14 0.119s | one-shot, no root |
| martial-law | ch 28 prog 77 | drum mode | 80 | 1 {37} | p77 80n/1k: os r- f.21 h.38 0.282s | one-shot, no root |
| martial-law | ch 31 prog 78 | drum mode | 7 | 2 {38,40} | p78 7n/2k: os r.52 f.08 h.57 0.671s | one-shot+root |
| martial-law | ch 32 prog 76 | drum mode | 94 | 1 {36} | p76 94n/1k: os r.95 f.00 h.95 0.606s | one-shot+root |
| maybe-i-m-a-lion | ch 13 prog 73 | drum mode | 485 | 1 {50} | p73 485n/1k: os r.83 f.00 h.93 0.28s | one-shot+root |
| maybe-i-m-a-lion | ch 14 prog 72 | drum mode | 485 | 1 {52} | p72 485n/1k: os r.75 f.00 h.83 0.154s | one-shot+root |
| maybe-i-m-a-lion | ch 15 prog 71 | drum mode | 309 | 1 {53} | p71 309n/1k: os r.67 f.01 h.80 0.153s | one-shot+root |
| maybe-i-m-a-lion | ch 16 prog 74 | drum mode | 36 | 1 {55} | p74 36n/1k: os r.54 f.03 h.53 0.123s | one-shot+root |
| maybe-i-m-a-lion | ch 17 prog 75 | drum mode | 475 | 1 {66} | p75 475n/1k: os r.67 f.06 h.65 0.165s | one-shot+root |
| maybe-i-m-a-lion | ch 18 prog 65 | drum mode | 42 | 1 {49} | p65 42n/1k: os r- f.09 h.30 0.554s | one-shot, no root |
| maybe-i-m-a-lion | ch 19 prog 66 | drum mode | 312 | 2 {42,46} | p66 312n/2k: os r- f.18 h.18 0.255s | one-shot, no root |
| maybe-i-m-a-lion | ch 20 prog 69 | drum mode | 12 | 2 {41,45} | p69 12n/2k: os r.71 f.03 h.77 0.305s | one-shot+root |
| maybe-i-m-a-lion | ch 21 prog 68 | drum mode | 150 | 1 {40} | p68 150n/1k: os r- f.22 h.19 0.23s | one-shot, no root |
| maybe-i-m-a-lion | ch 22 prog 67 | drum mode | 266 | 1 {36} | p67 266n/1k: os r.90 f.00 h.91 0.302s | one-shot+root |
| maybe-i-m-a-lion | ch 23 prog 64 | drum mode | 41 | 1 {47} | p64 41n/1k: os r- f.04 h.32 0.176s | one-shot, no root |
| mods-de-chocobo | ch 2 prog 80 | drum mode | 4 | 1 {60} | p80 4n/1k: os r.84 f.01 h.89 4.436s | one-shot+root |
| mods-de-chocobo | ch 6 prog 78 | drum mode | 31 | 1 {49} | p78 31n/1k: os r- f.15 h.30 0.956s | one-shot, no root |
| mods-de-chocobo | ch 7 prog 79 | drum mode | 522 | 1 {54} | p79 522n/1k: os r- f.07 h.26 0.242s | one-shot, no root |
| mods-de-chocobo | ch 8 prog 76 | drum mode | 32 | 1 {91} | p76 32n/1k: os r- f.10 h.17 0.327s | one-shot, no root |
| mods-de-chocobo | ch 9 prog 77 | drum mode | 216 | 1 {40} | p77 216n/1k: os r- f.24 h.34 0.308s | one-shot, no root |
| mods-de-chocobo | ch 10 prog 75 | drum mode | 243 | 1 {36} | p75 243n/1k: os r- f.02 h.58 0.221s | one-shot, no root |
| movin | ch 24 prog 66 | drum mode | 12 | 1 {59} | p66 12n/1k: os r- f.24 h.15 0.545s | one-shot, no root |
| movin | ch 25 prog 64 | drum mode | 358 | 1 {38} | p64 358n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| movin | ch 26 prog 64 | drum mode | 1 | 1 {38} | p64 1n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| movin | ch 28 prog 67 | drum mode | 137 | 1 {36} | p67 137n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| movin | ch 31 prog 68 | drum mode | 42 | 1 {75} | p68 42n/1k: os r.69 f.04 h.72 0.282s | one-shot+root |
| never-look-back | ch 1 prog 76 | one pitch ≥12 | 166 | 1 {36} | p76 166n/1k: os r- f.28 h.24 0.182s | one-shot, no root |
| never-look-back | ch 12 prog 83 | drum mode | 10 | 1 {49} | p83 10n/1k: os r- f.20 h.24 1.291s | one-shot, no root |
| never-look-back | ch 18 prog 67 kit | one pitch ≥12 | 384 | 1 {42} | p67 384n/1k: os r- f.10 h.29 0.109s | one-shot, no root |
| never-look-back | ch 19 prog 69 kit | one pitch ≥12 | 312 | 1 {63} | p69 312n/1k: os r.90 f.00 h.88 0.083s | one-shot+root |
| never-look-back | ch 20 prog 77 kit | one pitch ≥12 | 40 | 1 {71} | p77 40n/1k: os r- f.35 h.13 0.171s | one-shot, no root |
| never-look-back | ch 21 prog 70 kit | one pitch ≥12 | 120 | 1 {68} | p70 120n/1k: os r.86 f.01 h.85 0.066s | one-shot+root |
| never-look-back | ch 22 prog 79 kit | one pitch ≥12 | 288 | 1 {80} | p79 288n/1k: lp r.83 f.01 h.88 0.155s | looped+root |
| only-a-plank-between-one-and-perdition | ch 4 prog 70,69 | drum mode | 485 | 2 {42,46} | p69 370n/1k: os r- f.12 h.43 0.114s<br>p70 115n/1k: os r- f.15 h.47 0.494s | one-shot, no root |
| only-a-plank-between-one-and-perdition | ch 5 prog 67 | drum mode | 127 | 1 {60} | p67 127n/1k: os r.89 f.00 h.93 0.389s | one-shot+root |
| only-a-plank-between-one-and-perdition | ch 6 prog 83 | drum mode | 180 | 1 {41} | p83 180n/1k: os r.73 f.00 h.97 0.421s | one-shot+root |
| only-a-plank-between-one-and-perdition | ch 7 prog 65 | drum mode | 48 | 1 {36} | p65 48n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| only-a-plank-between-one-and-perdition | ch 13 prog 71 | drum mode | 24 | 1 {54} | p71 24n/1k: os r.55 f.02 h.61 0.282s | one-shot+root |
| only-a-plank-between-one-and-perdition | ch 14 prog 68 | drum mode | 127 | 1 {72} | p68 127n/1k: os r.89 f.00 h.95 0.389s | one-shot+root |
| overture | ch 24 prog 66 | drum mode | 18 | 1 {59} | p66 18n/1k: os r- f.29 h.11 0.51s | one-shot, no root |
| overture | ch 25 prog 64 | drum mode | 824 | 1 {38} | p64 824n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| overture | ch 27 prog 73 | drum mode | 96 | 1 {83} | p73 96n/1k: os r- f.03 h.41 0.404s | one-shot, no root |
| premonition | ch 23 prog 67 | drum mode | 288 | 1 {47} | p67 288n/1k: os r- f.04 h.32 0.176s | one-shot, no root |
| premonition | ch 24 prog 66 | drum mode | 12 | 1 {59} | p66 12n/1k: os r- f.23 h.12 0.714s | one-shot, no root |
| premonition | ch 25 prog 64 | drum mode | 509 | 1 {38} | p64 509n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| residents | ch 13 prog 81 | drum mode | 36 | 2 {80,81} | p81 36n/2k: os r.87 f.00 h.86 0.633s | one-shot+root |
| residents | ch 14 prog 77,78 | drum mode | 148 | 2 {42,46} | p77 110n/1k: os r- f.38 h.12 0.248s<br>p78 38n/1k: os r- f.30 h.16 0.887s | one-shot, no root |
| residents | ch 15 prog 79 | drum mode | 34 | 1 {82} | p79 34n/1k: os r- f.14 h.34 0.183s | one-shot, no root |
| retaliation | ch 22 prog 76 | drum mode | 4 | 1 {59} | p76 4n/1k: os r- f.29 h.11 0.895s | one-shot, no root |
| retaliation | ch 23 prog 65 | drum mode | 78 | 1 {38} | p65 78n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| ride-on | ch 17 prog 65 | drum mode | 80 | 2 {80,81} | p65 80n/2k: os r.87 f.00 h.86 0.633s | one-shot+root |
| ride-on | ch 19 prog 86 | drum mode | 6 | 1 {59} | p86 6n/1k: os r- f.24 h.19 1.719s | one-shot, no root |
| ride-on | ch 20 prog 68 | drum mode | 380 | 2 {42,46} | p68 380n/2k: os r- f.20 h.17 0.296s | one-shot, no root |
| ride-on | ch 21 prog 67 | drum mode | 64 | 1 {38} | p67 64n/1k: os r- f.17 h.50 0.568s | one-shot, no root |
| ride-on | ch 22 prog 66 | drum mode | 143 | 1 {36} | p66 143n/1k: os r.80 f.00 h.77 0.082s | one-shot+root |
| ride-on | ch 23 prog 64 | one pitch ≥12 | 46 | 1 {49} | p64 46n/1k: lp r.74 f.00 h.80 0.408s | looped+root |
| ride-on | ch 27 prog 67 | drum mode | 64 | 1 {40} | p67 64n/1k: os r- f.17 h.50 0.568s | one-shot, no root |
| seed | ch 5 prog 65 | drum mode | 208 | 1 {55} | p65 208n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| seed | ch 6 prog 65 | drum mode | 208 | 1 {38} | p65 208n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| seed | ch 7 prog 64 | drum mode | 78 | 1 {36} | p64 78n/1k: os r- f.00 h.43 1.35s | one-shot, no root |
| shuffle-or-boogie | ch 2 prog 68 | one pitch ≥12 | 42 | 1 {64} | p68 42n/1k: os r- f.33 h.20 0.26s | one-shot, no root |
| shuffle-or-boogie | ch 5 prog 66 | drum mode | 99 | 1 {36} | p66 99n/1k: os r.85 f.00 h.84 0.241s | one-shot+root |
| shuffle-or-boogie | ch 15 prog 69 | one pitch ≥12 | 42 | 1 {64} | p69 42n/1k: os r- f.32 h.14 0.26s | one-shot, no root |
| silence-and-motion | ch 20 prog 72 | drum mode | 4 | 1 {81} | p72 4n/1k: os r.87 f.00 h.86 0.633s | one-shot+root |
| silence-and-motion | ch 21 prog 73 | drum mode | 128 | 1 {80} | p73 128n/1k: os r- f.45 h.11 0.089s | one-shot, no root |
| silence-and-motion | ch 22 prog 68,69,71,70 | drum mode | 149 | 4 {64,68,70,83} | p68 40n/1k: os r.51 f.00 h.56 0.051s<br>p69 35n/1k: os r- f.10 h.09 0.063s<br>p70 39n/1k: os r.98 f.01 h.95 0.036s<br>p71 35n/1k: os r.95 f.00 h.95 0.091s | one-shot, some root |
| slide-show-part-1 | ch 7 prog 72 | drum mode | 1 | 1 {36} | p72 1n/1k: lp r- f.24 h.46 3.412s | looped, no root |
| starting-up | ch 17 prog 70,78 | drum mode | 64 | 2 {42,46} | p70 40n/1k: os r- f.33 h.17 0.092s<br>p78 24n/1k: os r- f.21 h.22 0.294s | one-shot, no root |
| starting-up | ch 18 prog 73 | drum mode | 5 | 1 {49} | p73 5n/1k: os r- f.13 h.32 0.587s | one-shot, no root |
| starting-up | ch 20 prog 85 | one pitch ≥12 | 16 | 1 {75} | p85 16n/1k: os r.69 f.05 h.72 0.27s | one-shot+root |
| starting-up | ch 21 prog 69,80 | one pitch ≥12 | 64 | 2 {60,62} | p69 46n/1k: os r.80 f.04 h.82 0.119s<br>p80 18n/1k: os r.62 f.09 h.61 0.199s | one-shot+root |
| succession-of-witches | ch 1 prog 73,74,75,76 | drum mode | 8 | 4 {60,62,64,67} | p73 2n/1k: os r.97 f.00 h.99 0.56s<br>p74 2n/1k: os r.98 f.00 h.99 0.504s<br>p75 2n/1k: os r.97 f.03 h.97 0.532s<br>p76 2n/1k: os r.89 f.00 h.99 0.505s | one-shot+root |
| succession-of-witches | ch 23 prog 67,69 | drum mode | 28 | 2 {80,81} | p67 20n/1k: lp r.72 f.01 h.70 0.72s<br>p69 8n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| succession-of-witches | ch 25 prog 80 | drum mode | 6 | 1 {65} | p80 6n/1k: os r.85 f.00 h.83 0.155s | one-shot+root |
| tears-of-the-moon-descent | ch 16 prog 71 | drum mode | 1 | 1 {81} | p71 1n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| tears-of-the-moon-descent | ch 17 prog 64 | drum mode | 7 | 1 {59} | p64 7n/1k: os r- f.39 h.08 0.83s | one-shot, no root |
| tears-of-the-moon | ch 16 prog 71 | drum mode | 2 | 1 {81} | p71 2n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| tears-of-the-moon | ch 17 prog 64 | drum mode | 7 | 1 {59} | p64 7n/1k: os r- f.39 h.08 0.83s | one-shot, no root |
| tell-me | ch 13 prog 76 | drum mode | 1 | 1 {81} | p76 1n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| the-castle | ch 20 prog 64 | drum mode | 5 | 1 {78} | p64 5n/1k: os r- f.49 h.10 0.331s | one-shot, no root |
| the-castle | ch 21 prog 65 | drum mode | 5 | 1 {75} | p65 5n/1k: os r.68 f.05 h.71 0.224s | one-shot+root |
| the-castle | ch 22 prog 67 | drum mode | 10 | 1 {41} | p67 10n/1k: os r.84 f.00 h.89 0.484s | one-shot+root |
| the-castle | ch 23 prog 71 | drum mode | 12 | 3 {66,68,70} | p71 12n/3k: os r.56 f.03 h.52 0.104s | one-shot+root |
| the-extreme | ch 24 prog 80 | drum mode | 184 | 1 {54} | p80 184n/1k: os r- f.07 h.28 0.209s | one-shot, no root |
| the-extreme | ch 25 prog 79 | drum mode | 26 | 1 {49} | p79 26n/1k: os r- f.12 h.21 0.86s | one-shot, no root |
| the-extreme | ch 26 prog 77 | drum mode | 465 | 2 {42,46} | p77 465n/2k: os r- f.20 h.17 0.296s | one-shot, no root |
| the-extreme | ch 27 prog 78 | drum mode | 127 | 1 {38} | p78 127n/1k: os r- f.25 h.46 0.266s | one-shot, no root |
| the-extreme | ch 28 prog 76 | drum mode | 365 | 1 {36} | p76 365n/1k: os r.80 f.00 h.77 0.082s | one-shot+root |
| the-landing-demo | ch 17 prog 77 | one pitch ≥12 | 26 | 1 {84} | p77 26n/1k: os r.74 f.00 h.73 0.131s | one-shot+root |
| the-landing-demo | ch 18 prog 68 | one pitch ≥12 | 20 | 1 {60} | p68 20n/1k: lp r- f.30 h.14 0.573s | looped, no root |
| the-landing-demo | ch 20 prog 69 | one pitch ≥12 | 412 | 1 {55} | p69 412n/1k: os r.65 f.07 h.62 0.102s | one-shot+root |
| the-landing-demo | ch 22 prog 65 | one pitch ≥12 | 16 | 1 {55} | p65 16n/1k: os r- f.00 h.37 0.105s | one-shot, no root |
| the-landing | ch 26 prog 68 | drum mode | 20 | 1 {55} | p68 20n/1k: os r.58 f.00 h.61 0.23s | one-shot+root |
| the-landing | ch 27 prog 81 | drum mode | 78 | 1 {36} | p81 78n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| the-landing | ch 28 prog 83 | drum mode | 31 | 1 {57} | p83 31n/1k: lp r- f.24 h.14 0.74s | looped, no root |
| the-landing | ch 29 prog 65 | drum mode | 657 | 1 {38} | p65 657n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| the-legendary-beast | ch 14 prog 68 | drum mode | 4 | 1 {60} | p68 4n/1k: lp r- f.03 h.35 0.634s | looped, no root |
| the-legendary-beast | ch 15 prog 76 | drum mode | 29 | 1 {59} | p76 29n/1k: os r- f.27 h.12 0.578s | one-shot, no root |
| the-legendary-beast | ch 16 prog 73 | drum mode | 22 | 1 {75} | p73 22n/1k: os r.68 f.03 h.72 0.194s | one-shot+root |
| the-legendary-beast | ch 17 prog 70 | drum mode | 360 | 1 {45} | p70 360n/1k: os r- f.19 h.25 0.371s | one-shot, no root |
| the-legendary-beast | ch 18 prog 70 | drum mode | 360 | 1 {43} | p70 360n/1k: os r- f.19 h.25 0.371s | one-shot, no root |
| the-legendary-beast | ch 19 prog 70 | drum mode | 360 | 1 {41} | p70 360n/1k: os r- f.19 h.25 0.371s | one-shot, no root |
| the-legendary-beast | ch 20 prog 65 | drum mode | 693 | 1 {38} | p65 693n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| the-legendary-beast | ch 21 prog 65 | drum mode | 55 | 1 {38} | p65 55n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| the-legendary-beast | ch 23 prog 67 | drum mode | 152 | 1 {36} | p67 152n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| the-loser | ch 7 prog 75 | drum mode | 3 | 1 {81} | p75 3n/1k: lp r.78 f.01 h.78 0.961s | looped+root |
| the-man-with-the-machine-gun | ch 16 prog 69 | drum mode | 1 | 1 {57} | p69 1n/1k: os r- f.12 h.32 0.389s | one-shot, no root |
| the-man-with-the-machine-gun | ch 17 prog 67,68 | drum mode | 460 | 2 {42,46} | p67 276n/1k: os r- f.27 h.18 0.099s<br>p68 184n/1k: os r- f.23 h.16 0.314s | one-shot, no root |
| the-man-with-the-machine-gun | ch 18 prog 70 | drum mode | 8 | 1 {75} | p70 8n/1k: os r.64 f.06 h.70 0.38s | one-shot+root |
| the-man-with-the-machine-gun | ch 19 prog 71 | drum mode | 48 | 1 {41} | p71 48n/1k: os r- f.33 h.15 0.168s | one-shot, no root |
| the-man-with-the-machine-gun | ch 20 prog 72 | drum mode | 288 | 1 {80} | p72 288n/1k: os r- f.46 h.13 0.22s | one-shot, no root |
| the-man-with-the-machine-gun | ch 21 prog 71 | drum mode | 8 | 1 {41} | p71 8n/1k: os r- f.33 h.15 0.168s | one-shot, no root |
| the-man-with-the-machine-gun | ch 22 prog 66 | drum mode | 56 | 1 {38} | p66 56n/1k: os r- f.21 h.51 0.192s | one-shot, no root |
| the-man-with-the-machine-gun | ch 23 prog 65 | drum mode | 124 | 1 {40} | p65 124n/1k: os r.64 f.28 h.65 0.252s | one-shot+root |
| the-man-with-the-machine-gun | ch 24 prog 64 | drum mode | 208 | 1 {36} | p64 208n/1k: os r.88 f.00 h.89 0.189s | one-shot+root |
| the-mission | ch 16 prog 75 | drum mode | 2 | 1 {58} | p75 2n/1k: os r- f.13 h.22 0.293s | one-shot, no root |
| the-mission | ch 17 prog 79,70 | drum mode | 280 | 2 {80,81} | p70 112n/1k: lp r.72 f.01 h.70 0.72s<br>p79 168n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| the-mission | ch 18 prog 74 | drum mode | 7 | 1 {65} | p74 7n/1k: os r.63 f.04 h.62 0.159s | one-shot+root |
| the-mission | ch 19 prog 69 | drum mode | 55 | 1 {36} | p69 55n/1k: os r.60 f.01 h.56 0.519s | one-shot+root |
| the-mission | ch 20 prog 80 | drum mode | 2 | 1 {55} | p80 2n/1k: os r- f.14 h.24 0.883s | one-shot, no root |
| the-mission | ch 21 prog 73 | drum mode | 35 | 1 {38} | p73 35n/1k: os r.96 f.05 h.99 0.345s | one-shot+root |
| the-mission | ch 22 prog 66 | drum mode | 55 | 1 {45} | p66 55n/1k: os r.86 f.01 h.83 0.409s | one-shot+root |
| the-mission | ch 23 prog 67 | drum mode | 55 | 1 {43} | p67 55n/1k: os r.86 f.01 h.83 0.409s | one-shot+root |
| the-mission | ch 24 prog 68 | drum mode | 56 | 1 {41} | p68 56n/1k: os r.86 f.01 h.83 0.409s | one-shot+root |
| the-salt-flats | ch 15 prog 75 | drum mode | 130 | 1 {83} | p75 130n/1k: os r- f.05 h.37 0.317s | one-shot, no root |
| the-salt-flats | ch 16 prog 76 | drum mode | 129 | 2 {80,81} | p76 129n/2k: os r.87 f.01 h.86 0.45s | one-shot+root |
| the-spy | ch 1 prog 69 | drum mode | 597 | 2 {42,46} | p69 597n/2k: os r- f.22 h.14 0.432s | one-shot, no root |
| the-spy | ch 10 prog 74 | drum mode | 8 | 1 {60} | p74 8n/1k: os r- f.04 h.90 0.959s | one-shot, no root |
| the-spy | ch 11 prog 71 | drum mode | 34 | 1 {62} | p71 34n/1k: os r.78 f.17 h.28 1.389s | one-shot+root |
| the-spy | ch 12 prog 73 | drum mode | 12 | 1 {64} | p73 12n/1k: os r.79 f.04 h.84 0.38s | one-shot+root |
| the-spy | ch 13 prog 72 | drum mode | 59 | 1 {65} | p72 59n/1k: os r- f.01 h.85 0.193s | one-shot, no root |
| the-spy | ch 14 prog 72 | drum mode | 69 | 1 {65} | p72 69n/1k: os r- f.01 h.85 0.193s | one-shot, no root |
| the-stage-is-set | ch 16 prog 66 | drum mode | 3 | 1 {57} | p66 3n/1k: os r- f.27 h.15 1.204s | one-shot, no root |
| the-stage-is-set | ch 17 prog 65 | drum mode | 491 | 1 {38} | p65 491n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| the-winner | ch 22 prog 72,66 | drum mode | 17 | 2 {60,72} | p66 13n/1k: os r- f.13 h.32 0.587s<br>p72 4n/1k: lp r- f.10 h.51 0.301s | mixed loop |
| the-winner | ch 23 prog 78,65 | drum mode | 329 | 3 {42,46,55} | p65 291n/2k: os r- f.23 h.14 0.286s<br>p78 38n/1k: os r.51 f.24 h.48 0.334s | one-shot, some root |
| the-winner | ch 24 prog 64 | drum mode | 99 | 1 {36} | p64 99n/1k: os r.90 f.00 h.91 0.302s | one-shot+root |
| timber-owls | ch 8 prog 74,73 | drum mode | 118 | 2 {73,74} | p73 73n/1k: os r- f.28 h.25 0.161s<br>p74 45n/1k: os r- f.30 h.41 0.44s | one-shot, no root |
| timber-owls | ch 9 prog 75,76 | drum mode | 94 | 2 {80,81} | p75 49n/1k: lp r.72 f.01 h.70 0.72s<br>p76 45n/1k: lp r.72 f.01 h.70 0.72s | looped+root |
| timber-owls | ch 10 prog 72,71 | drum mode | 68 | 2 {76,77} | p71 34n/1k: os r.73 f.01 h.83 0.343s<br>p72 34n/1k: os r.77 f.01 h.86 0.225s | one-shot+root |
| timber-owls | ch 11 prog 77 | drum mode | 3 | 1 {68} | p77 3n/1k: os r.87 f.00 h.92 0.21s | one-shot+root |
| under-her-control | ch 8 prog 73 | drum mode | 41 | 1 {51} | p73 41n/1k: os r- f.05 h.36 0.46s | one-shot, no root |
| under-her-control | ch 9 prog 75 | drum mode | 302 | 2 {42,46} | p75 302n/2k: os r- f.09 h.36 0.284s | one-shot, no root |
| under-her-control | ch 10 prog 74 | drum mode | 95 | 1 {36} | p74 95n/1k: os r.82 f.01 h.78 0.197s | one-shot+root |
| under-her-control | ch 11 prog 70 | drum mode | 192 | 1 {69} | p70 192n/1k: os r- f.25 h.12 0.117s | one-shot, no root |
| waltz-for-the-moon | ch 8 prog 79 | one pitch ≥12 | 77 | 1 {54} | p79 77n/1k: os r- f.10 h.40 0.249s | one-shot, no root |
| waltz-for-the-moon | ch 9 prog 72 | drum mode | 5 | 1 {59} | p72 5n/1k: os r- f.39 h.08 0.83s | one-shot, no root |

### ps1/chrono-cross — 67 songs, 1308 groups, 243 marked kit

By sample shape: one-shot+root 122 · looped+root 23 · one-shot, no root 62 · looped, no root 12 · mixed loop 13 · one-shot, some root 11. By rule: one pitch ≥12 12 · drum mode 231. Kit groups with > 6 written keys: 2 (mixed loop 1 · one-shot, some root 1).

| Song | Group | Rule | Notes | Keys | Samples (per program) | Shape |
|---|---|---|---|---|---|---|
| ancient-dragon-s-fort | ch 4 prog 40 | one pitch ≥12 | 24 | 1 {72} | p40 24n/1k: os r.94 f.00 h.86 0.558s | one-shot+root |
| ancient-dragon-s-fort | ch 22 prog 55,56 | drum mode | 44 | 2 {38,41} | p55 36n/1k: os r.51 f.04 h.50 0.879s<br>p56 8n/1k: os r.69 f.04 h.68 0.328s | one-shot+root |
| ancient-dragon-s-fort | ch 23 prog 54 | drum mode | 60 | 1 {36} | p54 60n/1k: os r.96 f.01 h.98 0.5s | one-shot+root |
| ancient-dragon-s-fort | ch 24 prog 57 | drum mode | 9 | 3 {43,45,48} | p57 9n/3k: lp r.80 f.00 h.81 0.403s | looped+root |
| ancient-dragon-s-fort | ch 25 prog 58 | drum mode | 76 | 1 {42} | p58 76n/1k: os r- f.28 h.20 0.201s | one-shot, no root |
| ancient-dragon-s-fort | ch 26 prog 60 | drum mode | 10 | 1 {46} | p60 10n/1k: os r- f.23 h.24 0.474s | one-shot, no root |
| ancient-dragon-s-fort | ch 27 prog 59 | drum mode | 47 | 1 {44} | p59 47n/1k: os r- f.35 h.19 0.211s | one-shot, no root |
| ancient-dragon-s-fort | ch 28 prog 64 | drum mode | 83 | 1 {65} | p64 83n/1k: lp r- f.17 h.17 1.115s | looped, no root |
| ancient-dragon-s-fort | ch 29 prog 63 | drum mode | 14 | 1 {56} | p63 14n/1k: os r.95 f.00 h.94 0.112s | one-shot+root |
| ancient-dragon-s-fort | ch 30 prog 61,62 | drum mode | 96 | 3 {72,77,78} | p61 48n/1k: lp r.65 f.00 h.73 0.178s<br>p62 48n/2k: os r.61 f.01 h.58 0.107s | mixed loop |
| another-arni-village | ch 13 prog 50,45,46,47,49,48 | drum mode | 28 | 6 {61,63,75,78,80,82} | p45 9n/1k: os r.80 f.03 h.94 0.311s<br>p46 5n/1k: os r.65 f.04 h.80 0.418s<br>p47 6n/1k: os r.85 f.04 h.96 0.29s<br>p48 2n/1k: os r.79 f.01 h.82 0.275s<br>p49 2n/1k: os r.97 f.02 h.94 0.252s<br>p50 4n/1k: os r.81 f.09 h.68 0.349s | one-shot+root |
| another-guldove | ch 9 prog 52,51 | drum mode | 7 | 2 {35,36} | p51 3n/1k: os r.76 f.11 h.52 0.448s<br>p52 4n/1k: os r.85 f.19 h.60 0.227s | one-shot+root |
| another-termina | ch 15 prog 55,37,36,54,38 | drum mode | 218 | 5 {38,40,41,48,55} | p36 28n/1k: os r.74 f.00 h.88 0.172s<br>p37 84n/1k: os r.59 f.01 h.83 0.222s<br>p38 14n/1k: os r.63 f.01 h.63 0.125s<br>p54 22n/1k: os r.78 f.01 h.85 0.199s<br>p55 70n/1k: os r- f.05 h.49 0.182s | one-shot, some root |
| another-termina | ch 19 prog 45,46 | drum mode | 161 | 2 {53,54} | p45 79n/1k: os r- f.14 h.12 0.116s<br>p46 82n/1k: os r- f.14 h.20 0.101s | one-shot, no root |
| another-termina | ch 20 prog 73 | drum mode | 57 | 1 {69} | p73 57n/1k: os r- f.24 h.09 0.067s | one-shot, no root |
| another-termina | ch 21 prog 47,48 | drum mode | 242 | 2 {85,88} | p47 120n/1k: os r- f.07 h.49 0.237s<br>p48 122n/1k: os r.50 f.07 h.64 0.23s | one-shot, some root |
| another-termina | ch 22 prog 39 | drum mode | 144 | 2 {90,93} | p39 144n/2k: lp r.81 f.02 h.80 0.291s | looped+root |
| another-termina | ch 23 prog 40 | drum mode | 175 | 1 {43} | p40 175n/1k: os r.89 f.01 h.88 0.341s | one-shot+root |
| another-termina | ch 24 prog 43,44 | drum mode | 512 | 2 {42,44} | p43 372n/1k: os r- f.18 h.38 0.068s<br>p44 140n/1k: os r- f.17 h.41 0.065s | one-shot, no root |
| chrono-main-theme | ch 20 prog 79,78 | drum mode | 512 | 2 {85,86} | p78 256n/1k: os r- f.22 h.19 0.147s<br>p79 256n/1k: os r- f.21 h.17 0.133s | one-shot, no root |
| chrono-main-theme | ch 21 prog 73,76,75 | drum mode | 259 | 3 {42,44,46} | p73 2n/1k: os r- f.30 h.19 0.108s<br>p75 256n/1k: os r- f.35 h.16 0.249s<br>p76 1n/1k: os r- f.20 h.18 0.549s | one-shot, no root |
| chrono-main-theme | ch 22 prog 74 | drum mode | 128 | 1 {43} | p74 128n/1k: os r- f.35 h.13 0.241s | one-shot, no root |
| chrono-main-theme | ch 23 prog 80,82,81 | drum mode | 352 | 3 {72,74,76} | p80 192n/1k: os r.98 f.00 h.96 0.213s<br>p81 32n/1k: os r- f.06 h.23 0.106s<br>p82 128n/1k: os r.96 f.00 h.93 0.263s | one-shot, some root |
| chrono-main-theme | ch 24 prog 70 | drum mode | 32 | 1 {60} | p70 32n/1k: os r.91 f.00 h.98 0.253s | one-shot+root |
| chrono-main-theme | ch 25 prog 70 | drum mode | 32 | 1 {61} | p70 32n/1k: os r.91 f.00 h.98 0.253s | one-shot+root |
| chrono-main-theme | ch 26 prog 71 | drum mode | 32 | 1 {67} | p71 32n/1k: lp r.93 f.00 h.98 0.24s | looped+root |
| chrono-main-theme | ch 27 prog 69 | drum mode | 64 | 2 {66,71} | p69 64n/2k: lp r.96 f.00 h.99 0.277s | looped+root |
| chrono-main-theme | ch 28 prog 72 | drum mode | 32 | 1 {73} | p72 32n/1k: os r.70 f.00 h.64 0.108s | one-shot+root |
| chrono-main-theme | ch 29 prog 83 | drum mode | 32 | 1 {93} | p83 32n/1k: os r- f.07 h.35 0.486s | one-shot, no root |
| chrono-main-theme | ch 30 prog 77 | drum mode | 1 | 1 {62} | p77 1n/1k: os r- f.20 h.20 0.442s | one-shot, no root |
| chronopolis | ch 1 prog 32 | one pitch ≥12 | 31 | 1 {72} | p32 31n/1k: os r.58 f.01 h.58 2.72s | one-shot+root |
| chronopolis | ch 2 prog 33 | one pitch ≥12 | 31 | 1 {72} | p33 31n/1k: os r.60 f.01 h.55 2.72s | one-shot+root |
| chronopolis | ch 12 prog 36 | drum mode | 35 | 1 {65} | p36 35n/1k: os r.83 f.00 h.84 0.476s | one-shot+root |
| chronopolis | ch 21 prog 37,38 | drum mode | 96 | 2 {42,46} | p37 80n/1k: os r- f.29 h.19 0.162s<br>p38 16n/1k: os r- f.20 h.18 0.421s | one-shot, no root |
| chronopolis | ch 22 prog 39 | drum mode | 24 | 1 {54} | p39 24n/1k: os r- f.09 h.28 0.298s | one-shot, no root |
| cleft-of-dimension | ch 24 prog 54,52,53,56,51,55 | drum mode | 8 | 6 {61,63,75,78,80,82} | p51 1n/1k: os r.80 f.03 h.94 0.311s<br>p52 1n/1k: os r.65 f.04 h.80 0.418s<br>p53 1n/1k: os r.85 f.04 h.96 0.29s<br>p54 3n/1k: os r.79 f.01 h.82 0.275s<br>p55 1n/1k: os r.97 f.02 h.94 0.252s<br>p56 1n/1k: os r.81 f.09 h.68 0.349s | one-shot+root |
| dancing-the-tokage | ch 1 prog 34 | drum mode | 24 | 1 {60} | p34 24n/1k: os r.64 f.00 h.85 1.209s | one-shot+root |
| dancing-the-tokage | ch 13 prog 38,55 | drum mode | 160 | 2 {42,47} | p38 155n/1k: os r- f.23 h.22 0.197s<br>p55 5n/1k: os r- f.21 h.18 0.424s | one-shot, no root |
| dancing-the-tokage | ch 14 prog 42,43 | drum mode | 288 | 2 {51,52} | p42 192n/1k: os r- f.15 h.16 0.126s<br>p43 96n/1k: os r- f.17 h.15 0.133s | one-shot, no root |
| dancing-the-tokage | ch 15 prog 40 | drum mode | 96 | 1 {46} | p40 96n/1k: os r- f.21 h.19 0.063s | one-shot, no root |
| dancing-the-tokage | ch 16 prog 33 | drum mode | 31 | 1 {38} | p33 31n/1k: os r- f.13 h.39 0.342s | one-shot, no root |
| dancing-the-tokage | ch 17 prog 32 | drum mode | 36 | 1 {36} | p32 36n/1k: os r.95 f.00 h.98 0.157s | one-shot+root |
| dancing-the-tokage | ch 18 prog 41 | drum mode | 8 | 1 {64} | p41 8n/1k: lp r.86 f.04 h.87 0.448s | looped+root |
| dead-sea-tower-of-ruin | ch 22 prog 50 | drum mode | 52 | 2 {57,60} | p50 52n/2k: os r.94 f.00 h.98 0.219s | one-shot+root |
| dead-sea-tower-of-ruin | ch 23 prog 50 | drum mode | 51 | 2 {57,60} | p50 51n/2k: os r.94 f.00 h.98 0.219s | one-shot+root |
| dead-sea-tower-of-ruin | ch 25 prog 53,54 | drum mode | 108 | 2 {40,41} | p53 80n/1k: os r.75 f.03 h.70 0.076s<br>p54 28n/1k: lp r.89 f.00 h.90 0.543s | mixed loop |
| dead-sea-tower-of-ruin | ch 26 prog 51 | drum mode | 64 | 1 {84} | p51 64n/1k: os r- f.09 h.17 0.107s | one-shot, no root |
| death-volcano | ch 24 prog 50 | one pitch ≥12 | 29 | 1 {60} | p50 29n/1k: os r.70 f.00 h.69 0.721s | one-shot+root |
| death-volcano | ch 25 prog 51 | one pitch ≥12 | 29 | 1 {60} | p51 29n/1k: os r.82 f.00 h.84 0.721s | one-shot+root |
| death-volcano | ch 26 prog 54,57,58,55,56 | drum mode | 214 | 5 {67,69,71,72,74} | p54 70n/1k: os r.89 f.00 h.89 0.162s<br>p55 20n/1k: os r.81 f.01 h.89 0.253s<br>p56 24n/1k: os r.85 f.00 h.94 0.316s<br>p57 62n/1k: os r.94 f.00 h.98 0.167s<br>p58 38n/1k: os r.70 f.00 h.64 0.108s | one-shot+root |
| death-volcano | ch 27 prog 52,53 | drum mode | 224 | 2 {84,86} | p52 176n/1k: os r- f.09 h.16 0.111s<br>p53 48n/1k: os r- f.20 h.16 0.131s | one-shot, no root |
| death-volcano | ch 28 prog 59 | drum mode | 12 | 1 {94} | p59 12n/1k: os r- f.06 h.44 0.647s | one-shot, no root |
| death-volcano | ch 29 prog 61 | drum mode | 13 | 1 {61} | p61 13n/1k: os r.90 f.00 h.89 0.604s | one-shot+root |
| death-volcano | ch 30 prog 60 | drum mode | 35 | 1 {62} | p60 35n/1k: os r.94 f.00 h.93 0.373s | one-shot+root |
| death-volcano | ch 31 prog 62 | drum mode | 12 | 1 {29} | p62 12n/1k: lp r- f.00 h.29 0.447s | looped, no root |
| dragon-god | ch 17 prog 67,66 | drum mode | 90 | 2 {74,77} | p66 70n/1k: os r.72 f.00 h.73 0.315s<br>p67 20n/1k: os r.89 f.01 h.90 0.297s | one-shot+root |
| dragon-god | ch 19 prog 68 | drum mode | 127 | 1 {52} | p68 127n/1k: os r.89 f.00 h.89 0.363s | one-shot+root |
| dragon-god | ch 21 prog 64,65 | drum mode | 44 | 2 {93,94} | p64 40n/1k: lp r- f.41 h.13 0.895s<br>p65 4n/1k: os r.57 f.03 h.62 0.505s | mixed loop |
| dragon-god | ch 22 prog 63 | drum mode | 3 | 1 {67} | p63 3n/1k: os r.50 f.19 h.19 0.375s | one-shot+root |
| dragon-god | ch 23 prog 65 | drum mode | 16 | 1 {94} | p65 16n/1k: os r.57 f.03 h.62 0.505s | one-shot+root |
| dragon-s-prayer | ch 17 prog 55 | drum mode | 2 | 1 {43} | p55 2n/1k: lp r.76 f.00 h.80 0.808s | looped+root |
| dragon-s-prayer | ch 18 prog 53 | drum mode | 16 | 1 {60} | p53 16n/1k: lp r.95 f.00 h.95 0.566s | looped+root |
| dragon-s-prayer | ch 19 prog 56 | drum mode | 16 | 1 {67} | p56 16n/1k: os r.72 f.03 h.82 0.653s | one-shot+root |
| dragonrider | ch 21 prog 60 | drum mode | 70 | 1 {54} | p60 70n/1k: os r.90 f.00 h.89 0.625s | one-shot+root |
| dragonrider | ch 22 prog 61 | drum mode | 26 | 1 {93} | p61 26n/1k: lp r- f.42 h.12 0.978s | looped, no root |
| dragonrider | ch 23 prog 63,62 | drum mode | 469 | 2 {62,69} | p62 440n/1k: os r- f.32 h.42 0.401s<br>p63 29n/1k: os r- f.29 h.45 0.512s | one-shot, no root |
| earth-dragon-s-island | ch 17 prog 45,46 | drum mode | 176 | 2 {40,41} | p45 132n/1k: os r.73 f.03 h.67 0.084s<br>p46 44n/1k: os r.89 f.00 h.90 0.432s | one-shot+root |
| fates-gods-of-destiny | ch 14 prog 134 | one pitch ≥12 | 19 | 1 {59} | p134 19n/1k: os r.91 f.00 h.90 0.199s | one-shot+root |
| fates-gods-of-destiny | ch 17 prog 62,63 | drum mode | 633 | 2 {42,46} | p62 587n/1k: os r- f.28 h.20 0.201s<br>p63 46n/1k: os r- f.22 h.23 0.281s | one-shot, no root |
| fates-gods-of-destiny | ch 18 prog 65 | drum mode | 153 | 1 {52} | p65 153n/1k: os r.89 f.00 h.89 0.363s | one-shot+root |
| fates-gods-of-destiny | ch 19 prog 64 | drum mode | 153 | 1 {60} | p64 153n/1k: os r.87 f.00 h.84 0.268s | one-shot+root |
| fates-gods-of-destiny | ch 20 prog 71 | one pitch ≥12 | 16 | 1 {59} | p71 16n/1k: os r.61 f.01 h.61 1.072s | one-shot+root |
| fates-gods-of-destiny | ch 21 prog 68,69,70,67 | drum mode | 324 | 4 {64,65,69,72} | p67 36n/1k: os r.96 f.00 h.94 0.124s<br>p68 216n/1k: os r.89 f.00 h.89 0.097s<br>p69 36n/1k: os r.87 f.01 h.79 0.102s<br>p70 36n/1k: lp r.98 f.00 h.95 0.143s | mixed loop |
| fates-gods-of-destiny | ch 22 prog 60 | drum mode | 117 | 1 {76} | p60 117n/1k: os r.74 f.00 h.76 0.629s | one-shot+root |
| fates-gods-of-destiny | ch 23 prog 61 | drum mode | 117 | 1 {77} | p61 117n/1k: os r.89 f.01 h.90 0.297s | one-shot+root |
| fates-gods-of-destiny | ch 24 prog 66 | drum mode | 11 | 1 {59} | p66 11n/1k: lp r- f.21 h.32 1.354s | looped, no root |
| gaia-s-navel | ch 9 prog 36,39,38,37 | drum mode | 12 | 4 {59,60,61,62} | p36 4n/1k: os r.99 f.00 h1.00 0.618s<br>p37 1n/1k: os r.93 f.00 h1.00 0.822s<br>p38 5n/1k: lp r1.00 f.00 h1.00 0.26s<br>p39 2n/1k: os r.99 f.00 h.98 0.78s | mixed loop |
| gaia-s-navel | ch 27 prog 63 | drum mode | 23 | 1 {55} | p63 23n/1k: os r.86 f.00 h.84 0.389s | one-shot+root |
| gaia-s-navel | ch 28 prog 61,60 | drum mode | 68 | 2 {41,42} | p60 22n/1k: os r.52 f.14 h.46 0.121s<br>p61 46n/1k: lp r.83 f.00 h.92 0.906s | mixed loop |
| gaia-s-navel | ch 29 prog 61,68 | drum mode | 23 | 2 {42,67} | p61 22n/1k: lp r.83 f.00 h.92 0.906s<br>p68 1n/1k: os r- f.08 h.52 0.302s | mixed loop |
| gaia-s-navel | ch 30 prog 62,67 | drum mode | 145 | 2 {38,40} | p62 125n/1k: os r.68 f.01 h.64 0.143s<br>p67 20n/1k: os r.68 f.01 h.64 0.143s | one-shot+root |
| gaia-s-navel | ch 31 prog 66 | drum mode | 532 | 1 {73} | p66 532n/1k: os r- f.08 h.52 0.302s | one-shot, no root |
| gaia-s-navel | ch 32 prog 65,64 | drum mode | 650 | 2 {84,86} | p64 234n/1k: os r- f.09 h.16 0.111s<br>p65 416n/1k: os r- f.20 h.16 0.131s | one-shot, no root |
| gale | ch 13 prog 61 | drum mode | 169 | 1 {65} | p61 169n/1k: os r.53 f.00 h.56 0.548s | one-shot+root |
| gale | ch 14 prog 64 | drum mode | 182 | 1 {48} | p64 182n/1k: os r.52 f.16 h.51 0.448s | one-shot+root |
| gale | ch 15 prog 66 | drum mode | 227 | 1 {38} | p66 227n/1k: os r.91 f.01 h.93 0.276s | one-shot+root |
| gale | ch 16 prog 55,54 | drum mode | 433 | 2 {52,53} | p54 156n/1k: os r- f.18 h.12 0.093s<br>p55 277n/1k: os r- f.17 h.12 0.11s | one-shot, no root |
| gale | ch 17 prog 56 | drum mode | 57 | 1 {67} | p56 57n/1k: os r- f.05 h.48 0.369s | one-shot, no root |
| gale | ch 18 prog 56 | drum mode | 434 | 1 {74} | p56 434n/1k: os r- f.05 h.48 0.369s | one-shot, no root |
| gale | ch 19 prog 60 | drum mode | 224 | 1 {64} | p60 224n/1k: os r- f.06 h.49 0.298s | one-shot, no root |
| gale | ch 20 prog 57 | drum mode | 19 | 4 {91,93,96,98} | p57 19n/4k: os r.77 f.01 h.76 0.317s | one-shot+root |
| gale | ch 21 prog 67 | drum mode | 25 | 2 {49,57} | p67 25n/2k: lp r- f.16 h.24 1.001s | looped, no root |
| gale | ch 22 prog 67,62 | drum mode | 40 | 2 {41,49} | p62 38n/1k: os r- f.05 h.45 0.989s<br>p67 2n/1k: lp r- f.16 h.24 1.001s | mixed loop |
| gale | ch 23 prog 63,67 | drum mode | 32 | 2 {49,79} | p63 30n/1k: os r- f.05 h.45 0.989s<br>p67 2n/1k: lp r- f.16 h.24 1.001s | mixed loop |
| home-guldove | ch 14 prog 61,62,63 | drum mode | 12 | 3 {35,36,37} | p61 7n/1k: os r.60 f.06 h.45 0.247s<br>p62 3n/1k: os r.75 f.17 h.62 0.396s<br>p63 2n/1k: os r.83 f.20 h.59 0.322s | one-shot+root |
| home-guldove | ch 17 prog 52,51,53 | drum mode | 445 | 3 {85,87,88} | p51 208n/1k: os r- f.21 h.14 0.232s<br>p52 113n/1k: os r- f.18 h.12 0.153s<br>p53 124n/1k: os r- f.19 h.12 0.163s | one-shot, no root |
| home-guldove | ch 18 prog 46,45,47 | drum mode | 343 | 3 {62,63,64} | p45 91n/1k: os r.88 f.00 h.91 0.221s<br>p46 234n/1k: os r.85 f.00 h.84 0.28s<br>p47 18n/1k: os r.71 f.01 h.70 0.14s | one-shot+root |
| home-marbule | ch 21 prog 69 | drum mode | 49 | 1 {62} | p69 49n/1k: os r.75 f.02 h.83 0.203s | one-shot+root |
| home-marbule | ch 22 prog 70 | drum mode | 42 | 1 {63} | p70 42n/1k: os r.70 f.03 h.81 0.231s | one-shot+root |
| home-termina-variation | ch 22 prog 62 | drum mode | 72 | 1 {94} | p62 72n/1k: os r- f.06 h.44 0.647s | one-shot, no root |
| home-termina-variation | ch 23 prog 57 | drum mode | 201 | 1 {24} | p57 201n/1k: os r.69 f.00 h.68 0.281s | one-shot+root |
| home-termina-variation | ch 24 prog 59 | drum mode | 201 | 1 {60} | p59 201n/1k: lp r.90 f.00 h.94 0.266s | looped+root |
| home-termina-variation | ch 25 prog 58 | drum mode | 353 | 1 {43} | p58 353n/1k: os r- f.16 h.39 0.051s | one-shot, no root |
| home-termina-variation | ch 26 prog 61,60 | drum mode | 180 | 2 {62,64} | p60 68n/1k: os r.62 f.01 h.61 0.13s<br>p61 112n/1k: os r.89 f.00 h.87 0.258s | one-shot+root |
| home-termina | ch 22 prog 62 | drum mode | 72 | 1 {94} | p62 72n/1k: os r- f.06 h.44 0.647s | one-shot, no root |
| home-termina | ch 23 prog 57 | drum mode | 205 | 1 {24} | p57 205n/1k: os r.69 f.00 h.68 0.281s | one-shot+root |
| home-termina | ch 24 prog 59 | drum mode | 205 | 1 {60} | p59 205n/1k: lp r.90 f.00 h.94 0.266s | looped+root |
| home-termina | ch 25 prog 58 | drum mode | 353 | 1 {43} | p58 353n/1k: os r- f.16 h.39 0.051s | one-shot, no root |
| home-termina | ch 26 prog 61,60 | drum mode | 180 | 2 {62,64} | p60 68n/1k: os r.62 f.01 h.61 0.13s<br>p61 112n/1k: os r.89 f.00 h.87 0.258s | one-shot+root |
| home-village-arni | ch 19 prog 51,49,50,48 | drum mode | 27 | 4 {35,36,37,39} | p48 1n/1k: os r.68 f.10 h.52 0.252s<br>p49 17n/1k: os r.75 f.07 h.61 0.269s<br>p50 1n/1k: os r.64 f.14 h.45 0.326s<br>p51 8n/1k: os r.82 f.00 h.96 0.193s | one-shot+root |
| home-village-arni | ch 20 prog 53,52 | drum mode | 16 | 5 {95,96,100,101,103} | p52 1n/1k: os r.84 f.06 h.73 0.3s<br>p53 15n/4k: os r.73 f.20 h.49 0.427s | one-shot+root |
| hydra-marshes | ch 25 prog 37,38,54 | drum mode | 87 | 3 {61,62,64} | p37 32n/1k: os r.50 f.01 h.48 0.395s<br>p38 40n/1k: os r- f.03 h.32 0.289s<br>p54 15n/1k: os r.77 f.00 h.99 1.088s | one-shot, some root |
| hydra-marshes | ch 26 prog 36 | drum mode | 48 | 1 {60} | p36 48n/1k: os r.78 f.00 h.74 0.432s | one-shot+root |
| hydra-marshes | ch 27 prog 40,41,42,43,44,45 | drum mode | 171 | 6 {76,77,78,79,80,81} | p40 28n/1k: os r.87 f.00 h.86 0.396s<br>p41 40n/1k: os r- f.04 h.46 0.158s<br>p42 40n/1k: os r- f.07 h.44 0.1s<br>p43 27n/1k: os r.53 f.02 h.52 0.13s<br>p44 26n/1k: os r.59 f.03 h.58 0.148s<br>p45 10n/1k: os r- f.02 h.48 1.015s | one-shot, some root |
| hydra-marshes | ch 28 prog 39 | drum mode | 119 | 1 {36} | p39 119n/1k: os r.85 f.01 h.82 0.077s | one-shot+root |
| hydra-marshes | ch 29 prog 46,47 | drum mode | 250 | 2 {84,86} | p46 132n/1k: os r- f.09 h.16 0.111s<br>p47 118n/1k: os r- f.21 h.17 0.133s | one-shot, no root |
| hydra-marshes | ch 30 prog 49,48 | drum mode | 191 | 2 {45,46} | p48 98n/1k: os r- f.17 h.34 0.46s<br>p49 93n/1k: os r- f.23 h.34 0.072s | one-shot, no root |
| hydra-marshes | ch 31 prog 50,51 | drum mode | 30 | 2 {38,40} | p50 12n/1k: os r.85 f.00 h.90 0.277s<br>p51 18n/1k: os r.97 f.00 h.89 0.251s | one-shot+root |
| isle-of-the-damned | ch 18 prog 51 | drum mode | 21 | 1 {72} | p51 21n/1k: os r.88 f.00 h.87 0.924s | one-shot+root |
| isle-of-the-damned | ch 19 prog 52 | drum mode | 21 | 1 {67} | p52 21n/1k: os r.88 f.00 h.87 0.924s | one-shot+root |
| isle-of-the-damned | ch 20 prog 53 | drum mode | 21 | 1 {65} | p53 21n/1k: os r.83 f.00 h.84 0.502s | one-shot+root |
| isle-of-the-damned | ch 21 prog 54 | drum mode | 4 | 1 {68} | p54 4n/1k: os r- f.29 h.16 0.632s | one-shot, no root |
| isle-of-the-damned | ch 22 prog 57,58,56,55 | drum mode | 313 | 4 {36,37,38,40} | p55 6n/1k: os r.68 f.01 h.61 0.262s<br>p56 33n/1k: os r.58 f.00 h.61 0.249s<br>p57 239n/1k: os r.53 f.01 h.52 0.147s<br>p58 35n/1k: os r- f.08 h.42 0.109s | one-shot, some root |
| isle-of-the-damned | ch 23 prog 59,62,61,63,60 | drum mode | 381 | 5 {76,78,79,81,82} | p59 174n/1k: os r.63 f.01 h.57 0.088s<br>p60 8n/1k: os r- f.02 h.43 0.303s<br>p61 44n/1k: os r.82 f.00 h.94 0.222s<br>p62 121n/1k: os r.86 f.00 h.95 0.257s<br>p63 34n/1k: os r.65 f.01 h.67 0.387s | one-shot, some root |
| isle-of-the-damned | ch 24 prog 63 | drum mode | 8 | 1 {82} | p63 8n/1k: os r.65 f.01 h.67 0.387s | one-shot+root |
| isle-of-the-damned | ch 25 prog 64 | drum mode | 108 | 1 {73} | p64 108n/1k: os r- f.24 h.19 0.127s | one-shot, no root |
| isle-of-the-damned | ch 26 prog 66,65 | drum mode | 65 | 2 {84,86} | p65 24n/1k: os r- f.09 h.16 0.111s<br>p66 41n/1k: os r- f.20 h.16 0.131s | one-shot, no root |
| isle-of-the-damned | ch 27 prog 67 | drum mode | 6 | 1 {48} | p67 6n/1k: os r.84 f.00 h.81 2.028s | one-shot+root |
| isle-of-the-damned | ch 28 prog 68 | drum mode | 18 | 1 {35} | p68 18n/1k: os r.75 f.01 h.74 0.169s | one-shot+root |
| life-faraway-promise | ch 21 prog 56 | drum mode | 368 | 1 {43} | p56 368n/1k: os r.58 f.00 h.61 0.246s | one-shot+root |
| life-faraway-promise | ch 22 prog 56 | drum mode | 8 | 1 {43} | p56 8n/1k: os r.58 f.00 h.61 0.246s | one-shot+root |
| life-faraway-promise | ch 23 prog 56 | drum mode | 8 | 1 {43} | p56 8n/1k: os r.58 f.00 h.61 0.246s | one-shot+root |
| life-faraway-promise | ch 24 prog 56 | drum mode | 8 | 1 {43} | p56 8n/1k: os r.58 f.00 h.61 0.246s | one-shot+root |
| life-faraway-promise | ch 25 prog 59 | drum mode | 8 | 1 {60} | p59 8n/1k: lp r.95 f.00 h.96 0.472s | looped+root |
| life-faraway-promise | ch 26 prog 55 | one pitch ≥12 | 24 | 1 {71} | p55 24n/1k: lp r.91 f.00 h.96 0.737s | looped+root |
| life-faraway-promise | ch 27 prog 58 | drum mode | 8 | 1 {72} | p58 8n/1k: lp r- f.28 h.19 0.935s | looped, no root |
| life-faraway-promise | ch 28 prog 57 | drum mode | 8 | 1 {67} | p57 8n/1k: os r.65 f.20 h.23 0.944s | one-shot+root |
| lost-child-of-time | ch 23 prog 50 | drum mode | 3 | 1 {72} | p50 3n/1k: lp r.91 f.00 h.95 1.11s | looped+root |
| lost-child-of-time | ch 26 prog 51 | drum mode | 1 | 1 {48} | p51 1n/1k: lp r.68 f.00 h.71 0.541s | looped+root |
| lost-fragments | ch 21 prog 57,56 | drum mode | 5 | 2 {35,36} | p56 2n/1k: os r.60 f.06 h.45 0.247s<br>p57 3n/1k: os r.75 f.17 h.62 0.396s | one-shot+root |
| magical-dreamers-the-wind-stars-and-waves-main | ch 16 prog 64,65,66 | drum mode | 389 | 3 {60,62,64} | p64 104n/1k: lp r.75 f.00 h.71 0.253s<br>p65 229n/1k: os r- f.01 h.57 0.253s<br>p66 56n/1k: os r.66 f.00 h.74 0.231s | mixed loop |
| magical-dreamers-the-wind-stars-and-waves-main | ch 17 prog 63 | drum mode | 120 | 1 {36} | p63 120n/1k: os r.90 f.00 h.91 0.122s | one-shot+root |
| magical-dreamers-the-wind-stars-and-waves-variation | ch 16 prog 64,65,66 | drum mode | 180 | 3 {60,62,64} | p64 48n/1k: lp r.75 f.00 h.71 0.253s<br>p65 106n/1k: os r- f.01 h.57 0.253s<br>p66 26n/1k: os r.66 f.00 h.74 0.231s | mixed loop |
| magical-dreamers-the-wind-stars-and-waves-variation | ch 17 prog 63 | drum mode | 120 | 1 {36} | p63 120n/1k: os r.90 f.00 h.91 0.122s | one-shot+root |
| optimism | ch 13 prog 37,36,38 | drum mode | 19 | 3 {94,101,103} | p36 6n/1k: os r.77 f.00 h.74 0.135s<br>p37 12n/1k: os r.86 f.00 h.92 0.128s<br>p38 1n/1k: os r.51 f.02 h.57 0.132s | one-shot+root |
| optimism | ch 14 prog 60 | drum mode | 38 | 1 {79} | p60 38n/1k: os r.93 f.04 h.55 1.1s | one-shot+root |
| optimism | ch 15 prog 62,63 | drum mode | 205 | 2 {40,41} | p62 118n/1k: os r.73 f.03 h.67 0.084s<br>p63 87n/1k: lp r.89 f.00 h.90 0.992s | mixed loop |
| optimism | ch 16 prog 66,67 | drum mode | 150 | 2 {45,46} | p66 55n/1k: os r- f.17 h.35 0.473s<br>p67 95n/1k: os r- f.23 h.39 0.105s | one-shot, no root |
| optimism | ch 17 prog 70,69,68 | drum mode | 226 | 3 {90,92,93} | p68 97n/1k: os r- f.11 h.36 0.13s<br>p69 121n/1k: os r- f.12 h.25 0.111s<br>p70 8n/1k: os r- f.07 h.35 0.486s | one-shot, no root |
| optimism | ch 18 prog 59 | drum mode | 141 | 1 {38} | p59 141n/1k: os r.64 f.12 h.63 0.352s | one-shot+root |
| optimism | ch 19 prog 65,64 | drum mode | 16 | 2 {56,58} | p64 8n/1k: os r.95 f.00 h.94 0.13s<br>p65 8n/1k: os r.88 f.01 h.88 0.11s | one-shot+root |
| optimism | ch 20 prog 61 | drum mode | 1 | 1 {72} | p61 1n/1k: os r.66 f.03 h.65 0.579s | one-shot+root |
| orphan-of-flame | ch 15 prog 48 | drum mode | 227 | 1 {62} | p48 227n/1k: os r.54 f.31 h.42 0.324s | one-shot+root |
| orphan-of-flame | ch 16 prog 49 | drum mode | 121 | 1 {60} | p49 121n/1k: os r.89 f.00 h.89 0.46s | one-shot+root |
| orphan-of-flame | ch 19 prog 50 | drum mode | 5 | 1 {74} | p50 5n/1k: lp r- f.33 h.14 1.413s | looped, no root |
| orphan-of-flame | ch 20 prog 52 | drum mode | 4 | 1 {67} | p52 4n/1k: lp r.60 f.22 h.23 1.526s | looped+root |
| people-seized-with-life | ch 11 prog 47 | drum mode | 2 | 1 {43} | p47 2n/1k: lp r.54 f.00 h.50 0.461s | looped+root |
| people-seized-with-life | ch 12 prog 48 | drum mode | 2 | 1 {60} | p48 2n/1k: lp r.56 f.27 h.22 2.347s | looped+root |
| people-seized-with-life | ch 13 prog 46 | drum mode | 2 | 1 {36} | p46 2n/1k: os r.78 f.00 h.77 0.545s | one-shot+root |
| phantom-ship | ch 24 prog 54,55 | drum mode | 14 | 2 {40,41} | p54 10n/1k: os r.73 f.03 h.67 0.084s<br>p55 4n/1k: os r.89 f.00 h.90 0.432s | one-shot+root |
| phantom-ship | ch 25 prog 53 | drum mode | 3 | 1 {84} | p53 3n/1k: os r- f.09 h.16 0.111s | one-shot, no root |
| phantom-ship | ch 26 prog 56 | drum mode | 2 | 1 {43} | p56 2n/1k: lp r.84 f.00 h.81 0.884s | looped+root |
| phantom-ship | ch 28 prog 58 | drum mode | 2 | 1 {73} | p58 2n/1k: os r- f.12 h.59 1.973s | one-shot, no root |
| predicament | ch 22 prog 62,61 | drum mode | 432 | 2 {84,86} | p61 216n/1k: os r- f.09 h.16 0.111s<br>p62 216n/1k: os r- f.20 h.16 0.131s | one-shot, no root |
| predicament | ch 23 prog 65 | drum mode | 256 | 1 {76} | p65 256n/1k: os r.80 f.00 h.81 0.533s | one-shot+root |
| predicament | ch 24 prog 66 | drum mode | 145 | 1 {77} | p66 145n/1k: os r.66 f.00 h.79 0.258s | one-shot+root |
| predicament | ch 25 prog 63 | drum mode | 73 | 1 {60} | p63 73n/1k: os r.94 f.00 h.93 0.373s | one-shot+root |
| predicament | ch 26 prog 64 | drum mode | 36 | 1 {61} | p64 36n/1k: os r.90 f.00 h.89 0.604s | one-shot+root |
| predicament | ch 27 prog 68 | drum mode | 90 | 1 {64} | p68 90n/1k: os r.92 f.00 h.91 0.145s | one-shot+root |
| predicament | ch 28 prog 67 | drum mode | 1 | 1 {97} | p67 1n/1k: os r.81 f.03 h.52 0.605s | one-shot+root |
| shadow-forest | ch 18 prog 48 | drum mode | 24 | 1 {39} | p48 24n/1k: lp r.95 f.00 h.99 0.183s | looped+root |
| shadow-forest | ch 27 prog 50 | drum mode | 5 | 1 {57} | p50 5n/1k: os r1.00 f.00 h1.00 0.651s | one-shot+root |
| the-big-admirable-mysterious-sleight-of-hand-group | ch 4 prog 45,46 | drum mode | 99 | 2 {49,51} | p45 46n/1k: os r.89 f.00 h.88 0.645s<br>p46 53n/1k: os r.94 f.00 h.97 0.408s | one-shot+root |
| the-big-admirable-mysterious-sleight-of-hand-group | ch 5 prog 53 | drum mode | 20 | 1 {54} | p53 20n/1k: os r.89 f.00 h.88 0.379s | one-shot+root |
| the-big-admirable-mysterious-sleight-of-hand-group | ch 6 prog 53 | drum mode | 20 | 1 {54} | p53 20n/1k: os r.89 f.00 h.88 0.379s | one-shot+root |
| the-big-admirable-mysterious-sleight-of-hand-group | ch 7 prog 47 | drum mode | 21 | 1 {73} | p47 21n/1k: os r.62 f.03 h.71 0.83s | one-shot+root |
| the-big-admirable-mysterious-sleight-of-hand-group | ch 8 prog 48 | drum mode | 1 | 1 {60} | p48 1n/1k: lp r- f.14 h.38 1.334s | looped, no root |
| the-big-admirable-mysterious-sleight-of-hand-group | ch 10 prog 52,49,50,51 | drum mode | 6 | 4 {38,40,41,62} | p49 1n/1k: os r.87 f.01 h.96 0.279s<br>p50 3n/1k: os r- f.06 h.47 0.28s<br>p51 1n/1k: os r.69 f.13 h.24 0.422s<br>p52 1n/1k: os r.97 f.00 h.99 0.33s | one-shot, some root |
| the-brink-of-death-variation | ch 18 prog 38 | drum mode | 105 | 1 {62} | p38 105n/1k: os r.59 f.00 h.58 0.342s | one-shot+root |
| the-brink-of-death-variation | ch 19 prog 57 | drum mode | 17 | 1 {93} | p57 17n/1k: os r- f.19 h.24 0.66s | one-shot, no root |
| the-brink-of-death-variation | ch 20 prog 46,44,43,45,47 | drum mode | 301 | 5 {41,42,43,44,45} | p43 116n/1k: os r- f.02 h.45 0.07s<br>p44 32n/1k: os r.68 f.02 h.67 0.103s<br>p45 80n/1k: os r.89 f.00 h.87 0.102s<br>p46 48n/1k: os r.71 f.02 h.67 0.095s<br>p47 25n/1k: os r.89 f.00 h.85 0.091s | one-shot, some root |
| the-brink-of-death-variation | ch 21 prog 41,42 | drum mode | 462 | 2 {84,86} | p41 160n/1k: os r- f.43 h.16 0.091s<br>p42 302n/1k: os r- f.39 h.18 0.069s | one-shot, no root |
| the-brink-of-death-variation | ch 22 prog 62 | drum mode | 462 | 2 {91,92} | p62 462n/2k: os r.78 f.01 h.76 0.241s | one-shot+root |
| the-brink-of-death-variation | ch 23 prog 61 | drum mode | 231 | 1 {68} | p61 231n/1k: os r- f.23 h.22 0.197s | one-shot, no root |
| the-brink-of-death-variation | ch 24 prog 49 | drum mode | 5 | 1 {67} | p49 5n/1k: os r- f.52 h.42 0.079s | one-shot, no root |
| the-brink-of-death-variation | ch 25 prog 39 | drum mode | 407 | 1 {64} | p39 407n/1k: os r.71 f.11 h.73 0.216s | one-shot+root |
| the-brink-of-death | ch 18 prog 38 | drum mode | 105 | 1 {62} | p38 105n/1k: os r.59 f.00 h.58 0.342s | one-shot+root |
| the-brink-of-death | ch 19 prog 57 | drum mode | 17 | 1 {93} | p57 17n/1k: lp r- f.46 h.17 1.439s | looped, no root |
| the-brink-of-death | ch 20 prog 46,44,43,45,47 | drum mode | 301 | 5 {41,42,43,44,45} | p43 116n/1k: os r- f.02 h.45 0.07s<br>p44 32n/1k: os r.68 f.02 h.67 0.103s<br>p45 80n/1k: os r.89 f.00 h.87 0.102s<br>p46 48n/1k: os r.71 f.02 h.67 0.095s<br>p47 25n/1k: os r.89 f.00 h.85 0.091s | one-shot, some root |
| the-brink-of-death | ch 21 prog 41,42 | drum mode | 462 | 2 {84,86} | p41 160n/1k: os r- f.43 h.16 0.091s<br>p42 302n/1k: os r- f.39 h.18 0.069s | one-shot, no root |
| the-brink-of-death | ch 22 prog 62 | drum mode | 462 | 2 {91,92} | p62 462n/2k: os r.78 f.01 h.76 0.241s | one-shot+root |
| the-brink-of-death | ch 23 prog 61 | drum mode | 231 | 1 {68} | p61 231n/1k: os r- f.23 h.22 0.197s | one-shot, no root |
| the-brink-of-death | ch 24 prog 49 | drum mode | 5 | 1 {67} | p49 5n/1k: os r- f.52 h.42 0.079s | one-shot, no root |
| the-brink-of-death | ch 25 prog 39 | drum mode | 407 | 1 {64} | p39 407n/1k: os r.71 f.11 h.73 0.216s | one-shot+root |
| the-brink-of-death | ch 26 prog 64 | drum mode | 29 | 1 {75} | p64 29n/1k: os r.72 f.03 h.82 0.676s | one-shot+root |
| the-brink-of-death | ch 27 prog 66 | drum mode | 8 | 1 {103} | p66 8n/1k: os r.53 f.09 h.28 0.506s | one-shot+root |
| the-brink-of-death | ch 28 prog 67 | drum mode | 10 | 1 {105} | p67 10n/1k: os r.60 f.01 h.75 0.213s | one-shot+root |
| the-brink-of-death | ch 29 prog 65 | drum mode | 4 | 1 {98} | p65 4n/1k: os r- f.30 h.14 0.689s | one-shot, no root |
| the-brink-of-death | ch 30 prog 68 | drum mode | 2 | 1 {113} | p68 2n/1k: os r- f.00 h.45 0.216s | one-shot, no root |
| the-brink-of-death | ch 31 prog 69 | drum mode | 2 | 1 {115} | p69 2n/1k: os r- f.26 h.27 0.19s | one-shot, no root |
| the-star-stealing-girl | ch 1 prog 51,52,53,54 | drum mode | 10 | 4 {60,61,62,63} | p51 4n/1k: os r.99 f.00 h.99 0.258s<br>p52 2n/1k: os r1.00 f.00 h.99 0.639s<br>p53 2n/1k: os r1.00 f.00 h.99 0.606s<br>p54 2n/1k: os r.96 f.00 h.97 0.919s | one-shot+root |
| time-of-the-dreamwatch | ch 1 prog 48,38 | drum mode | 33 | 8 {60,80,85,87,89,90,92,94} | p38 31n/7k: lp r1.00 f.00 h1.00 0.281s<br>p48 2n/1k: os r- f.32 h.14 0.792s | mixed loop |
| time-of-the-dreamwatch | ch 28 prog 43,42 | drum mode | 464 | 2 {76,77} | p42 176n/1k: os r.89 f.01 h.90 0.297s<br>p43 288n/1k: os r.74 f.00 h.76 0.629s | one-shot+root |
| time-of-the-dreamwatch | ch 29 prog 44 | drum mode | 77 | 1 {52} | p44 77n/1k: os r.89 f.00 h.89 0.363s | one-shot+root |
| time-of-the-dreamwatch | ch 30 prog 46 | drum mode | 407 | 1 {40} | p46 407n/1k: lp r.76 f.00 h.75 0.329s | looped+root |
| time-of-the-dreamwatch | ch 31 prog 47 | drum mode | 720 | 1 {84} | p47 720n/1k: os r- f.09 h.16 0.111s | one-shot, no root |
| time-of-the-dreamwatch | ch 32 prog 49 | drum mode | 14 | 1 {93} | p49 14n/1k: lp r- f.41 h.13 0.895s | looped, no root |
| time-s-grasslands-home-world | ch 10 prog 41 | drum mode | 80 | 1 {50} | p41 80n/1k: os r.93 f.00 h.98 0.204s | one-shot+root |
| time-s-grasslands-home-world | ch 11 prog 49 | drum mode | 40 | 1 {60} | p49 40n/1k: os r.95 f.00 h.97 0.255s | one-shot+root |
| time-s-grasslands-home-world | ch 12 prog 50 | drum mode | 40 | 1 {68} | p50 40n/1k: os r.97 f.00 h1.00 0.354s | one-shot+root |
| time-s-grasslands-home-world | ch 13 prog 47 | drum mode | 320 | 1 {42} | p47 320n/1k: os r- f.23 h.22 0.197s | one-shot, no root |
| time-s-grasslands-home-world | ch 14 prog 45,46 | drum mode | 640 | 2 {84,86} | p45 560n/1k: os r- f.12 h.21 0.229s<br>p46 80n/1k: os r- f.20 h.18 0.282s | one-shot, no root |
| time-s-grasslands-home-world | ch 15 prog 42 | drum mode | 120 | 1 {49} | p42 120n/1k: os r.98 f.00 h.92 0.19s | one-shot+root |
| time-s-grasslands-home-world | ch 16 prog 43,44,48 | drum mode | 400 | 3 {72,74,76} | p43 320n/1k: os r.98 f.00 h.99 0.447s<br>p44 40n/1k: os r.96 f.00 h.94 0.373s<br>p48 40n/1k: os r.54 f.17 h.53 0.136s | one-shot+root |
| tower-of-stars | ch 2 prog 32 | one pitch ≥12 | 17 | 1 {69} | p32 17n/1k: os r.69 f.00 h.73 3.403s | one-shot+root |
| tower-of-stars | ch 3 prog 33 | one pitch ≥12 | 17 | 1 {69} | p33 17n/1k: os r.55 f.00 h.90 3.403s | one-shot+root |
| victory-spring-s-gift | ch 11 prog 50 | drum mode | 12 | 1 {35} | p50 12n/1k: os r.83 f.00 h.81 0.337s | one-shot+root |
| victory-spring-s-gift | ch 12 prog 51 | drum mode | 37 | 1 {62} | p51 37n/1k: os r.53 f.31 h.42 0.326s | one-shot+root |
| victory-spring-s-gift | ch 13 prog 52 | drum mode | 6 | 1 {93} | p52 6n/1k: lp r- f.31 h.14 1.131s | looped, no root |
| victory-summer-s-cry | ch 11 prog 50 | drum mode | 44 | 1 {35} | p50 44n/1k: os r.83 f.00 h.81 0.337s | one-shot+root |
| victory-summer-s-cry | ch 12 prog 51 | drum mode | 120 | 1 {62} | p51 120n/1k: os r.53 f.31 h.42 0.326s | one-shot+root |
| victory-summer-s-cry | ch 13 prog 52 | drum mode | 7 | 1 {93} | p52 7n/1k: lp r- f.31 h.14 1.131s | looped, no root |
| victory-summer-s-cry | ch 14 prog 54 | drum mode | 96 | 1 {74} | p54 96n/1k: os r- f.08 h.37 0.261s | one-shot, no root |
| viper-manor | ch 19 prog 51 | drum mode | 106 | 1 {43} | p51 106n/1k: os r.96 f.00 h.95 0.364s | one-shot+root |
| viper-manor | ch 20 prog 49 | drum mode | 2 | 1 {52} | p49 2n/1k: os r.83 f.03 h.83 2.15s | one-shot+root |
| viper-manor | ch 21 prog 52 | drum mode | 2 | 1 {53} | p52 2n/1k: os r.83 f.03 h.83 2.15s | one-shot+root |
| viper-manor | ch 22 prog 36 | drum mode | 320 | 1 {86} | p36 320n/1k: os r- f.35 h.14 0.128s | one-shot, no root |
| viper-manor | ch 23 prog 37 | drum mode | 24 | 1 {56} | p37 24n/1k: os r.97 f.00 h.89 0.135s | one-shot+root |
| viper-manor | ch 24 prog 45 | drum mode | 32 | 5 {74,75,76,77,78} | p45 32n/5k: os r- f.09 h.40 0.442s | one-shot, no root |
| voyage-another-world | ch 15 prog 61,57,60,56,58,59 | drum mode | 27 | 6 {61,63,75,78,80,82} | p56 6n/1k: os r.80 f.03 h.94 0.311s<br>p57 3n/1k: os r.65 f.04 h.80 0.418s<br>p58 3n/1k: os r.85 f.04 h.96 0.29s<br>p59 1n/1k: os r.79 f.01 h.82 0.275s<br>p60 4n/1k: os r.97 f.02 h.94 0.252s<br>p61 10n/1k: os r.81 f.09 h.68 0.349s | one-shot+root |
| voyage-home-world | ch 19 prog 58 | drum mode | 88 | 1 {58} | p58 88n/1k: os r.85 f.00 h.85 0.24s | one-shot+root |
| voyage-home-world | ch 20 prog 59 | drum mode | 533 | 1 {92} | p59 533n/1k: os r- f.12 h.25 0.111s | one-shot, no root |
| voyage-home-world | ch 21 prog 57 | drum mode | 2 | 1 {67} | p57 2n/1k: lp r.60 f.22 h.23 1.526s | looped+root |
| zelbess | ch 4 prog 32 | one pitch ≥12 | 21 | 1 {62} | p32 21n/1k: os r.81 f.00 h.93 1.011s | one-shot+root |
| zelbess | ch 5 prog 71 | one pitch ≥12 | 15 | 1 {64} | p71 15n/1k: os r.97 f.00 h.99 0.744s | one-shot+root |
| zelbess | ch 11 prog 63 | drum mode | 30 | 1 {60} | p63 30n/1k: os r.93 f.00 h.98 0.251s | one-shot+root |
| zelbess | ch 12 prog 64,65 | drum mode | 176 | 2 {64,67} | p64 86n/1k: lp r.55 f.00 h.66 0.178s<br>p65 90n/1k: lp r.81 f.00 h.90 0.22s | looped+root |
| zelbess | ch 13 prog 61 | drum mode | 28 | 1 {72} | p61 28n/1k: lp r.94 f.00 h.98 0.212s | looped+root |
| zelbess | ch 14 prog 62 | drum mode | 30 | 1 {73} | p62 30n/1k: lp r.92 f.00 h.96 0.248s | looped+root |
| zelbess | ch 15 prog 34,35,36,37,38,39,40 | drum mode | 232 | 7 {36,37,38,39,40,41,42} | p34 29n/1k: os r.58 f.02 h.54 0.08s<br>p35 29n/1k: os r- f.01 h.41 0.117s<br>p36 29n/1k: os r- f.03 h.38 0.136s<br>p37 29n/1k: os r- f.03 h.30 0.057s<br>p38 29n/1k: os r- f.02 h.39 0.058s<br>p39 29n/1k: os r- f.01 h.45 0.103s<br>p40 58n/1k: os r.91 f.00 h.90 0.206s | one-shot, some root |
| zelbess | ch 16 prog 66 | drum mode | 319 | 1 {84} | p66 319n/1k: os r- f.09 h.16 0.111s | one-shot, no root |
| zelbess | ch 17 prog 68,67 | drum mode | 360 | 2 {92,93} | p67 290n/1k: os r- f.12 h.25 0.111s<br>p68 70n/1k: os r- f.07 h.35 0.486s | one-shot, no root |
| zelbess | ch 18 prog 70,69 | drum mode | 69 | 2 {66,68} | p69 56n/1k: os r.81 f.03 h.84 0.206s<br>p70 13n/1k: os r.85 f.00 h.92 0.165s | one-shot+root |

### ps1/final-fantasy-9 — 108 songs, 1678 groups, 251 marked kit

By sample shape: one-shot, no root 82 · one-shot+root 121 · looped, no root 15 · looped+root 12 · one-shot, some root 10 · mixed loop 11. By rule: drum mode 250 · one pitch ≥12 1. Kit groups with > 6 written keys: 5 (one-shot, some root 1 · mixed loop 4).

| Song | Group | Rule | Notes | Keys | Samples (per program) | Shape |
|---|---|---|---|---|---|---|
| amarant-s-theme | ch 20 prog 4 | drum mode | 210 | 1 {72} | p4 210n/1k: os r- f.27 h.12 0.14s | one-shot, no root |
| amarant-s-theme | ch 21 prog 3 | drum mode | 17 | 1 {46} | p3 17n/1k: os r- f.17 h.31 0.538s | one-shot, no root |
| amarant-s-theme | ch 22 prog 2 | drum mode | 157 | 1 {42} | p2 157n/1k: os r- f.28 h.15 0.297s | one-shot, no root |
| amarant-s-theme | ch 23 prog 0 | drum mode | 140 | 1 {36} | p0 140n/1k: os r.90 f.00 h.92 0.386s | one-shot+root |
| amarant-s-theme | ch 24 prog 1 | drum mode | 140 | 1 {48} | p1 140n/1k: os r.90 f.00 h.92 0.386s | one-shot+root |
| ambush-attack | ch 17 prog 1 | drum mode | 104 | 1 {38} | p1 104n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| ambush-attack | ch 18 prog 0 | drum mode | 54 | 1 {36} | p0 54n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| assault-of-the-white-dragons | ch 17 prog 14 | drum mode | 353 | 1 {38} | p14 353n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| assault-of-the-white-dragons | ch 18 prog 15 | drum mode | 182 | 1 {36} | p15 182n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| assault-of-the-white-dragons | ch 20 prog 16 | drum mode | 19 | 1 {59} | p16 19n/1k: lp r- f.42 h.12 0.715s | looped, no root |
| assault-of-the-white-dragons | ch 29 prog 37 | drum mode | 36 | 1 {78} | p37 36n/1k: os r- f.30 h.43 0.581s | one-shot, no root |
| assault-of-the-white-dragons | ch 30 prog 38 | drum mode | 476 | 1 {54} | p38 476n/1k: os r- f.03 h.48 0.168s | one-shot, no root |
| awakening-the-forest | ch 27 prog 11 | drum mode | 11 | 1 {49} | p11 11n/1k: lp r.64 f.02 h.64 0.747s | looped+root |
| battle-strategy-conference | ch 7 prog 0 | drum mode | 174 | 1 {30} | p0 174n/1k: os r- f.09 h.24 2.105s | one-shot, no root |
| battle | ch 28 prog 5 | drum mode | 16 | 2 {49,57} | p5 16n/2k: lp r- f.14 h.34 0.59s | looped, no root |
| battle | ch 29 prog 4,27 | drum mode | 197 | 2 {42,46} | p4 150n/1k: os r- f.22 h.13 0.183s<br>p27 47n/1k: os r- f.28 h.19 0.31s | one-shot, no root |
| battle | ch 30 prog 2,3 | drum mode | 22 | 3 {41,45,48} | p2 12n/2k: os r.81 f.01 h.89 0.465s<br>p3 10n/1k: os r.80 f.01 h.82 0.498s | one-shot+root |
| battle | ch 31 prog 2 | drum mode | 2 | 2 {45,48} | p2 2n/2k: os r.81 f.01 h.89 0.465s | one-shot+root |
| battle | ch 32 prog 0,1 | drum mode | 197 | 2 {36,38} | p0 156n/1k: os r.80 f.00 h.77 0.082s<br>p1 41n/1k: os r- f.32 h.28 0.161s | one-shot, some root |
| black-mage-s-village | ch 11 prog 6,5 | drum mode | 96 | 2 {78,79} | p5 24n/1k: os r.88 f.00 h1.00 0.211s<br>p6 72n/1k: os r.72 f.00 h.85 0.282s | one-shot+root |
| black-mage-s-village | ch 12 prog 2,3 | drum mode | 494 | 2 {42,46} | p2 466n/1k: os r- f.37 h.13 0.187s<br>p3 28n/1k: os r- f.23 h.16 0.567s | one-shot, no root |
| black-mage-s-village | ch 13 prog 1 | drum mode | 33 | 1 {40} | p1 33n/1k: os r- f.16 h.41 0.166s | one-shot, no root |
| black-mage-s-village | ch 14 prog 0 | drum mode | 126 | 1 {35} | p0 126n/1k: os r.95 f.00 h.96 0.477s | one-shot+root |
| black-mage-s-village | ch 15 prog 4 | drum mode | 65 | 1 {39} | p4 65n/1k: os r- f.13 h.22 0.17s | one-shot, no root |
| black-waltz | ch 6 prog 4 | drum mode | 51 | 2 {80,81} | p4 51n/2k: lp r.81 f.02 h.80 0.291s | looped+root |
| boss-battle | ch 24 prog 33 | drum mode | 1 | 1 {60} | p33 1n/1k: lp r- f.06 h.44 0.574s | looped, no root |
| boss-battle | ch 25 prog 3 | drum mode | 544 | 1 {54} | p3 544n/1k: os r.51 f.09 h.57 0.353s | one-shot+root |
| boss-battle | ch 26 prog 0 | drum mode | 29 | 1 {59} | p0 29n/1k: lp r- f.42 h.12 0.715s | looped, no root |
| boss-battle | ch 27 prog 2 | drum mode | 395 | 1 {38} | p2 395n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| boss-battle | ch 30 prog 1 | drum mode | 327 | 1 {36} | p1 327n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| ceremony-for-the-gods | ch 4 prog 13,14,12,15,16 | drum mode | 76 | 5 {50,54,55,56,58} | p12 24n/1k: os r.96 f.00 h.95 0.198s<br>p13 16n/1k: os r.69 f.04 h.74 0.396s<br>p14 8n/1k: os r.84 f.00 h.86 0.729s<br>p15 24n/1k: os r.81 f.00 h.92 0.177s<br>p16 4n/1k: os r.76 f.01 h.81 0.683s | one-shot+root |
| ceremony-for-the-gods | ch 5 prog 14 | drum mode | 4 | 1 {50} | p14 4n/1k: os r.84 f.00 h.86 0.729s | one-shot+root |
| ceremony-for-the-gods | ch 9 prog 17 | drum mode | 1 | 1 {59} | p17 1n/1k: os r- f.02 h.70 1.664s | one-shot, no root |
| ceremony-for-the-gods | ch 10 prog 18 | drum mode | 1 | 1 {73} | p18 1n/1k: os r.82 f.00 h.90 3.263s | one-shot+root |
| cid-s-theme | ch 9 prog 9 | drum mode | 5 | 1 {59} | p9 5n/1k: lp r- f.43 h.11 0.648s | looped, no root |
| cid-s-theme | ch 10 prog 5 | drum mode | 300 | 1 {38} | p5 300n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| crossing-those-hills | ch 16 prog 16 | drum mode | 480 | 1 {42} | p16 480n/1k: os r- f.27 h.39 0.258s | one-shot, no root |
| crossing-those-hills | ch 17 prog 26,27 | drum mode | 76 | 4 {41,43,45,47} | p26 13n/1k: os r.84 f.00 h.84 0.486s<br>p27 63n/3k: os r.87 f.01 h.89 0.502s | one-shot+root |
| crossing-those-hills | ch 18 prog 17 | drum mode | 41 | 1 {36} | p17 41n/1k: os r.86 f.00 h.84 0.25s | one-shot+root |
| dark-messenger | ch 1 prog 8 | drum mode | 10 | 1 {39} | p8 10n/1k: os r- f.46 h.12 0.895s | one-shot, no root |
| dark-messenger | ch 2 prog 7 | drum mode | 30 | 1 {37} | p7 30n/1k: os r.72 f.00 h.91 0.588s | one-shot+root |
| dark-messenger | ch 23 prog 34,35 | drum mode | 18 | 2 {49,52} | p34 17n/1k: lp r- f.14 h.34 0.59s<br>p35 1n/1k: os r- f.23 h.19 0.491s | mixed loop |
| dark-messenger | ch 24 prog 34,35 | drum mode | 3 | 2 {49,52} | p34 2n/1k: lp r- f.14 h.34 0.59s<br>p35 1n/1k: os r- f.23 h.19 0.491s | mixed loop |
| dark-messenger | ch 25 prog 33 | drum mode | 209 | 2 {42,46} | p33 209n/2k: os r- f.22 h.18 0.406s | one-shot, no root |
| dark-messenger | ch 26 prog 2 | drum mode | 21 | 3 {41,45,48} | p2 21n/3k: os r.86 f.00 h.91 0.366s | one-shot+root |
| dark-messenger | ch 27 prog 2 | drum mode | 5 | 2 {41,45} | p2 5n/2k: os r.86 f.00 h.91 0.366s | one-shot+root |
| dark-messenger | ch 28 prog 1 | drum mode | 91 | 1 {38} | p1 91n/1k: os r.52 f.09 h.52 0.287s | one-shot+root |
| dark-messenger | ch 29 prog 0 | drum mode | 267 | 1 {36} | p0 267n/1k: os r.86 f.00 h.85 0.345s | one-shot+root |
| eiko-s-theme | ch 19 prog 18,19 | drum mode | 110 | 2 {63,64} | p18 66n/1k: os r.68 f.00 h.65 0.201s<br>p19 44n/1k: os r.85 f.00 h.82 0.268s | one-shot+root |
| eiko-s-theme | ch 20 prog 20,21 | drum mode | 159 | 2 {60,61} | p20 94n/1k: os r.90 f.00 h.89 0.167s<br>p21 65n/1k: os r.53 f.02 h.52 0.076s | one-shot+root |
| eiko-s-theme | ch 21 prog 21 | drum mode | 1 | 1 {61} | p21 1n/1k: os r.53 f.02 h.52 0.076s | one-shot+root |
| eternal-harvest | ch 12 prog 18 | drum mode | 26 | 1 {33} | p18 26n/1k: os r- f.10 h.24 0.107s | one-shot, no root |
| eternal-harvest | ch 13 prog 19 | drum mode | 85 | 2 {91,92} | p19 85n/2k: os r.86 f.00 h.85 0.603s | one-shot+root |
| eternal-harvest | ch 14 prog 20 | drum mode | 2 | 1 {31} | p20 2n/1k: lp r- f.42 h.10 0.85s | looped, no root |
| eternal-harvest | ch 15 prog 22,21 | drum mode | 334 | 2 {60,61} | p21 153n/1k: os r.96 f.00 h.97 0.65s<br>p22 181n/1k: os r.97 f.00 h.98 0.246s | one-shot+root |
| eternal-harvest | ch 16 prog 23 | drum mode | 52 | 1 {32} | p23 52n/1k: os r.72 f.00 h.70 0.468s | one-shot+root |
| extraction | ch 6 prog 1,0 | drum mode | 51 | 2 {47,48} | p0 21n/1k: os r.89 f.00 h.87 0.636s<br>p1 30n/1k: os r.90 f.00 h.89 0.754s | one-shot+root |
| extraction | ch 7 prog 2,1 | drum mode | 51 | 2 {43,45} | p1 21n/1k: os r.90 f.00 h.89 0.754s<br>p2 30n/1k: os r.88 f.00 h.87 0.898s | one-shot+root |
| extraction | ch 8 prog 2 | drum mode | 96 | 1 {41} | p2 96n/1k: os r.88 f.00 h.87 0.898s | one-shot+root |
| fairy-battle | ch 1 prog 30 | drum mode | 1 | 1 {60} | p30 1n/1k: os r.54 f.00 h.78 0.908s | one-shot+root |
| fairy-battle | ch 20 prog 10 | drum mode | 99 | 2 {80,81} | p10 99n/2k: os r.86 f.00 h.85 0.603s | one-shot+root |
| fairy-battle | ch 21 prog 23 | drum mode | 39 | 1 {38} | p23 39n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| fairy-battle | ch 22 prog 22 | drum mode | 8 | 1 {36} | p22 8n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| fanfare | ch 13 prog 199 | drum mode | 47 | 2 {91,92} | p199 47n/2k: lp r.81 f.02 h.80 0.291s | looped+root |
| fanfare | ch 14 prog 196 | drum mode | 156 | 1 {30} | p196 156n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| fanfare | ch 15 prog 197 | drum mode | 8 | 1 {54} | p197 8n/1k: os r.76 f.03 h.85 0.267s | one-shot+root |
| fanfare | ch 16 prog 200 | drum mode | 33 | 1 {81} | p200 33n/1k: os r.84 f.00 h.88 0.118s | one-shot+root |
| feel-my-blade | ch 19 prog 23 | drum mode | 78 | 2 {80,81} | p23 78n/2k: os r.82 f.01 h.81 0.347s | one-shot+root |
| feel-my-blade | ch 20 prog 22 | drum mode | 49 | 1 {54} | p22 49n/1k: os r.51 f.09 h.56 0.364s | one-shot+root |
| feel-my-blade | ch 21 prog 11 | drum mode | 12 | 1 {59} | p11 12n/1k: lp r- f.42 h.12 0.715s | looped, no root |
| feel-my-blade | ch 22 prog 10 | drum mode | 252 | 1 {38} | p10 252n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| feel-my-blade | ch 24 prog 9 | drum mode | 38 | 1 {36} | p9 38n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| gargan-roo | ch 6 prog 10 | drum mode | 50 | 1 {36} | p10 50n/1k: os r.92 f.00 h.94 0.342s | one-shot+root |
| gargan-roo | ch 7 prog 17,18 | drum mode | 20 | 4 {38,41,45,48} | p17 18n/3k: os r.80 f.00 h.87 0.611s<br>p18 2n/1k: os r- f.29 h.40 0.476s | one-shot, some root |
| gargan-roo | ch 8 prog 15,16 | drum mode | 50 | 2 {42,46} | p15 41n/1k: os r- f.24 h.12 0.31s<br>p16 9n/1k: os r- f.14 h.20 0.499s | one-shot, no root |
| gargan-roo | ch 10 prog 11,12 | drum mode | 16 | 2 {73,74} | p11 10n/1k: os r.57 f.01 h.53 0.053s<br>p12 6n/1k: os r.87 f.01 h.80 0.06s | one-shot+root |
| gargan-roo | ch 11 prog 13,14 | drum mode | 26 | 2 {76,85} | p13 14n/1k: os r- f.03 h.64 0.199s<br>p14 12n/1k: os r- f.04 h.56 0.347s | one-shot, no root |
| garnet-s-song-1 | ch 1 prog 0,1,2,3,4,5 | drum mode | 7 | 6 {36,37,38,39,40,41} | p0 2n/1k: os r1.00 f.00 h.92 1.186s<br>p1 1n/1k: os r1.00 f.00 h.99 1.19s<br>p2 1n/1k: os r.99 f.00 h.99 2.346s<br>p3 1n/1k: os r1.00 f.00 h.94 1.963s<br>p4 1n/1k: os r1.00 f.00 h.99 1.055s<br>p5 1n/1k: os r1.00 f.00 h1.00 3.109s | one-shot+root |
| garnet-s-song-1 | ch 2 prog 6 | drum mode | 1 | 1 {42} | p6 1n/1k: os r.99 f.00 h.97 1.658s | one-shot+root |
| garnet-s-song-2 | ch 1 prog 4,5,7,9,10 | drum mode | 6 | 5 {36,37,39,41,42} | p4 2n/1k: os r.99 f.01 h.98 0.357s<br>p5 1n/1k: os r.95 f.01 h.97 0.698s<br>p7 1n/1k: os r.99 f.01 h.98 2.154s<br>p9 1n/1k: os r1.00 f.00 h1.00 1.194s<br>p10 1n/1k: os r.99 f.00 h.99 2.437s | one-shot+root |
| garnet-s-song-2 | ch 2 prog 6,8,11 | drum mode | 3 | 3 {38,40,43} | p6 1n/1k: os r.98 f.00 h1.00 1.067s<br>p8 1n/1k: os r.99 f.00 h1.00 1.935s<br>p11 1n/1k: os r.99 f.02 h.83 1.817s | one-shot+root |
| garnet-s-theme | ch 9 prog 20 | drum mode | 7 | 1 {81} | p20 7n/1k: os r.87 f.01 h.86 0.86s | one-shot+root |
| garnet-s-theme | ch 11 prog 16 | drum mode | 48 | 1 {83} | p16 48n/1k: os r- f.05 h.39 0.879s | one-shot, no root |
| gulug-volcano | ch 18 prog 7 | drum mode | 50 | 1 {97} | p7 50n/1k: os r.97 f.00 h.92 0.057s | one-shot+root |
| gulug-volcano | ch 19 prog 3 | drum mode | 88 | 1 {85} | p3 88n/1k: os r.84 f.01 h.86 0.124s | one-shot+root |
| gulug-volcano | ch 20 prog 6 | drum mode | 34 | 1 {75} | p6 34n/1k: os r.70 f.02 h.72 0.328s | one-shot+root |
| gulug-volcano | ch 21 prog 8 | drum mode | 56 | 1 {32} | p8 56n/1k: os r.77 f.00 h.74 0.686s | one-shot+root |
| gulug-volcano | ch 22 prog 4,5 | drum mode | 257 | 2 {55,56} | p4 120n/1k: os r.84 f.03 h.82 0.254s<br>p5 137n/1k: os r- f.06 h.28 0.268s | one-shot, some root |
| hidden-lips | ch 5 prog 14 | drum mode | 36 | 2 {80,81} | p14 36n/2k: lp r.81 f.02 h.80 0.291s | looped+root |
| hunter-s-chance | ch 26 prog 14,13 | drum mode | 192 | 3 {53,80,81} | p13 80n/1k: os r- f.04 h.50 0.373s<br>p14 112n/2k: os r.88 f.00 h.92 0.306s | one-shot, some root |
| hunter-s-chance | ch 27 prog 10 | drum mode | 26 | 1 {49} | p10 26n/1k: os r- f.07 h.29 0.977s | one-shot, no root |
| hunter-s-chance | ch 28 prog 9,12 | drum mode | 300 | 2 {44,46} | p9 286n/1k: os r- f.40 h.14 0.185s<br>p12 14n/1k: os r- f.23 h.19 0.321s | one-shot, no root |
| hunter-s-chance | ch 29 prog 11,131,12,9 | drum mode | 140 | 10 {41,43,44,45…51,52} | p9 1n/1k: os r- f.40 h.14 0.185s<br>p11 118n/5k: os r.78 f.00 h.93 0.335s<br>p12 6n/1k: os r- f.23 h.19 0.321s<br>p131 15n/3k: — | one-shot, some root |
| hunter-s-chance | ch 30 prog 11 | drum mode | 93 | 5 {41,43,45,47,48} | p11 93n/5k: os r.78 f.00 h.93 0.335s | one-shot+root |
| hunter-s-chance | ch 31 prog 16 | drum mode | 95 | 1 {38} | p16 95n/1k: lp r- f.12 h.41 0.102s | looped, no root |
| hunter-s-chance | ch 32 prog 17 | drum mode | 226 | 1 {36} | p17 226n/1k: os r.86 f.00 h.86 0.113s | one-shot+root |
| i-want-to-be-your-canary | ch 6 prog 14 | drum mode | 46 | 2 {80,81} | p14 46n/2k: lp r.81 f.02 h.80 0.291s | looped+root |
| i-want-to-be-your-canary | ch 8 prog 13 | drum mode | 1 | 1 {59} | p13 1n/1k: os r- f.38 h.15 1.218s | one-shot, no root |
| ice-caverns | ch 17 prog 18 | drum mode | 47 | 2 {80,81} | p18 47n/2k: os r.86 f.00 h.85 0.603s | one-shot+root |
| ice-caverns | ch 18 prog 0 | drum mode | 70 | 2 {42,46} | p0 70n/2k: lp r.90 f.00 h.89 0.263s | looped+root |
| ice-caverns | ch 19 prog 21 | drum mode | 1 | 1 {60} | p21 1n/1k: os r.76 f.00 h.83 2.453s | one-shot+root |
| ice-caverns | ch 20 prog 8,22,9,23 | drum mode | 70 | 4 {57,59,62,64} | p8 10n/1k: os r- f.25 h.23 0.659s<br>p9 30n/1k: os r- f.32 h.13 0.222s<br>p22 20n/1k: os r- f.36 h.15 0.126s<br>p23 10n/1k: os r- f.34 h.13 0.192s | one-shot, no root |
| iifa-tree | ch 10 prog 20 | drum mode | 2 | 1 {74} | p20 2n/1k: lp r- f.06 h.44 0.574s | looped, no root |
| immoral-melody | ch 20 prog 6 | drum mode | 155 | 1 {36} | p6 155n/1k: os r.72 f.00 h.91 0.588s | one-shot+root |
| immoral-melody | ch 21 prog 7 | drum mode | 62 | 1 {53} | p7 62n/1k: os r- f.46 h.12 0.895s | one-shot, no root |
| ipsen-s-castle | ch 7 prog 16,17 | drum mode | 103 | 2 {72,74} | p16 35n/1k: os r- f.19 h.11 0.389s<br>p17 68n/1k: os r- f.17 h.16 0.479s | one-shot, no root |
| jesters-of-the-moon | ch 12 prog 18 | drum mode | 12 | 1 {55} | p18 12n/1k: os r- f.35 h.19 0.702s | one-shot, no root |
| jesters-of-the-moon | ch 13 prog 13,14 | drum mode | 224 | 2 {42,46} | p13 170n/1k: os r- f.24 h.12 0.31s<br>p14 54n/1k: os r- f.14 h.20 0.499s | one-shot, no root |
| jesters-of-the-moon | ch 14 prog 17 | drum mode | 48 | 3 {41,45,48} | p17 48n/3k: os r.80 f.00 h.87 0.611s | one-shot+root |
| jesters-of-the-moon | ch 15 prog 15,16 | drum mode | 204 | 2 {36,40} | p15 164n/1k: os r.92 f.00 h.93 0.512s<br>p16 40n/1k: os r- f.29 h.40 0.703s | one-shot, some root |
| jesters-of-the-moon | ch 16 prog 15 | drum mode | 28 | 1 {36} | p15 28n/1k: os r.92 f.00 h.93 0.512s | one-shot+root |
| kuja-s-theme-millennium-version | ch 1 prog 10 | drum mode | 105 | 1 {36} | p10 105n/1k: os r.72 f.00 h.91 0.588s | one-shot+root |
| kuja-s-theme-millennium-version | ch 2 prog 11 | drum mode | 42 | 1 {53} | p11 42n/1k: os r- f.44 h.13 0.82s | one-shot, no root |
| lindblum | ch 7 prog 13,14 | drum mode | 134 | 2 {63,64} | p13 102n/1k: os r.89 f.00 h.94 0.117s<br>p14 32n/1k: os r.66 f.00 h.79 0.151s | one-shot+root |
| lindblum | ch 8 prog 13 | drum mode | 2 | 1 {64} | p13 2n/1k: os r.89 f.00 h.94 0.117s | one-shot+root |
| lindblum | ch 9 prog 3 | drum mode | 66 | 1 {56} | p3 66n/1k: os r.81 f.01 h.88 0.132s | one-shot+root |
| lindblum | ch 10 prog 2 | drum mode | 14 | 1 {83} | p2 14n/1k: os r- f.07 h.35 0.432s | one-shot, no root |
| lindblum | ch 11 prog 4 | drum mode | 8 | 1 {36} | p4 8n/1k: os r.77 f.00 h.74 0.996s | one-shot+root |
| mistaken-love | ch 22 prog 11 | drum mode | 6 | 1 {59} | p11 6n/1k: os r- f.43 h.14 1.298s | one-shot, no root |
| mistaken-love | ch 24 prog 9 | drum mode | 27 | 1 {36} | p9 27n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| mountain-pass | ch 9 prog 18 | drum mode | 36 | 1 {64} | p18 36n/1k: os r- f.12 h.22 0.154s | one-shot, no root |
| mountain-pass | ch 10 prog 19 | drum mode | 102 | 1 {36} | p19 102n/1k: os r.94 f.00 h.95 0.469s | one-shot+root |
| oeilvert | ch 4 prog 9,10 | drum mode | 16 | 2 {50,57} | p9 8n/1k: lp r.66 f.00 h.81 0.659s<br>p10 8n/1k: lp r.71 f.00 h.98 0.849s | looped+root |
| one-problem-settled | ch 11 prog 6 | drum mode | 15 | 1 {65} | p6 15n/1k: os r.64 f.01 h.68 0.518s | one-shot+root |
| one-problem-settled | ch 12 prog 6 | drum mode | 2 | 1 {65} | p6 2n/1k: os r.64 f.01 h.68 0.518s | one-shot+root |
| one-problem-settled | ch 13 prog 7 | drum mode | 4 | 1 {55} | p7 4n/1k: os r- f.27 h.23 0.754s | one-shot, no root |
| one-problem-settled | ch 14 prog 4,5 | drum mode | 256 | 2 {42,46} | p4 192n/1k: os r- f.23 h.20 0.199s<br>p5 64n/1k: os r- f.20 h.16 0.58s | one-shot, no root |
| one-problem-settled | ch 15 prog 13 | drum mode | 4 | 1 {40} | p13 4n/1k: os r.70 f.22 h.73 0.343s | one-shot+root |
| one-problem-settled | ch 16 prog 0 | drum mode | 103 | 1 {36} | p0 103n/1k: os r.88 f.00 h.91 0.324s | one-shot+root |
| prima-vista-band | ch 22 prog 91 | drum mode | 27 | 2 {80,81} | p91 27n/2k: os r.86 f.00 h.85 0.603s | one-shot+root |
| prima-vista-band | ch 23 prog 92 | drum mode | 2 | 1 {59} | p92 2n/1k: lp r- f.42 h.10 0.85s | looped, no root |
| prima-vista-band | ch 24 prog 90 | drum mode | 51 | 1 {38} | p90 51n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| prima-vista-band | ch 25 prog 93 | drum mode | 19 | 1 {36} | p93 19n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| protecting-my-devotion | ch 12 prog 15 | drum mode | 240 | 1 {64} | p15 240n/1k: os r- f.33 h.16 0.176s | one-shot, no root |
| protecting-my-devotion | ch 13 prog 16 | drum mode | 48 | 1 {65} | p16 48n/1k: os r.91 f.00 h.94 1.284s | one-shot+root |
| protecting-my-devotion | ch 14 prog 17 | drum mode | 64 | 2 {91,92} | p17 64n/2k: os r.88 f.00 h.92 0.306s | one-shot+root |
| qu-s-marsh | ch 9 prog 5 | drum mode | 46 | 1 {83} | p5 46n/1k: os r- f.04 h.39 0.434s | one-shot, no root |
| qu-s-marsh | ch 12 prog 18,19,21,22,24,25,10,11,13,15,16,17,26,27,28,30 | drum mode | 42 | 16 {36,37,39,41…54,56} | p10 2n/1k: lp r.91 f.00 h.97 0.142s<br>p11 2n/1k: os r.90 f.00 h.94 0.109s<br>p13 2n/1k: os r.87 f.00 h.93 0.148s<br>p15 2n/1k: os r.86 f.00 h.94 0.12s<br>p16 2n/1k: os r.87 f.00 h.90 0.131s<br>p17 2n/1k: os r.78 f.00 h.89 0.174s<br>p18 4n/1k: os r.89 f.00 h.92 0.133s<br>p19 4n/1k: os r.84 f.00 h.84 0.094s<br>p21 4n/1k: os r.82 f.00 h.89 0.157s<br>p22 4n/1k: os r.81 f.01 h.90 0.13s<br>p24 4n/1k: os r.87 f.00 h.92 0.154s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p26 2n/1k: os r.85 f.00 h.88 0.343s<br>p27 2n/1k: os r.83 f.00 h.90 0.135s<br>p28 2n/1k: os r.80 f.00 h.85 0.194s<br>p30 2n/1k: os r.92 f.00 h.99 0.21s | mixed loop |
| qu-s-marsh | ch 13 prog 20,23,12,14,25,29 | drum mode | 16 | 6 {38,40,46,49,51,55} | p12 2n/1k: lp r.82 f.00 h.86 0.133s<br>p14 2n/1k: os r.91 f.00 h.96 0.359s<br>p20 4n/1k: os r.76 f.00 h.86 0.163s<br>p23 4n/1k: os r.93 f.00 h.97 0.172s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p29 2n/1k: os r.91 f.00 h.95 0.157s | mixed loop |
| qu-s-marsh | ch 14 prog 18,19,21,22,24,25,10,11,13,15,16,17,26,27,28,30 | drum mode | 42 | 16 {36,37,39,41…54,56} | p10 2n/1k: lp r.91 f.00 h.97 0.142s<br>p11 2n/1k: os r.90 f.00 h.94 0.109s<br>p13 2n/1k: os r.87 f.00 h.93 0.148s<br>p15 2n/1k: os r.86 f.00 h.94 0.12s<br>p16 2n/1k: os r.87 f.00 h.90 0.131s<br>p17 2n/1k: os r.78 f.00 h.89 0.174s<br>p18 4n/1k: os r.89 f.00 h.92 0.133s<br>p19 4n/1k: os r.84 f.00 h.84 0.094s<br>p21 4n/1k: os r.82 f.00 h.89 0.157s<br>p22 4n/1k: os r.81 f.01 h.90 0.13s<br>p24 4n/1k: os r.87 f.00 h.92 0.154s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p26 2n/1k: os r.85 f.00 h.88 0.343s<br>p27 2n/1k: os r.83 f.00 h.90 0.135s<br>p28 2n/1k: os r.80 f.00 h.85 0.194s<br>p30 2n/1k: os r.92 f.00 h.99 0.21s | mixed loop |
| qu-s-marsh | ch 15 prog 20,23,12,14,25,29 | drum mode | 16 | 6 {38,40,46,49,51,55} | p12 2n/1k: lp r.82 f.00 h.86 0.133s<br>p14 2n/1k: os r.91 f.00 h.96 0.359s<br>p20 4n/1k: os r.76 f.00 h.86 0.163s<br>p23 4n/1k: os r.93 f.00 h.97 0.172s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p29 2n/1k: os r.91 f.00 h.95 0.157s | mixed loop |
| qu-s-marsh | ch 16 prog 18,19,21,22,24,25,10,11,13,15,16,17,26,27,28,30 | drum mode | 42 | 16 {36,37,39,41…54,56} | p10 2n/1k: lp r.91 f.00 h.97 0.142s<br>p11 2n/1k: os r.90 f.00 h.94 0.109s<br>p13 2n/1k: os r.87 f.00 h.93 0.148s<br>p15 2n/1k: os r.86 f.00 h.94 0.12s<br>p16 2n/1k: os r.87 f.00 h.90 0.131s<br>p17 2n/1k: os r.78 f.00 h.89 0.174s<br>p18 4n/1k: os r.89 f.00 h.92 0.133s<br>p19 4n/1k: os r.84 f.00 h.84 0.094s<br>p21 4n/1k: os r.82 f.00 h.89 0.157s<br>p22 4n/1k: os r.81 f.01 h.90 0.13s<br>p24 4n/1k: os r.87 f.00 h.92 0.154s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p26 2n/1k: os r.85 f.00 h.88 0.343s<br>p27 2n/1k: os r.83 f.00 h.90 0.135s<br>p28 2n/1k: os r.80 f.00 h.85 0.194s<br>p30 2n/1k: os r.92 f.00 h.99 0.21s | mixed loop |
| qu-s-marsh | ch 17 prog 20,23,12,14,25,29 | drum mode | 16 | 6 {38,40,46,49,51,55} | p12 2n/1k: lp r.82 f.00 h.86 0.133s<br>p14 2n/1k: os r.91 f.00 h.96 0.359s<br>p20 4n/1k: os r.76 f.00 h.86 0.163s<br>p23 4n/1k: os r.93 f.00 h.97 0.172s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p29 2n/1k: os r.91 f.00 h.95 0.157s | mixed loop |
| qu-s-marsh | ch 18 prog 18,19,21,22,24,25,10,11,13,15,16,17,26,27,28,30 | drum mode | 42 | 16 {36,37,39,41…54,56} | p10 2n/1k: lp r.91 f.00 h.97 0.142s<br>p11 2n/1k: os r.90 f.00 h.94 0.109s<br>p13 2n/1k: os r.87 f.00 h.93 0.148s<br>p15 2n/1k: os r.86 f.00 h.94 0.12s<br>p16 2n/1k: os r.87 f.00 h.90 0.131s<br>p17 2n/1k: os r.78 f.00 h.89 0.174s<br>p18 4n/1k: os r.89 f.00 h.92 0.133s<br>p19 4n/1k: os r.84 f.00 h.84 0.094s<br>p21 4n/1k: os r.82 f.00 h.89 0.157s<br>p22 4n/1k: os r.81 f.01 h.90 0.13s<br>p24 4n/1k: os r.87 f.00 h.92 0.154s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p26 2n/1k: os r.85 f.00 h.88 0.343s<br>p27 2n/1k: os r.83 f.00 h.90 0.135s<br>p28 2n/1k: os r.80 f.00 h.85 0.194s<br>p30 2n/1k: os r.92 f.00 h.99 0.21s | mixed loop |
| qu-s-marsh | ch 19 prog 20,23,12,14,25,29 | drum mode | 16 | 6 {38,40,46,49,51,55} | p12 2n/1k: lp r.82 f.00 h.86 0.133s<br>p14 2n/1k: os r.91 f.00 h.96 0.359s<br>p20 4n/1k: os r.76 f.00 h.86 0.163s<br>p23 4n/1k: os r.93 f.00 h.97 0.172s<br>p25 2n/1k: os r.89 f.00 h.94 0.152s<br>p29 2n/1k: os r.91 f.00 h.95 0.157s | mixed loop |
| queen-of-the-abyss | ch 6 prog 13 | drum mode | 4 | 1 {81} | p13 4n/1k: lp r.67 f.04 h.70 0.591s | looped+root |
| quina-s-theme | ch 7 prog 2 | drum mode | 120 | 1 {83} | p2 120n/1k: os r- f.17 h.40 0.342s | one-shot, no root |
| quina-s-theme | ch 8 prog 19 | drum mode | 3 | 1 {65} | p19 3n/1k: lp r.82 f.00 h.87 1.672s | looped+root |
| quina-s-theme | ch 9 prog 3,4 | drum mode | 504 | 2 {76,77} | p3 231n/1k: os r.59 f.03 h.56 0.105s<br>p4 273n/1k: os r.55 f.02 h.54 0.104s | one-shot+root |
| quina-s-theme | ch 10 prog 0,1 | drum mode | 503 | 2 {60,61} | p0 231n/1k: os r- f.01 h.37 0.173s<br>p1 272n/1k: os r.73 f.00 h.75 0.326s | one-shot, some root |
| quina-s-theme | ch 11 prog 1 | drum mode | 1 | 1 {61} | p1 1n/1k: os r.73 f.00 h.75 0.326s | one-shot+root |
| quina-s-theme | ch 12 prog 17,18 | drum mode | 504 | 2 {63,64} | p17 231n/1k: os r.79 f.00 h.90 0.172s<br>p18 273n/1k: os r.75 f.00 h.84 0.169s | one-shot+root |
| quina-s-theme | ch 13 prog 15 | drum mode | 114 | 1 {36} | p15 114n/1k: os r.66 f.00 h.63 0.77s | one-shot+root |
| rebirth-of-the-evil-mist | ch 16 prog 4,5 | drum mode | 296 | 2 {47,48} | p4 26n/1k: os r- f.03 h.38 0.37s<br>p5 270n/1k: os r- f.09 h.42 0.057s | one-shot, no root |
| rebirth-of-the-evil-mist | ch 17 prog 8 | drum mode | 53 | 2 {87,88} | p8 53n/2k: os r- f.07 h.31 0.573s | one-shot, no root |
| rebirth-of-the-evil-mist | ch 18 prog 8 | drum mode | 1 | 1 {87} | p8 1n/1k: os r- f.07 h.31 0.573s | one-shot, no root |
| rebirth-of-the-evil-mist | ch 19 prog 6 | drum mode | 80 | 1 {50} | p6 80n/1k: os r.77 f.00 h.84 0.366s | one-shot+root |
| rebirth-of-the-evil-mist | ch 20 prog 7 | drum mode | 80 | 1 {52} | p7 80n/1k: os r.71 f.00 h.73 0.338s | one-shot+root |
| rebirth-of-the-evil-mist | ch 21 prog 24 | drum mode | 131 | 3 {41,45,53} | p24 131n/3k: os r.86 f.00 h.91 0.366s | one-shot+root |
| rebirth-of-the-evil-mist | ch 22 prog 24 | drum mode | 129 | 3 {41,45,53} | p24 129n/3k: os r.86 f.00 h.91 0.366s | one-shot+root |
| ruins-of-madain-sari | ch 12 prog 14 | drum mode | 44 | 1 {69} | p14 44n/1k: os r- f.28 h.13 0.183s | one-shot, no root |
| ruins-of-madain-sari | ch 13 prog 15 | drum mode | 23 | 1 {83} | p15 23n/1k: os r- f.18 h.37 0.349s | one-shot, no root |
| ruins-of-madain-sari | ch 14 prog 13 | drum mode | 88 | 1 {87} | p13 88n/1k: os r.83 f.00 h.89 1.268s | one-shot+root |
| ruins-of-madain-sari | ch 15 prog 12 | drum mode | 88 | 1 {36} | p12 88n/1k: os r.65 f.00 h.66 1.751s | one-shot+root |
| run | ch 19 prog 23,22 | drum mode | 30 | 2 {49,55} | p22 17n/1k: os r- f.15 h.21 0.5s<br>p23 13n/1k: os r- f.14 h.33 0.906s | one-shot, no root |
| run | ch 20 prog 31 | drum mode | 100 | 1 {53} | p31 100n/1k: os r- f.10 h.34 0.592s | one-shot, no root |
| run | ch 21 prog 26 | drum mode | 24 | 3 {41,45,48} | p26 24n/3k: os r.73 f.00 h.72 0.484s | one-shot+root |
| run | ch 22 prog 24 | drum mode | 134 | 1 {36} | p24 134n/1k: os r.85 f.00 h.83 0.3s | one-shot+root |
| run | ch 23 prog 25 | drum mode | 84 | 2 {38,40} | p25 84n/2k: os r.50 f.20 h.49 0.263s | one-shot+root |
| run | ch 24 prog 27,29,28,30 | drum mode | 256 | 4 {57,59,62,64} | p27 34n/1k: os r- f.25 h.23 0.365s<br>p28 68n/1k: os r- f.32 h.13 0.222s<br>p29 76n/1k: os r- f.36 h.15 0.126s<br>p30 78n/1k: os r- f.34 h.13 0.192s | one-shot, no root |
| secret-library-daguerreo | ch 4 prog 12 | drum mode | 1 | 1 {91} | p12 1n/1k: lp r.94 f.00 h.96 0.538s | looped+root |
| shinra-march-millennium-version | ch 9 prog 0 | drum mode | 314 | 1 {38} | p0 314n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| shinra-march-millennium-version | ch 10 prog 1 | drum mode | 38 | 1 {59} | p1 38n/1k: lp r- f.42 h.10 0.85s | looped, no root |
| shinra-march-millennium-version | ch 11 prog 10 | drum mode | 64 | 1 {36} | p10 64n/1k: os r.72 f.00 h.70 0.468s | one-shot+root |
| slew-of-love-letters | ch 16 prog 6 | drum mode | 128 | 1 {69} | p6 128n/1k: os r- f.20 h.28 0.124s | one-shot, no root |
| slew-of-love-letters | ch 17 prog 5,4 | drum mode | 176 | 2 {76,77} | p4 88n/1k: os r.69 f.04 h.65 0.069s<br>p5 88n/1k: os r.69 f.03 h.66 0.079s | one-shot+root |
| slew-of-love-letters | ch 18 prog 21,22 | drum mode | 106 | 2 {42,46} | p21 103n/1k: os r- f.24 h.12 0.31s<br>p22 3n/1k: os r- f.14 h.20 0.499s | one-shot, no root |
| slew-of-love-letters | ch 19 prog 1,2 | drum mode | 21 | 3 {41,45,48} | p1 9n/1k: os r.89 f.01 h.88 0.492s<br>p2 12n/2k: os r.86 f.01 h.89 0.444s | one-shot+root |
| slew-of-love-letters | ch 20 prog 0 | drum mode | 67 | 1 {36} | p0 67n/1k: os r.93 f.00 h.94 0.213s | one-shot+root |
| song-of-memories-alternate | ch 13 prog 4,6,8,9,10 | drum mode | 6 | 5 {36,38,40,41,42} | p4 2n/1k: os r1.00 f.00 h.94 0.575s<br>p6 1n/1k: os r1.00 f.00 h.99 1.125s<br>p8 1n/1k: os r1.00 f.00 h.98 2.25s<br>p9 1n/1k: os r1.00 f.00 h1.00 1.16s<br>p10 1n/1k: os r.99 f.00 h.99 2.977s | one-shot+root |
| song-of-memories-alternate | ch 14 prog 5,7,11 | drum mode | 3 | 3 {37,39,43} | p5 1n/1k: os r.98 f.00 h.98 0.648s<br>p7 1n/1k: os r.99 f.00 h.98 2.245s<br>p11 1n/1k: os r.99 f.00 h.98 1.956s | one-shot+root |
| song-of-memories | ch 1 prog 0,1,2,3,4,5 | drum mode | 7 | 6 {36,37,38,39,40,41} | p0 2n/1k: os r1.00 f.00 h.92 1.186s<br>p1 1n/1k: os r1.00 f.00 h.99 1.19s<br>p2 1n/1k: os r.99 f.00 h.99 2.346s<br>p3 1n/1k: os r1.00 f.00 h.94 1.963s<br>p4 1n/1k: os r1.00 f.00 h.99 1.055s<br>p5 1n/1k: os r1.00 f.00 h1.00 3.109s | one-shot+root |
| song-of-memories | ch 2 prog 6 | drum mode | 1 | 1 {42} | p6 1n/1k: os r.99 f.00 h.97 1.658s | one-shot+root |
| steiner-s-theme | ch 17 prog 22 | drum mode | 36 | 1 {83} | p22 36n/1k: os r- f.06 h.40 0.293s | one-shot, no root |
| steiner-s-theme | ch 18 prog 29 | drum mode | 96 | 1 {57} | p29 96n/1k: os r- f.22 h.10 0.113s | one-shot, no root |
| steiner-s-theme | ch 19 prog 23 | drum mode | 1 | 1 {58} | p23 1n/1k: os r- f.21 h.14 0.271s | one-shot, no root |
| steiner-s-theme | ch 20 prog 0 | drum mode | 12 | 2 {76,77} | p0 12n/2k: os r.71 f.01 h.80 0.103s | one-shot+root |
| steiner-s-theme | ch 21 prog 1,2 | drum mode | 40 | 2 {73,74} | p1 16n/1k: os r- f.33 h.21 0.237s<br>p2 24n/1k: os r- f.29 h.34 0.141s | one-shot, no root |
| steiner-s-theme | ch 22 prog 3 | drum mode | 12 | 1 {75} | p3 12n/1k: os r.77 f.01 h.86 0.225s | one-shot+root |
| steiner-s-theme | ch 23 prog 24 | drum mode | 32 | 1 {36} | p24 32n/1k: lp r- f.02 h.38 0.233s | looped, no root |
| stolen-eyes | ch 19 prog 17 | drum mode | 6 | 1 {81} | p17 6n/1k: os r.82 f.01 h.84 1.293s | one-shot+root |
| successive-battles | ch 20 prog 9 | drum mode | 75 | 2 {80,81} | p9 75n/2k: lp r.81 f.02 h.80 0.291s | looped+root |
| successive-battles | ch 21 prog 10 | drum mode | 8 | 1 {59} | p10 8n/1k: lp r- f.42 h.10 0.85s | looped, no root |
| successive-battles | ch 22 prog 8 | drum mode | 455 | 1 {38} | p8 455n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| tetra-master | ch 7 prog 10,9 | drum mode | 80 | 2 {73,74} | p9 48n/1k: os r- f.28 h.25 0.161s<br>p10 32n/1k: os r- f.30 h.41 0.44s | one-shot, no root |
| tetra-master | ch 8 prog 8 | drum mode | 26 | 1 {83} | p8 26n/1k: os r- f.18 h.37 0.349s | one-shot, no root |
| tetra-master | ch 9 prog 18,17 | drum mode | 98 | 2 {63,64} | p17 45n/1k: os r- f.04 h.52 0.246s<br>p18 53n/1k: os r.89 f.00 h.98 0.42s | one-shot, some root |
| tetra-master | ch 10 prog 16,15 | drum mode | 121 | 2 {60,62} | p15 60n/1k: os r- f.01 h.56 0.159s<br>p16 61n/1k: os r.85 f.00 h.84 0.284s | one-shot, some root |
| tetra-master | ch 11 prog 6 | drum mode | 3 | 1 {67} | p6 3n/1k: os r.60 f.05 h.59 0.198s | one-shot+root |
| tetra-master | ch 12 prog 7 | drum mode | 52 | 1 {51} | p7 52n/1k: os r- f.05 h.42 1.134s | one-shot, no root |
| tetra-master | ch 13 prog 12,13 | drum mode | 164 | 2 {42,46} | p12 152n/1k: os r- f.28 h.15 0.297s<br>p13 12n/1k: os r- f.17 h.31 0.538s | one-shot, no root |
| tetra-master | ch 14 prog 14 | drum mode | 57 | 1 {36} | p14 57n/1k: os r.95 f.00 h.96 0.608s | one-shot+root |
| the-airship-hilda-garde | ch 26 prog 9 | drum mode | 10 | 1 {49} | p9 10n/1k: lp r- f.22 h.23 0.777s | looped, no root |
| the-airship-hilda-garde | ch 27 prog 7,8 | drum mode | 583 | 2 {42,46} | p7 401n/1k: os r- f.33 h.13 0.216s<br>p8 182n/1k: os r- f.30 h.11 0.421s | one-shot, no root |
| the-airship-hilda-garde | ch 28 prog 11 | drum mode | 16 | 2 {41,45} | p11 16n/2k: os r.74 f.00 h.74 0.439s | one-shot+root |
| the-airship-hilda-garde | ch 29 prog 11 | drum mode | 16 | 2 {45,48} | p11 16n/2k: os r.74 f.00 h.74 0.439s | one-shot+root |
| the-airship-hilda-garde | ch 30 prog 1 | drum mode | 66 | 1 {38} | p1 66n/1k: os r- f.27 h.27 0.262s | one-shot, no root |
| the-airship-hilda-garde | ch 31 prog 10 | drum mode | 253 | 1 {36} | p10 253n/1k: os r.91 f.00 h.92 0.178s | one-shot+root |
| the-four-medallions | ch 1 prog 6,7 | drum mode | 375 | 2 {69,71} | p6 175n/1k: os r.94 f.00 h.96 0.481s<br>p7 200n/1k: os r.83 f.00 h.81 0.446s | one-shot+root |
| the-sneaky-frog-and-the-scoundrel | ch 10 prog 2 | drum mode | 250 | 1 {53} | p2 250n/1k: os r- f.07 h.40 0.891s | one-shot, no root |
| the-sneaky-frog-and-the-scoundrel | ch 11 prog 4 | drum mode | 119 | 1 {56} | p4 119n/1k: os r.78 f.00 h.85 0.124s | one-shot+root |
| the-sneaky-frog-and-the-scoundrel | ch 12 prog 3 | drum mode | 355 | 1 {82} | p3 355n/1k: os r- f.20 h.28 0.124s | one-shot, no root |
| the-sneaky-frog-and-the-scoundrel | ch 13 prog 6,5 | drum mode | 387 | 2 {63,64} | p5 168n/1k: os r.89 f.00 h.94 0.117s<br>p6 219n/1k: os r.66 f.00 h.79 0.151s | one-shot+root |
| the-sneaky-frog-and-the-scoundrel | ch 14 prog 0,1 | drum mode | 120 | 2 {45,48} | p0 80n/1k: os r.79 f.00 h.78 0.818s<br>p1 40n/1k: os r.88 f.00 h.91 0.594s | one-shot+root |
| theme-of-tantalus | ch 18 prog 14,13 | drum mode | 112 | 2 {56,57} | p13 69n/1k: os r- f.18 h.27 0.07s<br>p14 43n/1k: os r- f.25 h.28 0.099s | one-shot, no root |
| theme-of-tantalus | ch 19 prog 1 | drum mode | 117 | 1 {51} | p1 117n/1k: os r- f.07 h.46 0.796s | one-shot, no root |
| theme-of-tantalus | ch 20 prog 0 | drum mode | 38 | 1 {36} | p0 38n/1k: os r.89 f.00 h.87 0.389s | one-shot+root |
| theme-of-tantalus | ch 21 prog 0 | drum mode | 36 | 1 {36} | p0 36n/1k: os r.89 f.00 h.87 0.389s | one-shot+root |
| tonight | ch 6 prog 13 | drum mode | 18 | 1 {38} | p13 18n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| tonight | ch 7 prog 14 | drum mode | 18 | 1 {40} | p14 18n/1k: os r- f.30 h.48 0.288s | one-shot, no root |
| tonight | ch 8 prog 12 | drum mode | 2 | 1 {36} | p12 2n/1k: os r- f.00 h.44 0.345s | one-shot, no root |
| two-hearts-not-captured | ch 7 prog 2 | drum mode | 1 | 1 {59} | p2 1n/1k: os r- f.38 h.15 1.218s | one-shot, no root |
| ukulele-de-chocobo | ch 9 prog 102 | drum mode | 321 | 1 {70} | p102 321n/1k: os r- f.20 h.28 0.124s | one-shot, no root |
| ukulele-de-chocobo | ch 10 prog 107,108 | drum mode | 73 | 2 {63,64} | p107 31n/1k: os r.79 f.00 h.90 0.172s<br>p108 42n/1k: os r.75 f.00 h.84 0.169s | one-shot+root |
| ukulele-de-chocobo | ch 11 prog 105 | drum mode | 4 | 2 {26,27} | p105 4n/2k: os r- f.21 h.37 0.164s | one-shot, no root |
| ukulele-de-chocobo | ch 12 prog 103 | drum mode | 1 | 1 {78} | p103 1n/1k: os r- f.01 h.45 0.234s | one-shot, no root |
| vamo-alla-flamenco | ch 23 prog 8 | drum mode | 453 | 1 {85} | p8 453n/1k: os r.62 f.09 h.58 0.081s | one-shot+root |
| vamo-alla-flamenco | ch 24 prog 39 | drum mode | 196 | 3 {36,38,40} | p39 196n/3k: os r- f.12 h.22 0.06s | one-shot, no root |
| vamo-alla-flamenco | ch 25 prog 39 | drum mode | 10 | 3 {36,38,40} | p39 10n/3k: os r- f.12 h.22 0.06s | one-shot, no root |
| vamo-alla-flamenco | ch 26 prog 40,0 | drum mode | 222 | 4 {48,50,51,52} | p0 1n/1k: lp r.91 f.00 h.97 0.386s<br>p40 221n/3k: os r.53 f.12 h.53 0.062s | mixed loop |
| vamo-alla-flamenco | ch 28 prog 38 | drum mode | 1 | 1 {60} | p38 1n/1k: os r.63 f.02 h.82 0.401s | one-shot+root |
| vivi-s-theme | ch 13 prog 28 | drum mode | 10 | 1 {39} | p28 10n/1k: os r- f.24 h.18 0.198s | one-shot, no root |
| vivi-s-theme | ch 15 prog 27 | drum mode | 8 | 1 {26} | p27 8n/1k: os r- f.20 h.20 0.119s | one-shot, no root |
| vivi-s-theme | ch 16 prog 22 | drum mode | 16 | 2 {67,68} | p22 16n/2k: os r.71 f.01 h.80 0.103s | one-shot+root |
| vivi-s-theme | ch 17 prog 20 | drum mode | 56 | 2 {27,29} | p20 56n/2k: os r- f.21 h.17 0.42s | one-shot, no root |
| vivi-s-theme | ch 18 prog 19 | drum mode | 53 | 2 {80,81} | p19 53n/2k: lp r.81 f.02 h.80 0.291s | looped+root |
| vivi-s-theme | ch 19 prog 18 | drum mode | 69 | 1 {38} | p18 69n/1k: os r.51 f.24 h.48 0.334s | one-shot+root |
| vivi-s-theme | ch 20 prog 32 | drum mode | 35 | 1 {36} | p32 35n/1k: os r.77 f.00 h.74 0.686s | one-shot+root |
| we-are-thieves | ch 10 prog 4,3 | drum mode | 79 | 2 {56,57} | p3 46n/1k: os r- f.18 h.27 0.07s<br>p4 33n/1k: os r- f.25 h.28 0.099s | one-shot, no root |
| you-re-not-alone | ch 12 prog 129 | one pitch ≥12 | 192 | 1 {57} | p129 192n/1k: os r- f.03 h.50 0.095s | one-shot, no root |
| you-re-not-alone | ch 13 prog 11 | drum mode | 24 | 1 {54} | p11 24n/1k: os r.84 f.01 h.85 0.399s | one-shot+root |
| you-re-not-alone | ch 14 prog 15,14 | drum mode | 192 | 2 {52,53} | p14 128n/1k: os r.92 f.00 h.94 0.339s<br>p15 64n/1k: os r- f.02 h.44 0.17s | one-shot, some root |
| you-re-not-alone | ch 15 prog 24 | drum mode | 128 | 2 {84,85} | p24 128n/2k: os r.84 f.01 h.88 0.106s | one-shot+root |
| you-re-not-alone | ch 16 prog 4 | drum mode | 480 | 1 {69} | p4 480n/1k: os r- f.19 h.17 0.138s | one-shot, no root |
| you-re-not-alone | ch 17 prog 2 | drum mode | 640 | 1 {42} | p2 640n/1k: os r- f.23 h.20 0.199s | one-shot, no root |
| you-re-not-alone | ch 18 prog 22,23 | drum mode | 100 | 2 {36,38} | p22 60n/1k: os r.81 f.00 h.77 0.193s<br>p23 40n/1k: os r.50 f.05 h.55 0.483s | one-shot+root |
| zidane-s-theme | ch 24 prog 16,17 | drum mode | 120 | 2 {76,77} | p16 60n/1k: os r.64 f.06 h.62 0.057s<br>p17 60n/1k: os r.61 f.04 h.59 0.068s | one-shot+root |
| zidane-s-theme | ch 25 prog 22 | drum mode | 6 | 1 {59} | p22 6n/1k: lp r- f.42 h.12 0.715s | looped, no root |
| zidane-s-theme | ch 26 prog 29 | drum mode | 450 | 1 {38} | p29 450n/1k: os r.59 f.18 h.57 0.344s | one-shot+root |
| zidane-s-theme | ch 27 prog 30 | drum mode | 450 | 1 {50} | p30 450n/1k: os r.58 f.18 h.57 0.344s | one-shot+root |
| zidane-s-theme | ch 28 prog 19 | drum mode | 80 | 1 {36} | p19 80n/1k: os r- f.00 h.44 0.345s | one-shot, no root |

### ps2/dark-cloud — 59 songs, 353 groups, 71 marked kit

By sample shape: one-shot+root 28 · one-shot, some root 23 · mixed loop 12 · one-shot, no root 5 · looped+root 3. By rule: one pitch ≥12 18 · VAB kit 53. Kit groups with > 6 written keys: 20 (one-shot, some root 11 · mixed loop 5 · one-shot+root 4).

| Song | Group | Rule | Notes | Keys | Samples (per program) | Shape |
|---|---|---|---|---|---|---|
| battle | ch 2 prog 0 | one pitch ≥12 | 35 | 1 {60} | p0 35n/1k: os r.85 f.03 h.90 0.94s | one-shot+root |
| black-shadow | ch 7 prog 4 | VAB kit | 981 | 3 {24,37,40} | p4 981n/3k: os r.96 f.03 h.96 0.226s; os r- f.28 h.23 0.163s; os r- f.19 h.29 1.658s | one-shot, some root |
| brownboo | ch 8 prog 6 | VAB kit | 643 | 6 {21,42,48,49,51,52} | p6 643n/6k: os r.87 f.00 h.92 0.268s; os r.94 f.00 h.97 0.22s; os r.86 f.00 h.95 0.192s +3 | one-shot+root |
| castle-of-dark-heaven | ch 5 prog 3 | one pitch ≥12 | 33 | 1 {33} | p3 33n/1k: os r.62 f.00 h.85 1.002s | one-shot+root |
| ceremony | ch 6 prog 3 | VAB kit | 863 | 2 {29,47} | p3 863n/2k: os r.83 f.00 h.92 1.345s; os r.56 f.03 h.54 1.14s | one-shot+root |
| dark-cloud-main-theme-broken | ch 8 prog 6 | VAB kit | 1488 | 7 {18,24,37,42,45,58,71} | p6 1488n/7k: os r- f.07 h.47 0.332s; os r- f.28 h.23 0.163s; os r.96 f.03 h.96 0.226s +3 | one-shot, some root |
| dark-cloud-main-theme-broken | ch 9 prog 7 | VAB kit | 1063 | 2 {40,45} | p7 1063n/2k: os r.76 f.00 h.88 0.326s; os r.74 f.00 h.77 0.303s | one-shot+root |
| demon-shaft | ch 6 prog 5 | one pitch ≥12 | 94 | 1 {34} | p5 94n/1k: os r.77 f.00 h.88 1.549s | one-shot+root |
| demon-shaft | ch 7 prog 4 | VAB kit | 399 | 4 {23,39,70,71} | p4 399n/4k: os r- f.23 h.16 0.173s; os r- f.09 h.20 0.899s; os r.87 f.01 h.98 0.263s +1 | one-shot, some root |
| departure | ch 5 prog 5 | VAB kit | 1907 | 15 {14,30,36,42…82,83} | p5 1907n/15k: os r.83 f.00 h.86 0.643s; os r.89 f.04 h.96 0.196s; os r- f.17 h.15 0.132s +12 | mixed loop |
| divine-beast-cave | ch 6 prog 4 | VAB kit | 181 | 3 {24,68,69} | p4 181n/3k: os r.96 f.03 h.96 0.226s; os r- f.03 h.47 0.04s; lp r.64 f.02 h.63 0.776s | mixed loop |
| divine-beast-dran-alternate | ch 4 prog 2 | VAB kit | 180 | 16 {35,36,39,40…55,57} | p2 180n/16k: os r.85 f.00 h.97 0.352s; os r.96 f.00 h.99 0.298s; os r.77 f.00 h.99 0.33s +5 | one-shot+root |
| divine-beast-dran-alternate | ch 5 prog 3 | VAB kit | 180 | 16 {35,36,39,40…55,57} | p3 180n/16k: os r.85 f.00 h.97 0.352s; os r.96 f.00 h.99 0.298s; os r.77 f.00 h.99 0.33s +5 | one-shot+root |
| divine-beast-dran-alternate | ch 10 prog 8 | VAB kit | 1184 | 5 {29,31,37,45,58} | p8 1184n/5k: os r- f.44 h.35 0.163s; os r.62 f.01 h.86 0.601s; os r.70 f.01 h.90 0.598s +1 | one-shot, some root |
| divine-beast-dran | ch 4 prog 2 | VAB kit | 180 | 16 {35,36,39,40…55,57} | p2 180n/16k: os r.85 f.00 h.97 0.352s; os r.96 f.00 h.99 0.298s; os r.77 f.00 h.99 0.33s +5 | one-shot+root |
| divine-beast-dran | ch 5 prog 3 | VAB kit | 180 | 16 {35,36,39,40…55,57} | p3 180n/16k: os r.85 f.00 h.97 0.352s; os r.96 f.00 h.99 0.298s; os r.77 f.00 h.99 0.33s +5 | one-shot+root |
| divine-beast-dran | ch 10 prog 8 | VAB kit | 796 | 3 {37,45,58} | p8 796n/3k: os r- f.44 h.35 0.163s; os r- f.17 h.29 1.958s | one-shot, no root |
| divine-beast-dran | ch 11 prog 9 | one pitch ≥12 | 188 | 1 {36} | p9 188n/1k: os r.77 f.00 h.88 1.549s | one-shot+root |
| duel | ch 2 prog 0 | one pitch ≥12 | 14 | 2 {60,61} | p0 14n/2k: os r.67 f.01 h.49 2.498s | one-shot+root |
| emergency-alternate | ch 2 prog 0 | VAB kit | 83 | 3 {39,60,61} | p0 83n/3k: os r.75 f.00 h.93 0.642s; os r.79 f.00 h.98 0.641s; os r.78 f.00 h.78 0.641s | one-shot+root |
| emergency-alternate | ch 7 prog 5 | VAB kit | 19 | 3 {18,37,45} | p5 19n/3k: os r- f.19 h.29 1.658s; os r.72 f.18 h.72 0.069s | one-shot, some root |
| emergency | ch 2 prog 0 | VAB kit | 184 | 3 {39,60,61} | p0 184n/3k: os r.79 f.00 h.98 0.641s; os r.75 f.00 h.93 0.642s; os r.78 f.00 h.78 0.641s | one-shot+root |
| emergency | ch 7 prog 5 | VAB kit | 41 | 3 {18,37,45} | p5 41n/3k: os r- f.19 h.29 1.658s; os r.72 f.18 h.72 0.069s | one-shot, some root |
| gallery-of-time | ch 2 prog 0 | one pitch ≥12 | 150 | 1 {18} | p0 150n/1k: lp r.87 f.00 h.98 0.735s | looped+root |
| gallery-of-time | ch 7 prog 5 | one pitch ≥12 | 258 | 2 {20,30} | p5 258n/2k: os r.92 f.00 h.98 1.302s; os r.83 f.00 h.92 1.345s | one-shot+root |
| gallery-of-time | ch 8 prog 6 | VAB kit | 326 | 2 {21,37} | p6 326n/2k: os r- f.07 h.26 0.183s; os r- f.19 h.29 1.658s | one-shot, no root |
| last-battle | ch 5 prog 4 | VAB kit | 133 | 2 {24,37} | p4 133n/2k: os r.96 f.03 h.96 0.226s; os r- f.19 h.29 1.658s | one-shot, some root |
| legend-of-hunter-alternate | ch 5 prog 3 | VAB kit | 420 | 4 {14,24,26,42} | p3 420n/4k: os r.96 f.03 h.96 0.226s; os r.53 f.04 h.54 0.274s; os r.79 f.00 h.78 0.964s +1 | one-shot+root |
| main-theme-bossa-nova-version | ch 8 prog 6 | VAB kit | 1487 | 11 {22,24,25,28…45,84} | p6 1487n/11k: os r- f.19 h.29 1.658s; os r- f.44 h.35 0.163s; os r.96 f.03 h.96 0.226s +5 | one-shot, some root |
| matataki-village | ch 6 prog 6 | VAB kit | 642 | 10 {21,42,48,49…68,69} | p6 642n/10k: os r.86 f.00 h.95 0.192s; os r.87 f.00 h.91 0.347s; os r.94 f.00 h.97 0.22s +6 | mixed loop |
| mission | ch 5 prog 4 | VAB kit | 993 | 7 {24,28,30,32,34,37,47} | p4 993n/7k: os r.89 f.05 h.98 0.255s; os r- f.15 h.34 0.029s; os r- f.19 h.29 1.658s +4 | one-shot, some root |
| moon-factory | ch 4 prog 2 | VAB kit | 30 | 2 {60,61} | p2 30n/2k: os r.97 f.00 h.62 6.001s; os r.98 f.00 h.76 6.001s | one-shot+root |
| moon-factory | ch 7 prog 5 | VAB kit | 502 | 6 {23,28,32,34,41,69} | p5 502n/6k: os r.90 f.01 h.96 0.119s; os r.87 f.00 h.86 0.681s; os r- f.07 h.32 0.091s +3 | one-shot, some root |
| moon-sea | ch 7 prog 5 | one pitch ≥12 | 126 | 1 {43} | p5 126n/1k: os r.71 f.00 h.81 0.429s | one-shot+root |
| moon-sea | ch 9 prog 7 | VAB kit | 585 | 10 {23,24,26,30…44,45} | p7 585n/10k: os r.91 f.00 h.96 0.201s; os r.87 f.01 h.98 0.263s; os r- f.07 h.32 0.091s +7 | one-shot, some root |
| muska-lacka | ch 6 prog 4 | VAB kit | 1165 | 9 {24,29,31,33…71,84} | p4 1165n/9k: os r- f.26 h.17 0.427s; os r- f.04 h.36 0.822s; os r.73 f.01 h.58 0.684s +6 | one-shot, some root |
| queens | ch 5 prog 4 | VAB kit | 482 | 3 {42,68,69} | p4 482n/3k: os r.52 f.04 h.53 0.274s; os r- f.03 h.47 0.045s; lp r.65 f.02 h.63 0.687s | mixed loop |
| resurrection-of-the-dark-genie | ch 6 prog 8 | one pitch ≥12 | 98 | 1 {27} | p8 98n/1k: os r.64 f.00 h.87 1.578s | one-shot+root |
| resurrection-of-the-dark-genie | ch 7 prog 5 | VAB kit | 234 | 3 {33,34,35} | p5 234n/3k: os r.83 f.00 h.94 1.558s; os r.92 f.00 h.97 1.402s; os r.92 f.00 h.97 1.389s | one-shot+root |
| resurrection-of-the-dark-genie | ch 8 prog 6 | one pitch ≥12 | 164 | 1 {33} | p6 164n/1k: os r.77 f.00 h.88 1.549s | one-shot+root |
| resurrection-of-the-dark-genie | ch 10 prog 7 | VAB kit | 356 | 4 {43,45,51,71} | p7 356n/4k: os r- f.24 h.23 1.709s; os r.70 f.01 h.82 0.655s; os r- f.02 h.45 0.337s +1 | one-shot, some root |
| shipwreck-alternate | ch 7 prog 5 | VAB kit | 69 | 2 {34,41} | p5 69n/2k: os r.94 f.02 h.98 0.453s; os r.89 f.00 h.96 0.331s | one-shot+root |
| stand-up | ch 6 prog 4 | VAB kit | 553 | 3 {19,24,37} | p4 553n/3k: os r- f.19 h.29 1.658s; os r- f.35 h.27 0.503s; os r.96 f.03 h.96 0.226s | one-shot, some root |
| the-black-knight | ch 9 prog 7 | one pitch ≥12 | 135 | 1 {49} | p7 135n/1k: os r- f.00 h.75 0.988s | one-shot, no root |
| the-black-knight | ch 10 prog 8 | VAB kit | 52 | 5 {18,37,38,40,43} | p8 52n/5k: os r.72 f.18 h.72 0.069s; os r- f.19 h.29 1.658s; os r- f.24 h.20 1.004s +1 | one-shot, some root |
| the-destruction-of-norune-village | ch 5 prog 3 | one pitch ≥12 | 16 | 1 {78} | p3 16n/1k: os r.96 f.01 h.96 0.773s | one-shot+root |
| the-forest-guardian | ch 2 prog 0 | VAB kit | 52 | 3 {60,61,62} | p0 52n/3k: os r.79 f.00 h.90 1.364s; os r.84 f.00 h.62 1.364s; os r.84 f.00 h.52 1.364s | one-shot+root |
| the-ice-queen | ch 6 prog 3 | one pitch ≥12 | 26 | 1 {29} | p3 26n/1k: os r.62 f.00 h.85 1.002s | one-shot+root |
| the-ice-queen | ch 7 prog 5 | one pitch ≥12 | 144 | 1 {31} | p5 144n/1k: os r.83 f.00 h.92 1.345s | one-shot+root |
| the-ice-queen | ch 8 prog 4 | one pitch ≥12 | 13 | 1 {37} | p4 13n/1k: os r- f.19 h.29 1.658s | one-shot, no root |
| the-king-s-curse-alternate | ch 10 prog 8 | VAB kit | 810 | 9 {26,28,30,33…39,70} | p8 810n/9k: os r.88 f.00 h.90 0.717s; os r- f.19 h.29 1.658s; os r- f.23 h.16 0.173s +5 | one-shot, some root |
| the-king-s-curse | ch 6 prog 4 | VAB kit | 479 | 10 {24,26,28,31…45,47} | p4 479n/10k: os r.96 f.03 h.96 0.226s; os r.74 f.09 h.73 1s; os r- f.19 h.29 1.658s +5 | one-shot, some root |
| the-rowdy | ch 6 prog 4 | VAB kit | 676 | 9 {24,28,30,32…47,62} | p4 676n/9k: os r- f.15 h.34 0.029s; os r- f.07 h.32 0.087s; os r- f.35 h.35 0.49s +6 | one-shot, some root |
| the-spirit-king | ch 3 prog 5 | one pitch ≥12 | 10 | 3 {20,24,32} | p5 10n/3k: lp r.95 f.00 h.98 0.601s; lp r.97 f.00 h.99 0.756s; lp r.87 f.00 h.95 0.378s | looped+root |
| the-spirit-king | ch 4 prog 5 | one pitch ≥12 | 10 | 3 {20,24,32} | p5 10n/3k: lp r.95 f.00 h.98 0.601s; lp r.97 f.00 h.99 0.756s; lp r.87 f.00 h.95 0.378s | looped+root |
| the-village-festival | ch 9 prog 8 | VAB kit | 1049 | 5 {33,43,51,52,58} | p8 1049n/5k: os r.93 f.00 h.95 0.423s; os r- f.28 h.21 0.178s; os r.96 f.00 h.98 0.239s +2 | one-shot, some root |
| the-village-festival | ch 10 prog 9 | VAB kit | 139 | 2 {53,54} | p9 139n/2k: os r.69 f.00 h.73 0.71s; os r.69 f.00 h.74 1.073s | one-shot+root |
| the-village-festival | ch 11 prog 10 | VAB kit | 1159 | 10 {36,37,40,41…62,68} | p10 1159n/10k: os r- f.01 h.50 0.312s; os r- f.11 h.38 0.974s; os r.70 f.00 h.68 0.358s +7 | one-shot, some root |
| time-of-destiny | ch 10 prog 8 | VAB kit | 756 | 8 {24,29,31,37,51,52,62,71} | p8 756n/8k: os r.87 f.00 h.91 0.347s; os r.87 f.00 h.92 0.268s; os r.83 f.00 h.86 0.643s +4 | one-shot, some root |
| two-moons | ch 8 prog 7 | one pitch ≥12 | 130 | 1 {25} | p7 130n/1k: os r.62 f.00 h.85 1.002s | one-shot+root |
| two-moons | ch 9 prog 8 | VAB kit | 747 | 7 {24,37,50,51,68,69,84} | p8 747n/7k: os r.96 f.03 h.96 0.226s; os r- f.19 h.29 1.658s; os r- f.06 h.39 0.181s +4 | one-shot, some root |
| unknown-1 | ch 7 prog 8 | VAB kit | 16 | 1 {43} | p8 16n/1k: os r- f.13 h.33 1.511s | one-shot, no root |
| unknown-1 | ch 8 prog 10 | VAB kit | 128 | 2 {36,68} | p10 128n/2k: os r.74 f.01 h.85 0.419s; os r- f.11 h.38 0.974s | one-shot, some root |
| wise-owl-forest-alternate-1 | ch 9 prog 18 | VAB kit | 67 | 6 {59,60,61,62,63,64} | p18 67n/6k: lp r.81 f.00 h.92 1.341s; os r.58 f.00 h.70 0.364s | mixed loop |
| wise-owl-forest-alternate-2 | ch 4 prog 4 | VAB kit | 1039 | 8 {24,26,37,50,51,52,62,69} | p4 1039n/8k: os r.96 f.03 h.96 0.226s; os r.55 f.13 h.78 0.222s; os r.93 f.00 h.97 0.295s +5 | mixed loop |
| wise-owl-forest-alternate-2 | ch 9 prog 18 | VAB kit | 67 | 6 {59,60,61,62,63,64} | p18 67n/6k: lp r.81 f.00 h.92 1.341s; os r.58 f.00 h.70 0.364s | mixed loop |
| wise-owl-forest-alternate-3 | ch 4 prog 4 | VAB kit | 1039 | 8 {24,26,37,50,51,52,62,69} | p4 1039n/8k: os r.96 f.03 h.96 0.226s; os r.55 f.13 h.78 0.222s; os r.93 f.00 h.97 0.295s +5 | mixed loop |
| wise-owl-forest-alternate-3 | ch 9 prog 18 | VAB kit | 67 | 6 {59,60,61,62,63,64} | p18 67n/6k: lp r.81 f.00 h.92 1.341s; os r.58 f.00 h.70 0.364s | mixed loop |
| wise-owl-forest | ch 4 prog 4 | VAB kit | 1039 | 8 {24,26,37,50,51,52,62,69} | p4 1039n/8k: os r.96 f.03 h.96 0.226s; os r.55 f.13 h.78 0.222s; os r.93 f.00 h.97 0.295s +5 | mixed loop |
| wise-owl-forest | ch 9 prog 18 | VAB kit | 67 | 6 {59,60,61,62,63,64} | p18 67n/6k: lp r.81 f.00 h.92 1.341s; os r.58 f.00 h.70 0.364s | mixed loop |
| yellow-drops | ch 5 prog 3 | VAB kit | 663 | 5 {13,14,24,25,80} | p3 663n/5k: os r- f.39 h.14 0.232s; lp r- f.33 h.14 0.884s; os r.96 f.03 h.96 0.226s +2 | mixed loop |
