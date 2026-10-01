# Slotting SPC import into Night Roll

What exists on this branch is the Node pipeline (`tools/spc/`), tested but
not wired into `index.html`. This note is the plan for wiring it, written
against the current Import flow (NIGHT-ROLL.md "Import" and "Chip audio")
so the app-side work can be scoped before it starts. Nothing here is
built; nothing in `index.html` was touched.

## 1. Import flow — the same shape as NSF

The Import picker already byte-sniffs. Add one sniff:

```
"NESM\x1a"                       -> NSF capture panel   (exists)
"SNES-SPC700 Sound File Data"    -> SPC capture panel   (new)
```

Then the SPC path is the NSF path with the module names swapped:

| NSF (today) | SPC (to add) | Note |
|---|---|---|
| `parseNSF` | `parseSPC` | one song per file — no song index, no "Capture all" loop over subsongs; a game's soundtrack arrives as N files (or an `.rsn`, which is RAR — out of scope; ask for the extracted `.spc`s) |
| `runNSFAsync(nsf, song, secs, onProgress)` | `runSPCAsync(spc, secs, onProgress)` | same MessageChannel yielding, same iOS-watchdog reasoning. Default seconds: the ID666 "seconds before fade" tag when present (the dumper's own loop-length guess), else 75 |
| `reconstruct(apuLog, frames, frameSec)` | `reconstruct(capture, {roots})` returns `{events, instruments, frames, frameSec}` | events carry `channel: "voice0".."voice7"`, `instrumentId`, `vol` 0-127, `drum` for noise voices |
| `detectLoopAsync(events, frames)` | unchanged — import from `tools/nsf/notes.mjs` | it keys on `channel:midi:startFrame`, so voice names work as-is; `frameSec` is 0.002 here (2 ms ticks) instead of 1/60, so its `pLo = 120` floor (2 s at NES frames) becomes 0.24 s — pass a hint or raise the floor to ~1000 ticks for SNES |
| `fitBpm(events, frameSec, seed)` | unchanged | the "chip-native family" sweep assumes integer NES frames per 16th; SNES drivers count timer ticks (2–32 ms), so the seeded sweep does the work and the frame family is noise. Acceptable; a timer-tick family could be added later |
| `makeMidi(events, {bpm, frameSec})` | `makeMidi(events, {bpm, frameSec, volMax: 127})` | already generalized on this branch: voices get channels 0-7 (skipping 9), noise events land on channel 9 |
| draft under `albums/imports/<slug>/track-NN.mid` | same | slug from the ID666 game title; track number from the file order or the xid6 OST track tag |

**The one new UI element** is the root panel. Per captured instrument the
capture result has `instruments[i].root = {rootMidi, rootHz, confidence}`
and the notes header prints them. In the capture panel, list them as
editable rows:

```
instrument 0  sample #3   root  B4 +21c   high     [ ▲ ▼ octave ] [ note field ]
instrument 1  sample #7   root  (none)    —        [ … ]
```

Editing a root re-runs `reconstruct(capture, {roots})` (milliseconds; the
emulation is not repeated) and refreshes the draft. This is the honest
surface for the approximation: the tool reports the estimate and its
confidence, the person decides. It also fits the rule that nothing
volunteers a verdict — the estimate is a fact about the sample, and it
is displayed, not enforced. A `low`/`none` row should render visibly
different (so a whole-octave-wrong bass line has an obvious cause).
Persist corrected roots the way loop points are persisted: an
`spc-roots:` local note on the draft, promoted into album.json metadata
at Commit (`spc: {vault: "<file>.spc", roots: {srcn: midi}}`), mirroring
the existing `nsf: {vault, tracks}` block. The `.spc` itself goes to the
private archive repo like `.nsf`s do (same gitignore reasoning: game
data never enters the public repo).

The dump's own KON register is the song's first chord: it arrives as a
key-on at tick 0 like any other note (the player convention — see
RESEARCH.md §1). A voice that was mid-note at dump time without its KON
bit is silent, in players and here.

Events also carry `unpitched: true` when their sample is a one-shot with
no usable root — a drum hit for every practical purpose (FF6 "Strago"'s
voice 7 otherwise reads as MIDI 117). The import should route those to
the drum channel like noise voices, rather than draw them as pitches.

## 2. Chip audio — the S-DSP renderer (built 2026-09-27)

`tools/spc/apu-render.mjs` is the SNES twin of `tools/nsf/apu-render.mjs`
and `tools/gbs/apu-render.mjs`, with the same contract:

```
renderApu(capture, {sampleRate = 44100, onProgress, keepSamples})
  -> {voice0 … voice7: Float32Array, sampleRate, seconds}
```

`capture` is what `runSPC`/`runSPCAsync` return (`dspLog`, `dsp0`, the
end-of-capture `ram`, `samples`). Eight per-voice mono buffers (L and R
folded, MVOL applied) so the app's mute/solo gains keep working; each
goes straight into `audio.createBuffer(1, voiceN.length, sampleRate)`.
Rendered at the chip's 32 kHz, then linearly resampled (a 60 s track
renders in ~0.25 s in Node, ~100× realtime on real rips; yields on a
35 ms budget through `microYield`, `onProgress(0..1)`).

