# Original Xbox — plan

Follows docs/adding-a-console.md's shape, but the honest verdict (§1) is
that this console likely fails at step 1 for nearly the whole library:
original Xbox (2001–2005, not 360) game audio is overwhelmingly **streamed,
pre-authored audio**, not sequenced note data — the opposite situation from
every console this app has added so far (NES/Game Boy/SNES/PS1/N64 all
sequence notes from compact data; Genesis's VGM is a register log, one level
removed from notes but still note-shaped). This plan is short because the
honest research finding is short.

## 1. Verdict

Night Roll's whole premise is showing NOTES in a piano roll, extracted from
data that names pitches, onsets, and durations. Original Xbox game audio, as
far as this research could establish, is built almost entirely from
**XACT** (Microsoft's authoring/runtime middleware, first shipped for
original Xbox in 2002 as the "Xbox Audio Creation Tool" before becoming
cross-platform —
[Cross-platform Audio Creation Tool — Wikipedia](https://en.wikipedia.org/wiki/Cross-platform_Audio_Creation_Tool)),
whose wave banks (XWB) hold **whole pre-rendered audio clips** (PCM or Xbox
ADPCM), triggered as "cues" — not per-note sequences. There is no equivalent
here of PS1's SEQ, N64's USF sequence data, or even Genesis's register log:
the closest thing Xbox has to a "note" is "start playing this whole
pre-mixed clip now." **Verdict: out of scope as a general note-roll
console** for the overwhelming majority of the library — **but not
zero-exception**: a follow-up research pass (run in parallel with this one)
found a confirmed, named title that really does sequence its music —
**Oddworld: Munch's Oddysee** (original Xbox, 2001) ships **DirectMusic
Segment (.SGT) files with external DLS instrument banks**, a genuinely
note-shaped format (DirectMusic segments are MIDI-like: tracks of note
events playing through a Downloadable Sounds instrument bank), confirmed by
a ZenHAX community thread describing (partial) attempts to extract WAV data
from its SGT/DLS files ([ZenHAX, "Oddworld Munch's Oddysee (XBOX) extract
SGT/DLS"](https://zenhax.com/viewtopic.php?t=6977)) — not independently
re-verified against an actual extracted file in this pass, but a real,
named, checkable lead rather than a hypothetical. The only way to get
anything roll-shaped out of the REST of a typical Xbox soundtrack would be
audio transcription (detecting pitches from a rendered mix), which is
explicitly out of scope for this project.

Size: effectively zero sessions of *this app's* kind of work for the
general Xbox library, because there's nothing to parse into notes for the
common case. Oddworld: Munch's Oddysee is the one lead worth a small,
separately-scoped spike (a session or two just to confirm SGT/DLS actually
parses into real note data before promising more) — it would NOT set a
precedent for "Xbox support," just for that one game and any others built
on the same DirectMusic pipeline. If Josh wants Xbox music in Night Roll
more broadly, the honest options are (a) treat ripped XWB/WAV audio as an
audio *track* (this app already has an `audio-tracks` branch parked for
recordings-as-tracks, per open-items/NIGHT-ROLL.md) rather than a roll of
notes, or (b) scope a plan for Oddworld (and any DirectMusic siblings)
alone, per §3/§7.

Biggest risk: this verdict rests on general documentation of XACT/XWB and a
survey of what the rip community actually extracts (almost always audio,
never notes) rather than an exhaustive per-game audit — Oddworld shows a
real exception exists, so others may too, just not surfaced in this
research pass.

## 2. Rip formats that exist

- **XWB (Xbox Wave Bank)** — a container of waveform data (PCM or
  compressed); confirmed still-referenced by name for original Xbox
  specifically, e.g. Xbox ADPCM audio inside XWB files needing decode
  ([XentaxWiki, XACT XWB XSB XGS Audio](https://wiki.xentax.spektr.name/index.php/XACT_XWB_XSB_XGS_Audio);
  [fileinfo.com XWB](https://fileinfo.com/extension/xwb)).
- **XSB (Sound Bank)** — references cues/wave data; "XSB files do not
  contain audio data, but instead references wave data stored in .XWB
  files" ([fileinfobase.com XSB](https://fileinfobase.com/extension/xsb)) —
  i.e. XSB is playback *routing* (which clip, volume, pitch-shift-as-a-
  whole, looping), not a sequence of individual notes.
- **XGS (General Settings)** — global category/effect rules, not audio data.
- **XMA/XMA2** — this is a **360-era** codec; original Xbox did NOT use it.
  Original-Xbox wave banks are **Xbox ADPCM** (a 4-bit ADPCM variant
  specific to the original console) or plain PCM, confirmed by vgmstream's
  own format notes distinguishing `XBOX_ADPCM` (original Xbox, e.g. Silent
  Hill 4) from XMA1/XMA2 (X360 titles like Kameo, Table Tennis) — see
  [vgmstream FORMATS.md](https://github.com/vgmstream/vgmstream/blob/master/doc/FORMATS.md)
  and its [xwb.c source](https://github.com/vgmstream/vgmstream/blob/master/src/meta/xwb.c).
  WMA (Windows Media Audio) was also usable via the console's WMA hardware
  decode path, mainly documented for the dashboard's own custom-soundtrack
  ripping feature rather than in-game music
  ([xboxdevwiki.net/Soundtracks](https://xboxdevwiki.net/Soundtracks) — this
  page turned out to document only the user-facing "rip your own CDs"
  feature, not how games author their soundtracks; flagged as a research
  gap, §7).
- **No sequence/MIDI-shaped format was found in general Xbox documentation**
  — no equivalent turned up to PS1's SEQ, PS2's SQ, or a "tracker" format,
  in any Xbox-specific documentation surfaced by this research. The one
  exception found is game-specific, not a documented Xbox-wide format:
  **DirectMusic Segment (.SGT) + DLS instrument banks**, confirmed used by
  **Oddworld: Munch's Oddysee** (§1, §3) — this is a real Microsoft format
  (MIDI-like tracks over a downloadable-instrument bank), just not one any
  general Xbox audio write-up mentions, because so few games used it.

All of the above (XWB/XSB/XGS, Xbox ADPCM/PCM/WMA) is **streamed/
pre-rendered audio**: it gives an audio track, never notes, unless
transcribed — out of scope per this task's brief. DirectMusic SGT/DLS is
the one format found in this research that is NOT that — it's genuinely
note-shaped — but it appears to be rare on this console (§3).

## 3. Sound hardware / drivers

The **MCPX** (Xbox's south-bridge-style chip, an NVIDIA nForce-derived part)
contains a real **Audio Processing Unit (APU)** with a genuine
**256-voice hardware synthesizer** — "the Voice Processor, which can
synthesize 256 voices at 48 kHz" plus two DSP cores (a Global Processor for
voice/reverb/compression, an Encode Processor for real-time Dolby Digital
encoding) — this is not a trivial mixer-only chip
([Tom's Hardware, "APU: The First Audio 3D Chip In A Console"](https://www.tomshardware.com/reviews/xbox,421-7.html);
[xboxdevwiki.net/MCPX](https://xboxdevwiki.net/MCPX)). 64 of those voices can
be full 3D-positioned voices via DirectSound3D/Sensaura compatibility,
mixed down through 32 output channels
([Tom's Hardware, same article](https://www.tomshardware.com/reviews/xbox,421-7.html)).

This matters for the verdict in an important, nuanced way: **the hardware
itself is capable of real-time, per-voice sample synthesis — closer to a
wavetable sampler chip than a plain DAC** — but the *authoring pipeline*
almost every game used (DirectSound + XACT wave banks/cues) treats each
voice as "play this whole pre-authored clip," not "here is a note, a pitch,
a duration." The gap between Xbox and (say) PS1's SPU isn't really hardware
capability — it's that no widely-used content pipeline exposed the APU at
note granularity the way Sony's SEQ+VAB or Sega's driver-plus-YM2612 stack
did. **DirectMusic** (Microsoft's separate, older MIDI-like segment+DLS2
technology, part of the same DirectX family Xbox shipped) is the one
technology that *could* have produced real note-sequenced Xbox audio — it
existed, supported DLS2 downloadable-instrument playback, and was used by at
least one well-documented PC game (Shogo: Mobile Armor Division, 1998,
pre-dating Xbox —
[gamedeveloper.com, "DirectMusic For The Masses"](https://www.gamedeveloper.com/audio/directmusic-for-the-masses)) —
and IS confirmed used in production by one original Xbox game found in this
research: Oddworld: Munch's Oddysee (§1, §2). No other title was found using
it, but the search for others was not exhaustive.

## 4–9. Checklist / instruments / milestone / open questions

Deliberately not filled in step-by-step, the way Genesis's and PS2's plans
are, for the GENERAL Xbox library: **there is nothing to build a
capture→notes step around** for the overwhelming common case (streamed XWB
audio), so a checklist would be mostly "N/A" entries. Oddworld: Munch's
Oddysee (§1) is the one confirmed exception — if Josh wants to pursue it,
the checklist would look like a small, single-game version of PS1's shape
(DirectMusic SGT parsing ≈ a sequence reader like tools/psx/seq.mjs; DLS is
itself a sample-bank format structurally close to SF2/an existing
tools/instruments/ target) — but that's a follow-up spike to confirm SGT
actually contains per-note data before committing to steps 3–9, not
something to plan in full here.

What the checklist would look like if Xbox is ever revisited as "treat rips
as audio tracks" rather than "extract notes" (option (a) in §1) for the
REST of the library: reuse the parked `audio-tracks` branch
(recordings-as-tracks), skip capture→notes and chip-audio entirely, and the
"instrument" concept doesn't apply at all (there's no note-level instrument
to extract from a pre-mixed clip).

## Open questions for Josh

- **Is Oddworld: Munch's Oddysee (or another DirectMusic-based title)
  worth a small confirmation spike?** (§1) A ZenHAX thread describes
  attempts to pull WAV data out of its SGT/DLS files, which confirms the
  format exists in this game but not that a clean note extraction is easy —
  worth an hour or two to open one real SGT file and see what's actually in
  it before promising a plan. If Josh has other DirectMusic-era Xbox titles
  in mind (or knows of one by ear — "that sounds sequenced, not streamed"),
  naming it would let a future
  session verify it specifically rather than relying on this general
  finding.
- **Zophar's Domain does have an Xbox section**
  ([zophar.net/music/xbox](https://www.zophar.net/music/xbox), confirmed by
  fetch — titles include 4x4 EVO 2, The Warriors, Sonic Heroes, Half-Life 2,
  Crash Twinsanity) — but every indicator (XWB/WMA container formats, the
  rip community's own tooling being audio-extraction-only) points to these
  being ripped **audio**, not note data. Worth a quick spot-check of one
  file's actual format before fully closing this door, if you want that
  confirmed rather than inferred.
- If option (a) (treat Xbox rips as audio tracks, not a roll of notes) is
  ever wanted, is that worth doing at all given the app already has a
  parked `audio-tracks` branch for exactly this shape of feature — should
  Xbox just ride that branch's eventual work rather than get its own plan?
