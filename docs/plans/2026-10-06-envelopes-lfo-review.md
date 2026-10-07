# Envelopes, LFOs and patches: second opinion (advisor, 2026-10-06)

Josh's question, from his son's world: is it a severe gap for composing
that Night Roll has no instrument-level envelope or oscillator (ADSR,
filter envelope, LFO vibrato or tremolo, mod wheel)? And did the first
advisor (docs/plans/2026-10-06-in-note-dynamics.md, "per-note shape") miss
that approach? This review is independent. Nothing was edited except this
file.

Short answer: the first plan isn't wrong. It answers a different question
(how to make *this one note* swell). Instrument-level shaping is a second
layer that every DAW and every chip tracker also has. Night Roll already
has part of it, but only for *borrowed* instruments, and none of it can be
edited. The two layers multiply together, so they don't conflict, as long
as one rule about captures is written down (§3).

## 1. The two layers, in plain words

**Layer A: the instrument (the "patch").** A patch is a saved recipe for a
sound: which wave, plus rules that run *by themselves on every note*. You
set it once per track. Every note obeys it without being drawn.
- **ADSR amplitude envelope.** Attack is how fast the note gets loud.
  Decay is how fast it falls to the Sustain level. Release is how long it
  rings after the key lifts. Example: a "pluck" patch is A=5 ms, D=300 ms,
  S=0, R=50 ms. Every note you write, whether 1 beat or 4, starts sharp and
  dies away on its own.
- **Filter envelope.** The same four stages, but they move brightness
  instead of loudness. Example: a brass patch opens bright on the attack,
  then mellows.
- **LFO (low-frequency oscillator).** A slow wobble (around 3 to 8 times a
  second) attached to something. Wobbling pitch is vibrato. Wobbling volume
  is tremolo. Wobbling brightness is a "wah". It often has a *delay* or
  *fade-in*, so long notes bloom into vibrato and short notes stay straight.
- **Velocity routing.** "Harder = brighter", not only louder.
- **Mod wheel (CC1) routing.** The patch decides what the wheel does.
  Classically, the wheel turns the vibrato depth up.

**Layer B: performance data (what you draw on the notes or the track).**
- **Velocity**: one number per note, at the attack (Night Roll has this).
- **CC curves over time** for the whole track. CC1 is mod wheel (whatever
  the patch wires it to). CC11 is expression (swells, riding on top of the
  CC7 fader).
- **Per-note curves** (MPE, poly aftertouch, Bitwig/Cubase note
  expression): a curve that lives inside one note. This is the first
  plan's option (b).

The split, in one line: **the patch says how notes of this sound normally
behave; performance data says what this particular moment does
differently.**

