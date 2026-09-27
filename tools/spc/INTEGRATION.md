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

Voices that were already sounding at dump time appear as notes starting
at tick 0 with no onset. Loop-trim usually cuts them anyway (they are
"intro" by construction); if not, they are correct facts and should stay.

## 2. Chip audio — an S-DSP renderer is a bigger job than the 2A03 one

`tools/nsf/apu-render.mjs` turns the APU log into audio in ~400 lines
because the NES channels are arithmetic. The S-DSP equivalent needs, per
voice: BRR streaming with loop handling, **4-point Gaussian
interpolation** (the chip's fixed 512-entry table — its low-pass roll-off
is a large part of "the SNES sound"), the ADSR/GAIN envelope at sample
rate (already in `dsp-state.mjs`), pitch modulation from the previous
voice's output, the 15-bit noise LFSR; then per frame: main volume, the
echo path (a ring buffer in RAM with an 8-tap FIR and feedback — RAM
that the CPU may also be writing), and the final clamp. Roughly 2-3× the
2A03 renderer, and every part of it audible. Two routes:

**Route A — full S-DSP in JS (the faithful one).** Port the structure of
blargg's `SPC_DSP` (the reference most emulators use) to a
`tools/spc/dsp-render.mjs` that consumes the same `dspLog` plus the RAM
snapshot. Because the log is replayed after the fact, the renderer must
also know what RAM held at each moment for streamed samples — rare in
practice; a first version can use the end-of-capture RAM (what
`runSPC` already returns) and flag the few games that stream. Output:
per-voice Float32 buffers like the NES renderer, so mute/solo gains keep
working. Cost: a week of careful work plus a listening pass against a
known emulator; the payoff is the console's own voice, which was the
whole point of chip audio for NSF.

**Route B — WebAudio sample players (the quick, approximate one).** The
capture already yields, per instrument, the decoded PCM, its loop
points and its root. Build one `AudioBuffer` per instrument (32 kHz,
loop points set), and for every note event schedule an
`AudioBufferSourceNode` with `playbackRate = PITCH / 4096` (or, if roots
were corrected, `2^((midi − rootMidi)/12)`), a `GainNode` following the
note's `vol`/`volEnd`, and a stop at the note's end. The ADSR could be
approximated by a `setTargetAtTime` curve from the ADSR registers
captured at KON (attack/decay/sustain-level are all in the event's
register snapshot if we keep it). This is exactly the "oscillator per
note" approach that the NES side outgrew — it cannot do echo, pitch
modulation, the Gaussian roll-off, or the 8 ms release tail precisely,
and fast retriggers of the same voice will overlap where the chip would
cut. But it is a day's work, it makes an imported SPC audible on the
first day, and it plays through the SAME event list the roll shows, so
what you hear is what you see. Recommended as the first step, with
Route A as the "chip" button upgrade once the import flow is proven on
real soundtracks.

A middle path worth noting: Route B's sample players plus a shared
`ConvolverNode`/`DelayNode` echo tuned from EDL/EFB/FIR gets most of the
"SNES reverb" character for little effort, if the flat sound bothers
the ear before Route A lands.

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
  fix in SPC players).
- IPL ROM window not modelled; TCALL vectors under it are read from RAM.
  No dumped driver depends on it.
- Loop/tempo detection reused from NSF assumes its NES frame floor; see
  the table above for the two constants to revisit.
