# Meter detection v2 — the "meter judge" plan

Status: **researched 2026-08-05, parked.** Nothing built yet. This doc is
the full state of the research so a future session can start building
without re-deriving anything.

## Why this exists

Josh's workflow for any new OST (FF1 now, Mega Man 2 etc. later): listen,
**guess the meter by ear first**, then test the guess. Two ways to test:

1. Search the internet for someone else's transcription and compare —
   slow, per-song manual work, and only as good as that transcriber.
2. Detect it programmatically — one-time tool cost, then free forever.

Josh chose (2) on 2026-08-05. This matters more as new NSFs arrive with
*no* transcription reference at all: every track starts as a cold capture
with a grid-fitted 4/4 header that means nothing.

## What we already have, and why it isn't enough

### The fossil problem (see open-items.md)

The pipeline reads each song's meter and seed tempo from the .mid it
itself wrote — a closed loop tracing back to discarded arrangement MIDIs
with no provenance. Shop proved a fossil wrong: header said 4/4, Josh's
barline test said 3/4, and 3/4 is now declared (METER_OVERRIDE in
dump-all, capture re-barred to 28 bars of 3/4).

### Meter audit v1 (`tools/nsf/meter_audit.mjs`) — what it can and can't do

v1 mechanizes exactly one test: the **figure-period barline test** —
find each channel's dominant repeating figure by onset self-similarity,
then check whether that figure's period phases across the current
barlines. Findings quarantined in `reference/meter-audit.md`.

Results on all 19 FF1 songs:

- **Every song passes against its current header except epilogue**
  (triangle figure of 2.5q phases across any candidate barline —
  expected, the epilogue is rubato).