**What it does, per the chip** (blargg's `SPC_DSP.cpp`, Anomie's S-DSP
doc, fullsnes — RESEARCH.md §6): BRR streamed block by block with
END/LOOP (`brr.mjs`'s exact decoder), the 512-entry Gaussian
interpolation ROM with the chip's `>> 11`, int16-wrap-after-three-terms,
clamp and `& ~1` arithmetic, 14-bit PITCH, **pitch modulation** (PMON:
`pitch += (prev OUTX >> 5) × pitch >> 10`, bit 0 ignored), ADSR/GAIN
envelopes and KOFF release from `dsp-state.mjs` (extended, not forked:
`stepVoice()` runs one voice so voice v can be modulated by voice v−1's
output of the same sample; `pos` and `onKeyOn` feed the decode-ahead
ring), the **15-bit noise LFSR** (seed `$4000`, bit 14 = bit 0 ⊕ bit 1,
clocked at the FLG rate) for NON voices, VOL L/R and MVOL as `>> 7`
products with 16-bit clamps, FLG mute and soft reset, the dumped
registers as the state at sample 0 with the dumped KON replayed by
`spc.mjs` (voices mid-note at dump time without a KON bit stay silent,
as in every player).

**What is approximate**: KON acts on the sample of its write (the chip
polls KON every 2 samples and starts decoding 5 later); envelope rate
counters run per voice from KON (the `dsp-state.mjs` skew, ≤ one rate
period); a one-shot's last ~12 samples are not pre-silenced as the chip
does when it reads the END header early; the resampler is linear;
per-voice buffers cannot clip the SUMMED output the way the chip's
single main-out clamp does (the mixes below peak at −9 to −11 dBFS, so
no track here reaches that). BRR data is read from the end-of-capture
RAM: a driver that rewrites sample memory mid-song would render its
final contents throughout — none of the five Square/Nintendo sets does.

**What is skipped**: the echo path (ESA/EDL ring buffer in RAM, the
8-tap FIR, EFB feedback, EVOL return). The dry signal of echo-enabled
voices is present; the wet return is not. The hook is marked in the
voice loop (`ECHO HOOK`). This is the audible gap: Square's mixes lean
on echo for depth, and a flat render is what Josh hears until it lands.

**Measured** (`tools/spc/render.mjs`, which writes a 16-bit WAV and
prints per-voice RMS/peak; the check script compared each lead-voice
note the reconstructor names against the strongest semitone in the
rendered voice's middle 100 ms — rips stayed in the session scratchpad):

| Track, 30 s | render | mix RMS / peak | lead voice | notes ≥ 150 ms whose fundamental sits on the named semitone |
|---|---|---|---|---|
| CT "Frog's Theme" | 240 ms (125×) | −24.0 / −9.4 dBFS | voice 1 (brass, root 883 Hz high) | 25 of 27; median +2 cents; the 2 others +1 semitone, both notes named with −26 cents (slides) |
| FF6 "Terra" | 321 ms (94×) | −24.7 / −11.4 dBFS | voice 0 (root 1278.6 Hz high) | 35 of 35; median −8 cents (a constant offset = the root estimate is ~8 cents sharp; the render plays the chip's pitch) |

Per-voice levels sit between −27 and −42 dBFS RMS; no voice is silent
in either track and none clips. Tests: `tests/spc-render.test.mjs`
(Gaussian table and arithmetic on known bytes, LFSR first values and
period, the synthetic tune's four quarters by frequency, release tail,
silent voices, length and 48 kHz/32 kHz pitch, hand-built captures for
NON/PMON/VOL/MVOL/mute/KOFF, the 60 s timing budget).

## 3. Files and tests

- Import: `index.html` dynamically imports `tools/spc/{spc,notes}.mjs`
  the way it imports `tools/nsf/*` (same Pages path convention — see
  `songsBase`/dynamic-import notes in NIGHT-ROLL.md), so Node and the
  browser run one code path.
- Help sheet + HELP.md + FEATURES drift keyword per the shipping
  checklist ("Import an .spc" under the Import entry).
- `tests/spc.test.mjs` is already in `npm test`; an e2e smoke for the
  panel would follow the NSF import e2e in `tests/e2e/`.
- Docs: NIGHT-ROLL.md gets an "SPC import" paragraph next to "Import";
  WEB-SESSION.md gets `tools/spc/dump.mjs` beside the NSF dump command;
  glossary: "BRR", "root (of a sample)" if they come up in analysis.

## 4. Known limits going in

- Root estimation is an estimate (RESEARCH.md §3.3). Octave errors on
  hollow timbres and no meaningful root for drums/bells are expected;
  the UI row exists for that reason.
- `$F4-$F7` port handshakes with the absent main CPU: some drivers wait
  for a byte that never comes. Symptom: a capture with zero KON writes.
  Report it as "silent" like an SFX slot, and note the driver family if
  it becomes a pattern (a per-driver port-feeding table is the usual
  fix in SPC players). None of the five real sets (Square's AKAO in
  FF4/5/6/CT, Nintendo's in ALttP) does this: every one of 342 drivers
  ran for the whole capture. The "silent" captures they did produce were
  the dumped-KON convention, fixed in `spc.mjs` (see §5).
- IPL ROM window not modelled; TCALL vectors under it are read from RAM.
  No dumped driver depends on it.
- Loop/tempo detection reused from NSF assumes its NES frame floor; see
  the table above for the two constants to revisit.

## 5. Real rips (2026-09-27)

Josh's five albums, downloaded from Zophar's Domain
(`https://www.zophar.net/music/nintendo-snes-spc/<slug>`, the "(EMU)" zip
— the original files, not the MP3 set) and run through the pipeline as it
stands. Rip bytes stayed in the session scratchpad; the TEXT they carry
(tags, names, lengths) is in `tests/fixtures/spc-real-tags.json` and
pinned by `tests/spc-real.test.mjs`.

### Archive shape — the same for all five

A flat zip of `.spc` files, one per track, nothing else: **no `.m3u`, no
`.rsn`**, no folders. Every file is text-format ID666 with an xid6 block
(66,048 + 80-300 bytes). Titles, games, artists, comments are pure ASCII
in all 342 files (no byte ≥ 0x80 anywhere, so Latin-1 vs UTF-8 never
arises). The ID666 date is empty everywhere; the emulator byte is the
ASCII digit `'0'`.

| Album | slug | files | numbering | seconds (min-max) | xid6 OST tags |
|---|---|---|---|---|---|
| Final Fantasy IV | `final-fantasy-iv` | 65 | `01`-`44`, parts `07a`, `44 (part 3)`; `99` = not on OST | 3-502 | 47 of 65 |
| Final Fantasy V | `final-fantasy-v` | 67 | `101`-`133`, `201`-`232` (disc + track) | 5-495 | all |
| Final Fantasy VI | `final-fantasy-vi` | 82 | `101a`-`314d`, `999` = not on OST | 5-683 | 75 of 82 |
| Chrono Trigger | `chrono-trigger` | 92 | `101`-`224`, `999` (22 of them) | 2-289 | 73 of 92 |
| A Link to the Past | `legend-of-zelda-the-a-link-to-the-past` | 36 | `01`-`31`, parts `04a/04b`, `99` | 4-233 | none (xid6 has only the full game name) |

**Names carry the order**, and the pattern is uniform:
`<number><part?> <Title>.spc` — a 3-digit number is `<disc><track><track>`
(`314c` = disc 3, track 14, part c), a 2-digit one is the track, a letter
suffix splits one OST slot into parts (the xid6 OST track of `101a/b/c` is
1 for all three; the letter lives only in the file name), and all-nines
(`99`, `999`) marks unlisted tracks — SFX, ambience, unused songs. The
zip order is the name order. `parseTrackName()` in `spc.mjs` reads this.
The file name is not the title: `?` and `"` are mangled to `_` (`216
____.spc` is `"??"`), so the ID666 title is authoritative. Where the
32-byte ID666 game field truncates ("Legend of Zelda: A Link to the P")
the xid6 game name (`spc.game`) is whole. Header seconds = xid6 intro
ticks / 64000 in every file; header fade ms = fade ticks / 64.

### What the dump produced

Every one of the 342 files parses and emulates: 0 crashes, 0 CPU halts,
0 port handshakes; 30 s of a track captures in ~0.5 s of Node time, a
full 683 s track in ~11 s. Per album, 30 s per track (median / max):

| Album | notes per 30 s | instruments per track | legato splits | drum (noise) notes |
|---|---|---|---|---|
| FF4 | 326 / 1227 | 5 / 11 | 6% | 9 |
| FF5 | 426 / 1625 | 6 / 11 | 9% | 0 |
| FF6 | 352 / 1245 | 6 / 14 | 11% | 115 |
| CT | 311 / 2231 | 5 / 12 | 26% | 22 |
| ALttP | 437 / 1073 | 3 / 7 | 14% | 0 |

The five melodies, full length, with the final pipeline:

| Track | length | instruments | notes | melody voice / range | wall |
|---|---|---|---|---|---|
| FF4 "Main Theme" (`07a`) | 154 s | 7 | 3469 | voice 0, A4-E6 on a 32-sample single-cycle loop (1000 Hz root); harp arpeggio on voice 1 fading in over 3 bars; bass A1-D2; strings on voices 3-5 share one 10,704-sample loop | 2.3 s |
| FF5 "Ahead on our Way" (`101`) | 143 s | 10 | 3240 | voice 0, B3-G5; strings voices 1-3 on a 10,256-sample loop | 2.1 s |
| FF6 "Terra" (`201`) | 215 s | 8 | 4556 | voice 0, C4-F#6 on a 4,480-sample loop (1278.6 Hz root, period 25.0) | 3.4 s |
| CT "Frog's Theme" (`119`) | 61 s | 6 | 1563 | voice 1, F#5-C#7 brass; voices 2/3 in thirds and voice 4 two octaves down on one 13,216-sample string loop | 1.0 s |
| ALttP "Hyrule Field Main Theme" (`08`) | 77 s | 6 | 1983 | voices 0 and 7 doubled, F3-C#5, on a 96-sample loop; pad on voices 3/4 | 1.2 s |

Every `.mid` opens (format 1, 9 tracks, 480 ppq, one channel per voice,
velocities from VOL × envelope). The `.notes.txt` headers name each
sample's root and confidence as before.

### Bugs the rips exposed, all fixed with a synthetic regression test

1. **Root estimation capped `k` at 64** (`notes.mjs`). Square's and
   Nintendo's strings, choirs and brass are long loops of hundreds of
   cycles (4-15k samples); the cap forced their period up to L/64 and the
   pick rule then preferred it — a twelfth or more too low, labelled
   "high", on every album (Terra's lead: period 74.7 for a true 25.0;
   ALttP's pad: 17.7 Hz). Now `k` follows the peak and the pick is
   McLeod's shortest-strong-peak. Test: *"a long multi-period loop names
   the cycle, not the loop grid"* (also covers the two-identical-halves
   loop and the seamed loop where snapping to the L/k grid read a
   semitone sharp).
2. **Dumped KON ignored, dumped ENVX trusted** (`spc.mjs`, `notes.mjs`,
   `dsp-state.mjs`). Every set is dumped at the first KON write; the
   pipeline started ENVX > 0 voices and dropped the KON, so 8 tracks were
   silent (CT "Time Vortex"/"Strong Wind"/"Blackbird (Outside)", FF4
   "Down the Well", ALttP "Unused Sound", …) and every song lost its
   opening chord. Now the player convention (RESEARCH.md §1). Test:
   *"dumped KON register is a pending key-on; dumped ENVX alone is not a
   note"*.
3. **Emulator byte** read as 48 in text-format headers. Test: *"ID666 text
   format: the emulator byte is an ASCII digit; xid6 supplies the
   untruncated game name"* — which also covers the new `parseXid6`
   (OST title/disc/track, publisher, year, intro/fade ticks) against the
   FF4 and ALttP tag blocks.
4. **Set file names**: `parseTrackName()` plus its test; the real-set
   test checks all 342 names against the xid6 OST fields (two unlisted
   tracks are tagged with an OST slot anyway: CT "999 Unknown Fanfare",
   FF6 "999 Dancing Mad (Full)").
5. **Confidence caps** for two real-but-not-a-note measurements (a k = 1
   pick on a loop over 1024 samples; a period under 12 samples) and the
   `unpitched` event flag — both documented in RESEARCH.md §3.3 and §1
   above; the sweep numbers below are with them.

Root confidence over the 1,707 instrument captures of the 30 s sweep,
before → after: high 940 → 1035, medium 229 → 88,
low 193 → 194, none 396 → 390.

### What stays approximate

- **Roots.** A "high" root is a measured period, not a guaranteed octave:
  bright or metallic looped samples (FF5's srcn 40 shaker at 3.5 kHz,
  Strago's percussion) still land a melodic-looking note in the 100+ MIDI
  range; SFX tracks play samples at PITCH `$0040`-`$0300` and yield
  subsonic "notes" (CT "Breath of Lavos" at MIDI −37) that are facts about
  the dump. The root panel of §1 is the answer; the `.notes.txt` header
  and event `confidence`/`unpitched` are the inputs to it.
- **Slides.** Portamento and pitch bends render as runs of short
  chromatic notes (the ±70-cent split rule from NSF); CT leans on them
  (26% of its events are splits). A slide-aware merge (one note with a
  bend) is a candidate improvement, not a bug.
- **Voices mid-note at dump time without a KON bit** are silent until
  re-keyed, as in players; FF6 "Grand Finale (part 1)" (a 9 s sustained
  chord, 4 of 6 voices in KON) shows the cost.
- Envelope-end timing, velocity, tempo and loop detection: as in §4.

### What File → Import has to handle

- **Many files, one song each.** The album arrives as a zip of `.spc`s
  (or a multi-file pick); "capture all" iterates files, not subsongs.
  Order by `parseTrackName()` (disc, track, part; unlisted last), title
  from the ID666 tag, album slug from `spc.game` (xid6 first), per-track
  seconds from `tags.seconds` (2-683 s in these sets — a 683 s capture is
  ~11 s in Node; `runSPCAsync` yields, but show progress).
- **Zip in the browser**: Zophar's EMU sets are plain zip (no `.rsn`);
  the same unzip path as the Game Boy sets applies. RAR stays out of scope.
- **Roots panel** as in §1, plus: voices whose events carry `unpitched`
  go to the drum channel; `confidence: "low"` rows visibly different.
- **Unlisted tracks** (`99`/`999`): SFX, ambience, jingles of 2-30 s.
  Import them, but after the numbered ones, and expect one-voice or
  subsonic results.
- **Multi-part tracks** (`101a/b/c`, `314a-d`) are separate songs sharing
  an OST slot: keep the part letter in the track name.

## 6. NON voices: drum, or texture? (2026-10-01)

A voice with the hardware NOISE generator enabled (DSP `$3D`/NON bit set)
used to become a GM drum unconditionally — correct for a real kit (hats,
snares) but wrong for a voice that just uses the noise generator as a
*timbre*. FF4 "Main Theme (Ocean)" keys voice 6's NOISE bit once at init
and plays it as a ~4 s, near-silent "ocean wash" swell (min 3.999 s, max
4.016 s, ~7.5 s apart, VOL ≈ 1%, ADSR rises then decays to 0 at ~4.2 s):
a texture voice, not percussion. The old rule named its track "drums" and
drumHit's fixed 45 ms synth tick (see NIGHT-ROLL.md "NON voices aren't
automatically drums")
turned the swell into a bright click at its onset.

`tools/spc/notes.mjs`'s `reconstruct()` now classifies each NON voice the
same way `tools/kit-guess.mjs` reads a sequence chip's drum channel — by
rhythm, not by the hardware bit alone — in a post-pass (`classifyNoiseVoices`,
after every voice's onsets/durations are known; a single onset can't carry
this evidence by itself):

- `DRUM_MIN_HITS` (8, matching kit-guess's own busiest-voice/hat threshold):
  fewer onsets than this is too sparse to call a kit.
- `DRUM_MAX_MEDIAN_DUR_SEC` (0.5): the voice's median note duration must be
  under this — a kit hit decays well inside a beat; FF4 voice 6's median is
  4.0 s. Duration is the decisive signal on its own: voice 6 has 36 notes
  (comfortably over DRUM_MIN_HITS), so count alone would have called it a
  kit — median duration is what correctly disqualifies it.

A voice meeting both stays a drum exactly as before (GM note from its noise
clock, folded into the merged "drums" MIDI track/channel 9 by
`tools/nsf/midi-write.mjs`'s `makeMidi`). A voice that doesn't keeps its own
`voiceN` track/channel — never merged — and its pitch is unchanged: the same
noise-clock-derived GM-ish number the drum path already computed (`e.midi`
is set once, at onset, the same way either way; only `e.drum` is cleared
when the voice turns out not to be a kit). `toNotesTxt` picks this up for
free (it already branches on `e.drum !== undefined`).

Deliberately NOT a threshold: spacing regularity. kit-guess uses rhythmic
*alignment* (on/off a beat), and FF4 voice 6's hits are themselves roughly
regular (~7.5 s apart) — duration alone already separates the known cases
cleanly, and a regularity gate risks false negatives on syncopated real
drum patterns in other rips. If a future rip needs it, add it as a third
required signal, not a replacement for duration/count.

Out of scope here, found but not fixed (open-items.md): if/when an S-DSP
renderer lands for SPC (today's SPC import is synth-voices-only — see §2's
header and `index.html`'s "(synth voices; no console audio yet)" label —
`CHIPS.spc.files` lists `"?spc/apu-render"` as optional and unused), its
per-voice PCM would be keyed "voice0".."voice7" (`apu-render.mjs`), but a
drum-classified voice's MIDI track is named "drums" (several voices
merged) — a name mismatch `chipHas()`/`scheduleNote` would need to resolve
before console audio could cover a drum track the way it already can for
melodic ones.

Tests: `tests/spc.test.mjs` ("NON voice classification: …", three cases —
sparse-but-long, dense-and-short, and too-few-to-call-a-kit — built from a
hand-assembled `reconstruct()` capture, not a run SPC: the classifier is a
pure function of the event list, and driver bytecode to script NON/KON/KOFF
would exercise the SPC700 core, not this rule).
