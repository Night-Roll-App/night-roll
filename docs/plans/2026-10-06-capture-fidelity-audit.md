# Capture fidelity audit: what the chips do vs what our .mid keeps (advisor, 2026-10-06)

Josh (Terminal #162): "we should recapture everything, if we're able to get
this additional information. But before we do that we should ask: is there
anything else we could be missing… Because I don't wanna do this very often.
And… is that the same for all of our other consoles?"

Short answer. Yes, a lot is missing, and the same holds on every console.
But three things change how big the job is:

1. **What you hear by default is mostly fine already.** A capture plays its
   *console voice* by default (#513). That re-renders the original rip, so
   the swells, vibrato, and duty changes are all there. The .mid matters
   when a track is on an instrument voice, for what the roll and the query
   tools can show, and for what your own songs can learn to do.
2. **Some gaps are in the console renderers, not in the .mid.** Fixing
   those needs no re-capture, because the renderer reads the rip every time.
   They are listed in §3.
3. **The app throws away new data even if a capture writes it.** Publishing
   re-encodes every capture through `parseMidi` → draft → `writeMidi`. That
   path keeps only pitch, time, length, velocity, `ve`, duty and one pan per
   track (src/import/capture.js:517–530, :656; src/midi/parse.js:122–141).
   N64 program changes are already lost this way. The scan of the published
   Mario 64 and GoldenEye files found zero, though `toMidi` writes them
   (tools/nsf/midi-write.mjs:266). **So the app's MIDI layer has to change
   first. Re-capturing comes last.**

Measurements below were run in /tmp/capaudit with the repo's own capture
code. Nothing under albums/ was written.

## 1. Per console: what the chip does vs what the .mid keeps

Legend: ✓ kept · ~ partly · ✗ lost. "Console voice" says whether default
playback has it anyway.

### NES (tools/nsf/, 19 albums; FF1 is built by tools/nsf/dump-all.mjs)

| Chip/driver does | .mid today | Console voice | Where |
|---|---|---|---|
| Volume steps inside a note (swells, decays) | ~ start level + lowest later level (`ve`); rises dropped | ✓ | notes.mjs:69–71, :97–98; midi-write.mjs:98–101 |
| Duty (timbre) at the attack | ✓ CC70 | ✓ | notes.mjs:70, midi-write.mjs:50–53 |
| Duty changes inside a note | ✗ | ✓ | duty is read only when a note starts |
| Vibrato / small pitch wobble (under ±70 cents) | ✗ (merged into one note on purpose) | ✓ | notes.mjs:61–63 |
| Slides between pitches | ~ collapsed into the target note | ✓ | notes.mjs:128–156 |
| Hardware sweep | ✗ (only its mute rule is kept) | ✓ | notes.mjs:39–42 |
| Noise period (16 settings) | ~ folded into 3 GM drums | ✓ | midi-write.mjs:69 |
| Noise "short" (metallic) mode, $400E bit 7 | ✗ | ? | notes.mjs:54 keeps only the low 4 bits |
| **DPCM samples (drums, bass hits)** | ✗ **no notes at all** | ✗ **not rendered either** | notes.mjs:20–25 has no DMC; apu-render.mjs:84–126 has no DMC |
| Tempo changes (ritardando) | ✗ one tempo per song | n/a | midi-write.mjs:82–107 |
| Loop point | ✓ as a `loop:` annotation | ✓ | capture.js:533 |

Measured over the first 4 tracks × 30 s of every NES album:

| Album | pitched notes | volume rises inside a note | vibrato/bend notes | duty changes inside a note | DPCM hits |
|---|---|---|---|---|---|
| FF1 | 954 | 69 | 0 | 0 | 0 |
| Super Mario Bros 3 | 774 | 137 | 0 | 287 | 375 |
| Castlevania II | 2059 | 450 | 198 | 807 | 558 (+554 raw PCM writes) |
| Contra | 1480 | 263 | 0 | 3 | 564 |
| Kirby's Adventure | 2112 | 247 | 58 | 595 | 419 |
| Ninja Gaiden / II | 1128 / 1891 | 58 / 531 | 129 / 155 | 0 | 315 / 514 |
| Shatterhand | 2821 | 1086 | 206 | 0 | 0 |
| Punch-Out!! | 711 | 398 | 466 | 34 | 0 |
| Mega Man 2 | 1570 | 0 | 155 | 0 | 0 |

So six of the 19 NES albums have **drum tracks you have never seen in the
roll or heard in the console voice**. Side note: NIGHT-ROLL.md (~L3872)
says the capture "never logs $4010-$4013". That is wrong. nsf.mjs:83 logs
$4000–$4017. The writes are in the log and nothing reads them.

FF1 check: I re-ran the FF1 dump with today's code into scratch.
`song-diff` says every song is **identical by start, pitch, length and
velocity**. Today's code would also add 3,266 `ve` decay targets that the
committed FF1 files don't have; they were made before `ve` existed. So an
FF1 re-capture is safe, and it already gains something.

### Game Boy (tools/gbs/, 10 albums)

| Chip does | .mid today | Console voice | Where |
|---|---|---|---|
| Hardware envelope down | ✓ `ve` | ✓ | gbs/notes.mjs:121–125 |
| Envelope **up** (rising) | ✗ | ✓ | same line: only falls are kept |
| Duty | ✓ at the attack | ✓ | :135 |
| Stereo routing NR51 (hard left/right/both) | ✗ | ✗ (render folds to mono, apu-render.mjs:11) | :160–165 |
| Master volume NR50 | ✗ | ✓ | :166 |
| Wave-channel waveform (32 samples, the timbre) | ✗ (used only to correct the octave) | ✓ | :167–172 |
| Pulse1 sweep | ✗ | ✓ | :179 |
| Noise 7-bit (metallic) mode | ✗ (on the event, never written) | ✓ | :137 |

Measured: Pokémon Red, 6 tracks × 40 s: 196 stereo-routing changes, 10,864
wave-RAM writes. Link's Awakening: 93 rising-envelope writes, 288 wave-RAM
writes.

### SNES (tools/spc/, 13 albums)

| DSP does | .mid today | Console voice | Where |
|---|---|---|---|
| ADSR/GAIN envelope (the note's whole loudness curve) | ✗ (velocity = VOL × attack peak; envelope used only to find the note's end) | ✓ | spc/notes.mjs:215–216, :292–293 |
| Voice VOL changes (fades, swells) | ~ falls only | ✓ | :275–278 |
| **Stereo: VOL L vs R per voice, often moving** | ✗ (max of L,R) | ✗ (render is mono) | :215 |
| **Echo (EON per voice, EVOL, EFB, EDL, FIR)** | ✗ | ✗ (renderer skips the wet return, apu-render.mjs:30–32) | not read |
| Pitch modulation (PMON) | ✗ | ✓ | not read |
| Instrument (sample) per note | ✗ (in .notes.txt only) | ✓ | :246 |
| Fine tuning (cents) | ✗ (rounded) | ✓ | :245 |
| Pitch bends / vibrato under ±70 cents | ✗ | ✓ | :271 |

Measured, 40 s each: FF4 Main Theme has echo on all 8 voices, 5,433
ADSR/GAIN writes, 11,986 VOL writes, and pan positions moving on 5 voices.
Its published notes have **zero** `ve` (FF4 holds VOL steady and shapes
with ADSR, which we ignore). CT Last Battle: 1,001 PMON writes, 120 notes
detuned by 15 cents or more, 6 voices switching sample, and voices panning
across the full width.

### Sega Genesis (tools/vgm/; pipeline only, no album, no renderer)

FM patch (the 4 operators, algorithm, feedback), stereo L/R bits, LFO, and
DAC sample identity (every DAC hit is GM 36, vgm/notes.mjs:52) are all ✗.
Low priority until there is an album.

### PS1 (tools/psx/, 6 albums) and PS2 (tools/ps2/, 2 albums), same writer

| Sequence does | .mid today | Console voice | Where |
|---|---|---|---|
| Volume/expression ramps under a held note | ✗ (computed as `n.gain`, used only by the render) | ✓ | akao.mjs:519–532 |
| Instrument envelope | ~ `ve` from the table | ✓ | psx/notes.mjs:277–287 |
| Channel volume (CC7/CC11): the mix balance | ✗ (`chVol` computed, never written) | ✓ | psx/notes.mjs:65–66 |
| Pan changes | ~ written as CC10, but parse keeps only the **last** pan per track | ✓ | psx/notes.mjs:328–329; parse.js:129, :154 |
| Pitch slides / bends | ~ split into one note per landed pitch | ✓ | psx/notes.mjs:113–127; ps2/bgm.mjs:209–231 |
| Program change within a channel | ✗ (only in the track name) | ✓ | psx/notes.mjs:242 |
| Vibrato/tremolo/pan LFOs, reverb on/off, noise | ✗ (opcodes skipped) | ✗ (no reverb in the render, spu-render.mjs:16) | akao.mjs:514 |
| Tempo map | ✓ | ✓ | |

Measured, FF7: Prelude has 154 notes whose level moves while held (137
rising). Bombing Mission has 128 slid notes, pan moving on 7 of 16
channels, and 8 channels switching program. The published FF7 and FFX
files: FFX carries no pan and no `ve` at all.

### N64 (tools/n64/, 8 albums)

| Sequence does | .mid today | Console voice | Where |
|---|---|---|---|
| Channel volume × scale × player fade | ✗ (`n.vol`, render only) | ✓ | seq-libultra.mjs:94–99, :348 |
| Volume under held notes (cc7, Rare) | ✗ (`n.gain`) | ✓ | rare.mjs:302–372 |
| Vibrato, portamento, bend (D3) | ✗ (slides split into notes) | ✓ | seq-libultra.mjs:347–354; n64/notes.mjs:19–35 |
| Reverb send per channel (0–127) | ✗ | ✓ | seq-libultra.mjs:420 |
| Program | ✗ (written, then dropped at publish) | ✓ | n64/notes.mjs:142 |
| Pan | ~ last-wins, as on PS1 | ✓ | n64/notes.mjs:135–138 |
| "Sound-shaping ops ignored" | listed in the capture warnings | | seq-libultra.mjs:56 |

## 2. Does each loss matter for Josh, and how to store it

Josh's three uses: **study** (see and hear what the composer did), **edit
with synth voices** (a capture track on an instrument), and **his own
songs** (the same capability for writing).

| Lost item | Study | Synth voice | His songs | Store as (standard MIDI first) |
|---|---|---|---|---|
| Loudness shape inside a note (swell, decay, ADSR) | high (Shop) | high | high (#516) | poly aftertouch at ticks inside the note, the in-note-dynamics plan (b). An aftertouch at the note-on tick keeps meaning `ve`. |
| Channel volume / mix balance (CC7) | medium | high (a quiet pad plays as loud as the lead) | low | CC7 per track, at tick 0 plus changes; playback multiplies the track gain |
| Moving pan | medium | medium | medium | CC10 changes over time. **Parse must stop keeping only the last one.** |
| Stereo routing (GB) / VOL L-R (SNES) | medium | medium | n/a | CC10 (GB: 0 / 64 / 127) |
| Vibrato, fine detune, slides on one voice | medium | high (a held note sounds dead without its vibrato) | medium | pitch bend (0xE0) + RPN 0 bend range at tick 0 (±12). The chip voices play one note at a time, and the sequence chips bend whole channels, so channel bend is exact, not an approximation. |
| Duty change inside a note (NES/GB) | low-medium | medium | low | CC70 at ticks inside the note (the same controller as today) |
| Instrument/sample per note (SNES, PS1, N64) | medium (which sound plays which line) | high with game instruments | n/a | Program Change (0xC0) before the note |
| GB waveform | medium | medium | n/a | Program Change = which of the song's waveforms, plus a text meta `wave:<32 hex>` defining each one |
| Echo/reverb send | low for study, high for "sounds right" | medium | medium | CC91 per track (N64 send 0–127; SNES EON × EVOL); the SNES echo settings as one conductor text meta `echo:delay=…;fb=…;fir=…` |
| NES DPCM hits | **high**: the drum part is missing | high | n/a | new notes on a new **last** kit track ("dpcm", ch 10), GM key by rhythm via tools/kit-guess.mjs, as PS1 does |
| Noise mode/period detail | low | low | n/a | CC71 before each hit (raw period + mode bit) |
| PMON, LFO tremolo, Genesis FM patch | low | low | n/a | skip in v2 |
| Tempo changes inside frame-chip songs | medium | n/a | n/a | **not in v2.** Adding them moves bars (§4). |

Rules for every row:
- **Captured facts live in the .mid, never as new annotations.** The
  annotations are Josh's discoveries, and the `loop:` line is the only
  capture-written annotation. Text metas follow the existing
  `sounding:` pattern: Night Roll owns them, other DAWs ignore them.
- **No key or meter data anywhere**, and no named gestures. Shapes are
  numbers (Learning mode).
- **Old files read the same as today.** No new event appears in an existing
  file until it is re-captured. A new file opened by an older app build
  (the iPad lags the web) degrades: an in-note aftertouch reads as `ve`
  (last value wins, a ramp to the end level), and unknown CCs or bends are
  dropped. Playback is plainer, but the file is not broken.
- Every owned event needs **four places changed together**: parse.js (read
  it into note/track fields), capture.js:517–530 (copy it into the draft),
  writeSongMidi in tools/nsf/midi-write.mjs **and** its hand-port
  src/midi/write.js (the byte-for-byte test pins them), plus the raw
  writers (makeMidi / makeMidiTracks / psx makeMidi).

## 3. Console renderer gaps (no re-capture needed: the rip is read live)

- NES: no DMC channel in apu-render.mjs. Six albums' drums are silent in
  the default voice. **This is the biggest ear-level gap in the whole
  audit.**
- SNES: mono, and no echo return (apu-render.mjs:30–32).
- Game Boy: NR51 folded to mono (gbs/apu-render.mjs:11).
- PS1/PS2: no reverb (spu-render.mjs:16, :189).

These ship like any player fix: one console per push, then an ear check.

## 4. Capture v2 spec per console, ranked by payoff

**P0 — the app's MIDI layer (no capture changes; ships first).** Make
parse/draft/write own: in-note aftertouch points (`n.env`), CC7 track
volume, a CC10 pan timeline, pitch bend + RPN range, Program Change per
note, CC70 inside a note, CC91, and the `wave:`/`echo:` text metas. Tests:
every published .mid in albums/ re-parses to the same notes and writes the
same bytes (a sweep test over the whole catalog). This also fixes the
"last pan wins" collapse.

**P0 — playback (src/audio/voices.js, engine.js, bounce.js).** It must:
ramp through `n.env` points (today it only ramps down to `ve`,
voices.js:318–322); apply CC7 × track gain; follow the pan timeline;
follow bend by setting `detune` on the note's oscillator; switch the duty
wave mid-note (two oscillators crossfaded, since Web Audio can't swap a
wave on a schedule); add a reverb send bus for CC91. The voice menu's
"game:" instruments pick their sample by Program.

Then, per console, in payoff order:

1. **NES v2**: full $4000/$4004/$400C level series per note, thinned to
   its corners (the dynamics plan); duty points inside notes; vibrato and
   slide ramps as bend (the notes themselves are not changed); **DPCM**:
   read $4010–$4013 and $4015 bit 4 into hits, with the sample identity
   being address + length (no table). Plus the DMC renderer (§3).
   *Example:* Shop pulse2 bar 25 gets aftertouch points 68 → 127 → 68
   inside the one note.
2. **SNES v2**: sample the DSP's own envelope × VOL each 2 ms tick into
   shape points; L/R into CC10; SRCN into Program; cents and vibrato into
   bend; EON/EVOL into CC91 plus the `echo:` meta.
3. **PS1/PS2 v2**: write the `n.gain` that already exists as shape points;
   `chVol` as CC7; Program per note; bends as pitch bend *only below a
   semitone* (split slides stay as they are, see Q3); read the AKAO reverb
   on/off opcodes into CC91.
4. **N64 v2**: `n.gain`/`n.vol` as shape + CC7; vibrato as bend; reverb
   send as CC91; Program (which today is lost at publish).
5. **Game Boy v2**: rising envelopes into shape points; NR51 into CC10;
   wave tables into Program + `wave:`; sweep into bend.
6. Genesis: wait for an album.

"No one-time hacks" check: every item above is a register or opcode
read the same way for every game on that chip. Two existing tables to
note. `USF_GAMES` (ead-usf.mjs:215) only says *where* the song id lives
and which driver dialect to use, which the rule allows. FF1's
`PERIOD_BARS`/`METER_OVERRIDE`/`FIXED_BPM` (dump-all.mjs:15–44) are
per-song **bar counts** that Josh verified, not sound. They must be reused
unchanged, because they decide FF1's bars. DPCM drum keys come from
rhythm (kit-guess), never from a per-game list.

## 5. Safe re-capture plan

**The hard rule: bars don't move.** Josh's annotations are bar/beat
anchored (`"at":[25,1]`). Track numbers are anchors too (`track: tr3
voice=sine`). A re-capture may only *add expression*, never move notes.

Tools to build:
- `tools/capture-diff.mjs old.mid new.mid`. This builds on song-diff.mjs's
  loader and adds a verdict. **SAME** means the same ppq, tempo map, meter,
  and track count, order and names, and the same set of (track, tick,
  pitch, length) for every note. **VELOCITY** means the notes are the same
  but some velocities changed; it lists them. **ADDED-TRACK** means
  everything is the same plus new tracks *after* the old ones (DPCM).
  **MOVED** means anything else; it lists the bars that differ. It also
  prints what was gained: shape points, bends, CCs, programs.
- `tools/recapture.mjs <album> [--all-of nes]`. It reads album.json's
  `nsf` block (vault path, per-track n/secs/track), fetches the rip from
  nsf-archive into a cache outside the repo, runs **the app's own capture**
  (import-set.mjs's harness, `--out /tmp/recapture/<album>`) with the
  album's recorded secs, then runs capture-diff on every song. FF1 instead
  goes through dump-all.mjs, whose paths are **stale**: it reads and writes
  `albums/final-fantasy-i/songs/`, but the album now lives under
  `albums/nes/`. Fix the paths and add an `--out` before anything else.
  Allowlist: `albums/{nes,game-boy,snes,ps1,ps2,n64}/<slug>/` with an
  `nsf` block. It refuses anything under compositions/, starters/ or
  nightroll/, and any .rollnotes.json.
- Replace policy. SAME and VELOCITY are replaced. ADDED-TRACK is replaced
  only for albums Josh opts in (Q2). MOVED is **never** replaced: the old
  file stays, and the song goes into open-items with its bars. The loop
  annotation the new capture would write must equal the existing `loop:`
  line, or the song counts as MOVED.

Provenance and safety:
- album.json gains, per track, `"cap": {"v": 2, "code": "<git short hash>"}`.
  The commit message names the album, the verdict counts, and what was
  gained. The old .mid stays in git history; the log lists each replaced
  file's previous blob hash, so `git show <hash>` restores it. Nothing is
  deleted; device drafts and local annotations are never touched.
- Regenerate .notes.txt (`dump_notes.mjs`) for replaced songs only.
- Order: P0 MIDI layer + playback (shipped, CI green) → NES v2 → FF1
  first (Shop) → the other NES albums → SNES → PS1 → PS2 → N64 → GB.
  **One album per push** (publish-incrementally). Overnight, a script runs
  the captures and diffs for the whole queue into /tmp and writes one
  report. The main session pushes album by album; subagents never push
  main.
- Hold re-capture of songs Josh has annotated in depth (FF1 ×8, Mega Man 2
  ×2, FF4 Cry in Sorrow ×2) behind the SAME verdict *and* his ear check.

What Josh must ear-check (each one, one pass):
1. Shop bars 25–28, pulse2 on an instrument voice: does the swell come
   through?
2. A Super Mario Bros 3 song: does a drum track appear, and does the
   console voice play it?
3. Mega Man 2 Flash Man on an instrument voice: is the vibrato there,
   with the same notes?
4. FF4 Main Theme on instrument voices: do notes decay, and is there
   echo/stereo?
5. FF7 Bombing Mission: pan moves, and the instrument changes within a
   channel.
6. One annotated FF1 song: every annotation is still on the same notes.

## 6. Do this first (ranked)

1. NES DMC in the console renderer. It needs no MIDI change and no
   re-capture, and it brings back drums in 6 albums.
2. P0 MIDI layer: parse/draft/write ownership + the whole-catalog
   round-trip test (also fixes last-pan-wins and the lost N64 programs).
3. In-note dynamics plan v1 (playback of shapes). It is the same work as
   step 2's aftertouch.
4. capture-diff.mjs + recapture.mjs (fix dump-all's paths, add `--out`).
5. NES capture v2 → re-capture FF1 → Josh's checks 1 and 6.
6. Remaining NES albums (DPCM tracks per Q2), one per push.
7. SNES v2 (envelope + pan + echo) + mono → stereo render.
8. PS1/PS2, N64, GB v2, in that order.

## 7. Questions for Josh (each has a default)

- **Q1.** Should a shape's levels be absolute or relative to velocity?
  *Default: relative* (the dynamics plan's lean), so a velocity drag
  still moves the whole note.
- **Q2.** NES DPCM hits are new notes. They go on a new last track, so no
  existing bar or track number moves. Add them to every NES album?
  *Default: yes, as a track named "dpcm".*
- **Q3.** On PS1/PS2/N64, slides are split today into one note per landed
  pitch. Should they stay split (bars and notes unchanged) or become one
  note with a bend? Merging changes the notes, so the gate would refuse it.
  *Default: keep the split. Add a bend only for vibrato and detune under
  a semitone.*
- **Q4.** For a song whose re-capture would move bars: keep the old file
  and list it, or re-capture and re-anchor your annotations by hand?
  *Default: keep the old file and list it.*
- **Q5.** Reverb/echo: carry it in the file now, and add the reverb bus to
  the synth later? *Default: yes, store CC91 in v2; playback is a
  follow-up.*
- **Q6.** Genesis: skip until you import a Genesis game? *Default: skip.*


## 8. Josh's answers (2026-10-06, Terminal #166)

1. DPCM first — yes (being built).
2. A DPCM/drum track only on albums whose games use it — not FF1 (the
   question was worded badly; this is what it meant).
3. A re-capture that would move bars on a song with published
   annotations: keep the old song AND add the new one; Josh moves his
   annotations over by hand, the old one is deleted later. He expects this
   to be rare (annotated: FF1, a Mega Man song, a couple of FF4 songs).
4. PS1/PS2/N64 slides stay as separate notes (he wants to see start and
   target pitch, and still hear the slide on the console voice).
5. Reverb/echo: store the send (CC91) in the files AND teach the synth a
   reverb bus so Hear the MIDI plays it (decided 2026-10-06 after #167;
   the question was confusing — no further ask).
6. Genesis: skip — but docs/adding-a-console.md updated now with the
   capture-v2 rules (done).