- **Every verdict is "ambiguous"** between 2/4/6-ish candidates, because
  a short figure (many songs' dominant figure is 1 quarter long) is
  consistent with *any* bar length.

The damning case study: **shop**. Its dominant figures are 1q on both
pulse1 and triangle, so v1's candidate set is {2, 3, 4, 6} — it cannot
prefer 3/4 over 4/4. Run against the old wrong 4/4 header it would have
said "passes." **v1 would not have caught the one confirmed fossil
error.** Josh's ear used evidence v1 doesn't model: which figure is
*the* figure, and where its accents land.

The missing evidence classes, in order of power:

1. **Accent placement** — where do loud/agogic/registral accents recur?
   (We now have real chip volume → velocity for pulse channels, unused
   by v1.)
2. **Grouping / hierarchy** — bars group into 2s and 4s; a correct meter
   makes higher levels line up too (hypermeter). v1 has no hierarchy.
3. **Harmonic rhythm** — chords tend to change on downbeats. v1 never
   looks at pitch at all.
4. **Bass patterning** — oom-pah vs oom-pah-pah; the triangle line is a
   meter tell v1 treats as just onsets.

## The v2 design: two independent judges + Josh

Don't build one bigger detector — borrow two *different kinds* of
outside opinion and treat disagreement as signal:

```
Josh's by-ear guess  ──┐
                       ├──► compare, report agree/disagree + evidence
symbolic judge (.mid) ─┤     (quarantined; run on demand, AFTER the guess)
audio judge (chip wav)─┘
```

- Both judges agree with Josh → strong confirmation.
- Judges agree with each other, disagree with Josh → worth a re-listen.
- Judges disagree with each other → genuinely ambiguous song; also
  worth knowing (some songs *are* honestly 2-vs-4 ambiguous).

The two judges fail differently, which is the point: the symbolic judge
sees exact note data but knows nothing about how the music *sounds*; the
audio judge hears the real chip mix (including noise-channel drums the
note data downplays) but works from spectrograms, not notes.

### Judge 1 — symbolic, from the .mid / notes.txt

**Primary candidate: [apmcleod/met-detection](https://github.com/apmcleod/met-detection)**
— Java program whose stated goal is exactly this: detect the meter of a
piece from a MIDI file. Lexicalized PCFG over note groupings; paper:
[McLeod & Steedman, SMC 2017](http://smc2017.aalto.fi/media/materials/proceedings/SMC17_p373.pdf).
Ignores the file's header — infers from the notes alone (essential;
our headers are the fossils under test).

**Successor: [apmcleod/met-align](https://github.com/apmcleod/met-align)**
— HMM that both detects the metrical structure and aligns it: labels
bars, beats, and sub-beats in time from a bare note list. Paper:
[Meter Detection and Alignment of MIDI Performance (ISMIR)](https://apmcleod.github.io/pdf/ISMIR_Meter.pdf).
The alignment part is a bonus we'd get free: it could re-anchor a cold
capture's bar 1 (our trimmer already handles loop seams, but first-bar
phase on cold NSFs is guesswork today).

Caveats:
- Java dependency (one jar; fine as a checked-in vendor/ tool or a
  documented `brew install openjdk` step, but it's a dep).
- Trained/evaluated on classical + performance corpora; chiptune
  figuration (fast arps, echo voices) untested. May need us to feed it
  the triangle + one pulse only, or de-arp preprocessing. Unknown until
  tried.
- Output is a meter *class* (duple/triple × simple/compound + bar
  length) — maps cleanly onto what Josh actually declares.

**Rejected symbolic alternatives:**
- MIDIToolbox `meter` (MATLAB, autocorrelation): the literature's weak
  baseline — PRIMA and the PCFG both beat it, and it's what our v1
  already resembles. Nothing to gain.
- Inner Metric Analysis ([de Haas & Volk paper](https://dspace.library.uu.nl/bitstream/handle/1874/344553/033_Paper.pdf)):
  strong idea (spectral weight of all maximal note repetitions), but no
  maintained public implementation found — research code only. Revisit
  only if both judges underperform.
- music21: has no serious meter-induction; `bestTimeSignature` assumes
  bars already known. Not a candidate.

### Judge 2 — audio, from rendered chip sound

**Primary candidate: [Beat This!](https://github.com/CPJKU/beat_this)**
(CPJKU, ISMIR 2024 — Foscarin, Schlüter, Widmer): transformer beat +
downbeat tracker, best published F1 for both tasks, pip-installable
(PyTorch), CLI + Python API. Meter falls out directly: count tracked
beats between consecutive downbeats → beats-per-bar sequence → modal
value + stability = verdict + confidence. Mid-song meter changes appear
as a change in that sequence — something the symbolic PCFG (single
meter per piece) can't represent.

**Fallback: [madmom](https://madmom.readthedocs.io/en/v0.16/_modules/madmom/features/downbeats.html)**
`RNNDownBeatProcessor` + `DBNDownBeatTrackingProcessor(beats_per_bar=[2,3,4,6])`
— the pre-2024 standard; explicitly models candidate bar lengths and
picks one, which is a nice direct API for our question. Known problem:
installation is fragile on modern Python/NumPy (aging Cython codebase);
treat as fallback only if Beat This! disappoints on chiptune.

**Where the audio comes from:** our own emulator. `tools/nsf/` runs the
6502 + APU to log frames — check whether the APU stage already
synthesizes PCM samples; if it only logs register writes, add a small
sample-rendering pass (square/triangle/noise synthesis from the logged
register timeline is straightforward and deterministic). Rendering from
the NSF means the judge hears the *actual chip audio* — including the
noise channel's drum patterns, which are strong meter evidence the
note-based judges barely see — and is fully independent of every fossil
in our MIDI path.

Caveat: all audio trackers are trained on human music; chiptune's rigid
quantization and timbres are out-of-distribution. Probably *easier*
(metronomic tempo), but unverified. First real test: run on shop —
must say 3, not 4.

### Rejected/background for the audio side

- [Time Signature Detection: A Survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC8512143/)
  — field overview; confirms downbeat-tracking-then-count is the
  standard route and autocorrelation is the weak baseline.
- [METER2800 dataset](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10700346/)
  — training data if we ever fine-tune. We won't; noted for
  completeness.
- ResNet18-style end-to-end classifiers: dataset-bound genre models,
  no maintained tool. Skip.

## Build plan (when we pick this up)

Shape: `tools/nsf/meter_judge.mjs` orchestrator (or .py if the audio
judge makes Python the host) — per song or whole album:

1. **Input:** track id or existing capture (.mid + .notes.txt), plus
   Josh's guessed meter (required argument — the tool refuses to run
   without a guess, by design; it's a *judge*, not an oracle).
2. **Render** chip audio → wav (emulator sample pass; cache next to the
   capture, gitignored).
3. **Audio judge:** Beat This! → downbeat times → beats-per-bar
   sequence → verdict {meter, confidence, any mid-song changes}.
4. **Symbolic judge:** met-detection (or met-align) on a
   header-stripped .mid → verdict {meter class}.
5. **Report:** each judge's verdict vs Josh's guess, with the evidence
   (downbeat interval histogram; PCFG's chosen grouping). Written to
   the quarantine dir (`reference/meter-judge/<song>.md`), never into
   song docs, never auto-applied to captures. Promotion to a declared
   meter stays a Josh-only act (timesig: directive / METER_OVERRIDE).
6. **Album sweep mode** exists but still requires guesses per song —
   no guess, no verdict shown. Undetermined meters stay unspoiled.

Acceptance tests before trusting it anywhere:
- **shop → 3/4** (the known fossil; both judges must beat v1 here).
- **menu → 6/8** (compound meter — hard case; symbolic judge's
  simple-vs-compound classification earns its keep or doesn't).
- **epilogue → low confidence / unstable** (rubato; the *right* answer
  is refusing to answer).
- The other 16 FF1 songs: judges vs headers as a survey — mismatches
  are leads, not verdicts.

Est. effort: audio judge alone ≈ an evening if the emulator already has
sample output (mostly plumbing + downbeat-interval math); symbolic
judge ≈ another short session (Java setup + output parsing + MIDI
header-stripping). Independent — can ship audio-only first (open
question below).

## Open questions (decide at build time)

- **Audio-only first, or both judges?** Audio-only avoids the Java dep
  and Beat This! is the stronger model; but one judge = no
  disagreement signal. (Josh was asked 2026-08-05, deferred.)
- Does the APU stage already produce samples, or just register logs?
  (Determines the evening-vs-weekend estimate.)
- met-detection vs met-align for the symbolic slot (align's bar-phase
  output is tempting for cold NSFs).
- Python host vs Node host for the orchestrator (Beat This! is
  PyTorch → probably a small Python wrapper called from the existing
  Node tooling).
- Where verdicts live for non-FF1 albums (probably
  `albums/<album>/reference/meter-judge/`, same quarantine rule).

## Relation to existing work

- Supersedes-someday: `tools/nsf/meter_audit.mjs` (v1) stays as the
  cheap first pass; the judges are the expensive second opinion.
- open-items.md "NSF meter/tempo fossil problem" — this doc is the
  detector-v2 half of that item, expanded.
- Chip-volume velocities (built 2026-08-05) feed any future
  accent-based improvement to v1, and make the rendered audio dynamics
  real for the audio judge.