How each tool divides the two:
- **Logic.** The patch is the synth (ES2, Alchemy, Sampler). ES2 has a
  modulation router: 10 routings that connect sources (envelopes, two LFOs,
  mod wheel, velocity) to targets (pitch, filter, level). LFO1 restarts on
  every key and has its own fade-in envelope. Its standard mapping is mod
  wheel → LFO2 depth → pitch, which gives vibrato. Performance lives in the
  piano roll: velocity plus MIDI Draw lanes for CC1/CC11.
  [Apple: ES2 LFOs](https://support.apple.com/en-mn/guide/logicpro/lgsi619bb15b/mac),
  [Apple: ES1/ES2 modulation routing](https://support.apple.com/guide/logicpro/modulation-routing-in-es1-and-es2-lgsife419b4e/mac),
  [Logic 9 manual: ES2 modulation](https://help.apple.com/logicpro/mac/9.1.6/en/logicpro/instruments/chapter_5_section_7.html)
- **Ableton.** Wavetable has an amp envelope, two modulation envelopes,
  two LFOs, and a matrix where velocity, note pitch, pitch bend,
  aftertouch, mod wheel and MPE Slide can drive any knob. Operator is
  similar. Performance lives in clip envelopes (per track over time) and
  MPE note-expression lanes (per note).
  [Ableton instrument reference](https://www.ableton.com/en/manual/live-instrument-reference/),
  [Attack: Wavetable routings](https://www.attackmagazine.com/technique/tutorials/10-common-modulation-routings-using-abletons-wavetable/)
- **FL Studio.** Each channel's Envelope/Instrument tab has ADSR-style
  envelopes (plus delay, hold, amount) and LFOs for volume, pan, cutoff,
  resonance and pitch. You choose per LFO whether it restarts on every note
  or runs freely. Performance lives in piano-roll per-note properties and
  automation clips.
  [Image-Line: Envelope/Instrument settings](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/chansettings_ins.htm)
- **Chip trackers (FamiTracker, Furnace).** The instrument *is* a set of
  per-frame lists ("macros" or "sequences") that every note restarts. For
  the NES chip these are: **volume** (an envelope), **arpeggio** (semitone
  offsets per frame, which is how one channel fakes a chord), **pitch** and
  **hi-pitch** (fine and coarse bends, which is how drums drop and how
  vibrato is built), and **duty** (timbre changes over the note). The
  pattern's effect columns (vibrato 4xy, volume column) are layer B.
  [FamiTracker wiki: instruments](http://famitracker.com/wiki/index.php?title=Instruments),
  [Furnace instrument docs](https://github.com/tildearrow/furnace/blob/master/doc/4-instrument/README.md)
- **The MIDI standard.** CC1 is "modulation", by tradition vibrato depth,
  but the receiving patch decides what it does. CC11 is expression, a
  percentage of CC7.
  [modwheel.net: what CC1 controls](https://modwheel.net/guides/what-is-a-mod-wheel),
  [Motifkit CC explainer](https://motifkit.com/midi-cc/)

## 2. Is it a severe gap? What Night Roll has, and what Josh can't do

**What already exists (layer A, read-only):**
- **Game instruments** ("game:" voices, NIGHT-ROLL.md "Game instrument
  libraries"). These are real envelopes measured from the captures. The
  format, in tools/instruments/model.mjs, is `{attack, decay, sustain,
  release, points, repeat, releaseCurve}`. NES/GB instruments
  (tools/instruments/nes.mjs) are clustered by the *shape of the volume
  curve, normalised so onset = 1*. That is already the "patch vs
  performance" split: the decay shape belongs to the instrument, the
  loudness at the start belongs to the note. So Josh can put FF1's own
  decaying pulse on a track of his song today.
- **SoundFont presets** ("sf2:" voices). Their ADSR is parsed in
  tools/instruments/sf2.mjs `buildEnvelope`.
- **FluidR3 sampled voices.** The natural envelope (piano decay, the bow's
  attack) is recorded into the sample.
- **The hidden "strings" synth patch.** voices.js ~L270 has a slow attack,
  a lowpass filter, and an LFO vibrato that fades in after 0.35 s. It still
  works, but it's no longer in the menu.

**What is missing:** an instrument Josh can *make or change*. The menu's
"NES / waves" voices (voices.js ~L307) are a fixed 8 ms attack, a flat
hold and a short release: an organ gate. Concretely, today he cannot:
1. **Put vibrato on a lead.** Write a held pulse melody and it is dead
   straight. Every chip lead with a "singing" quality, and most
   flute/violin-style lines, has delayed vibrato. The audit counts real
   use: Punch-Out!! has 466 vibrato notes and Mega Man 2 has 155 in their
   first 30 s.
2. **Give a pulse his own decay.** He can't pick "pulse 25% that plucks
   and dies in a quarter beat". He can borrow FF1's, but not change it.
3. **Write an arpeggio macro.** A one-channel "chord shimmer" (0, +4, +7
   semitones cycling every frame) has to be written as dozens of 32nd
   notes, and each one re-attacks.
4. **Make a pitch-drop drum or a "pew" laser,** or a duty sweep (the
   "wah" a pulse gets when the duty changes while the note holds).
5. **Make a filter sweep or pad bloom** on his own synth voices. This is
   less important for chip style, more important for "other songs".

**Severity, by goal:**
- *Studying game music*: **not severe.** By default a capture plays its
  console voice, which replays every register write, so the vibrato,
  macros and swells are already audible. The bigger study gaps are in the
  capture audit (DPCM drums never seen or heard, vibrato and duty changes
  missing from the .mid).
- *Writing chip-style songs on the iPad*: **moderate, and the most
  noticeable.** Vibrato and the volume and arpeggio macros *are* the chip
  idiom. Without them his own NES-style songs sound like an organ, however
  good the notes are. Borrowed game instruments soften this but can't be
  edited.
- *Writing other songs*: **mild.** The sampled voices carry natural
  envelopes. Filter and LFO design is a synth-sound-design hobby (his son's
  world) more than a composing need.

## 3. Conflict or complement?

**They complement each other.** One formula covers everything:

    heard level(t) = velocity × instrument envelope(t since note-on)
                     × note shape(t)  [first plan, optional]
                     × track expression(t)  [CC11, later]

Shop shows the difference. The swell in bars 25 to 28 happens on four
notes, then the part goes back to flat. That is *performance*, so it
belongs in the note shape, and the first plan is right for it. If every
pulse2 note in the whole song swelled the same way, the right home would be
a patch with that volume macro, and you would write it once, not 400 times.
The capture can't know which of the two the composer did, but the
instrument extractor already guesses well: it clusters repeated curves into
instruments.

**The one real collision: double-counting a capture's decay.** A captured
note keeps its absolute level series (`ve` today, the full shape in v1). If
that track is then played on its *own* extracted game instrument, whose
envelope is that same decay, the note fades twice. Today this can't happen,
because `ve` is applied only on the synth-oscillator path (voices.js L318),
not on game/sf2/sample voices. **Recommendation: keep that rule for v1 and
write it in NIGHT-ROLL.md.** "A note's shape is applied on voices whose
instrument envelope is flat (the waves). On a voice with its own envelope,
it is ignored for captured notes." Later, the capture can store shapes
*relative to the matched instrument's curve* (curve ÷ instrument envelope),
and then both apply everywhere.

**Where an instrument definition would live.** It is song state, so it
goes in annotations, not localStorage (CLAUDE.md hard rule). Add a `patch:`
directive next to `track:`, and the track points at it:

    patch: lead wave=square25 env=0.005,0.25,0.6,0.08 vib=5.5,0.3,0.25
    patch: shimmer wave=square12 arp=0,4,7 step=1f
    track: tr1 voice=patch:lead

The fields: `env` is A, D, S, R (seconds and a 0..1 level). `vib` is rate
in Hz, depth in semitones, and delay in seconds. Chip-style lists are
per-frame (`f` = 1/60 s): `vol=15,13,11,9,8` for volume, `arp=` for
arpeggio, `pitch=` for cents per frame, `duty=` for duty steps. Each list
takes `|` to mark where its loop starts, following FamiTracker. The volume
list is the same thing as model.mjs's `Envelope.points` plus `repeat`, so
use that format internally: tools/instruments/play.mjs already knows how
to play points, repeat and release. Built-in presets live in code (like
SF_VOICES). Picking a preset copies its line into the song, so a song
never depends on a device's library. "Save as patch" from a game
instrument (it copies the envelope points) gives Josh a way to start from
FF1's sound and change it.

**Voice menu with few taps.** Add a new family, "Chip patches", with about
six presets: *pluck*, *lead + vibrato*, *soft pad*, *arp major*,
*arp minor*, *drum drop*. The wording is Josh's call (propose 2 to 3
options). One tap assigns a preset. A second tap on the chosen patch opens
a small sheet with four ADSR sliders drawn as one line, plus a vibrato row
(rate, depth, delay). This follows the existing pattern of tapping the
selected voice chip again to pick. The arp, pitch and duty lists get a
plain text field at first (`0,4,7`). A drawing UI for them comes later.

**CC1 mod wheel.** It's useful only once there is a patch to route it to.
A later step: the patch's `vib` depth is multiplied by CC1/127 when the
track has CC1 data, which today rides through `raw` unplayed. Don't build
it first.

**Should the per-note shapes still ship as v1?** Yes, with two small
changes:
1. **Make levels relative** (a multiplier on velocity). This answers the
   plan's open question 2. It is also what lets the shape multiply cleanly
   with an instrument envelope.
2. **Keep "shape applies only on flat-envelope voices for captured notes"**
   (above) and put it in a test. Otherwise a FF1 track on a FF1 game
   instrument starts fading twice the first time someone tries it.

## 4. Recommendation

1. **Finish per-note shape v1 as planned**, with the two changes above.
   It's already in progress, it fixes Shop, and it is layer B.
2. **Next workstream: patches v1** (small, M). The `patch:` annotation,
   with `wave`, `env` (ADSR) and `vib` (delayed vibrato) only, played on
   the synth-oscillator path in voices.js, with bounce inheriting it. Add
   six presets in the voice menu, the ADSR/vibrato sheet, an Ask
   `set_voice … patch` form, then help, drift keyword and NIGHT-ROLL. This
   closes gap 1 and gap 2, which are the ones he'd hear in every chip song.
3. **Patches v2**: chip macros (`vol` / `arp` / `pitch` / `duty` lists,
   reusing the model.mjs envelope format) and "Save as patch" from a game
   instrument. Closes gaps 3 and 4.
4. **Later, only if asked**: filter envelope, LFO→filter/tremolo, CC1 and
   CC11 lanes, and capture shapes stored relative to the instrument.

**What to tell Josh (three sentences):** Synths shape sound in two layers.
The *patch* says what every note does by itself (attack and decay,
vibrato, arpeggio macros), and *performance data* (velocity, mod wheel,
per-note curves) says what this note or moment does differently. Night
Roll has the performance layer and is adding per-note shapes now. It can
*borrow* real game instruments with their envelopes, but it can't yet let
you build or tweak a patch, so your own chip songs can't have vibrato or
arpeggio macros. That isn't a gap for studying (the console voice already
plays all of it), but it is the most noticeable gap for writing chip-style
music, and a small "patch" feature (ADSR plus delayed vibrato, then chip
macros) fits beside the per-note shapes without changing them.
