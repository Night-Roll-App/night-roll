# Console loudness — diagnosis and fix plan (2026-10-07)

Josh, Terminal #183: "the midi sounds are a lot louder than the game sounds … All the games are too
quiet because I've always had to put the volume up to 200% in order to hear things very well."
Terminal #184: "we should just eliminate the volume slider for the global volume slider I don't
remember seeing it on logic … I just don't think it's a common thing on the iPad maybe I'm wrong".

Ear report = failing test. Both halves of the report are confirmed by measurement: the console voice is
13–22 LU below a normal listening level, and the synth ("Hear the MIDI") voice is 4–12 LU louder than
the console voice of the same song.

## 1. Where "200%" comes from

The 🔊 header button (`index.html:183`, `#volsl`, `min=10 max=200`) and the Mixer's master strip
(`src/ui/mixer.js:63`, same range) both set `S.masterVol` (device pref `ff1roll-mastervol`,
`src/ui/chrome.js:1803-1812`). It multiplies a fixed **`MASTER_VOL = 0.22`** (`src/audio/engine.js:14`),
so 100% is −13.2 dB and Josh's 200% is −7.2 dB. `MASTER_VOL` dates from the first Night Roll commit
(49be60f4, 2026-07-29): headroom for four synth squares at amplitude 0.5. Every source has been routed
through it since, including chip audio and recorded clips.

## 2. Every gain stage

The order a sound passes through:

| Stage | Where | Value |
|---|---|---|
| **Console renderers** (per channel, at render time) | | |
| NES APU | `tools/nsf/apu-render.mjs:246-248` (Nesdev mixer curves), `:328-336` (90 Hz HP / 14 kHz LP) | hardware scale: pulse 0…0.149, triangle 0…0.246; the whole chip's sum is about 1.0 peak-to-peak |
| Game Boy | `tools/gbs/apu-render.mjs:147-152` | DAC ±1 × `0.25·(L·NR50L + R·NR50R)/16`, so four channels at full scale sum to ±1 |
| SNES S-DSP | `tools/spc/apu-render.mjs:190-198` | 16-bit × VOL × MVOL, then L+R folded to mono `× 0.5/32768`. **No echo return** (already queued in open-items) |
| PS1/PS2 SPU | `tools/psx/spu-render.mjs:279`, `:214` | sample × ADSR × vol **× 0.5**, then a linear pan (127−p)/127, so a centred note gets 0.5 per side |
| N64 | `tools/n64/render.mjs:51` | `VOL_SCALE = 4.3498e-5` (adsr level → ~1/23000), equal-power pan |
| **App graph** (live: `src/audio/chip.js:383-394`, stream: `src/audio/chip-stream.js:246-247`) | | |
| Mono chip buffer → track `StereoPanner` | `src/audio/engine.js:58-62` | a mono input at pan 0 gives **0.707 per side (−3 dB)**; NES, GB and SNES buffers are mono, PS1 and N64 are stereo (passed through unchanged) |
| Track fader | `engine.js:54-67` `trackGain`/`trackVol`; UI `mixer.js:252` | 0–1.5, default 1 |
| Master | `engine.js:288-292`, `openMaster` `:48-53`, bounce `src/audio/bounce.js:143-144` | `MASTER_VOL (0.22) × S.masterVol (0.1–2.0)` |
| **Synth path** (`src/audio/voices.js`) | | |
| Velocity × voice amp | `voices.js:451`, `VOICE_AMP` `:110` | `v/127 × {square 0.5, triangle 0.9, …}`; oscillators are peak-normalised ±1 |
| CC7 × CC11 per note | `voices.js:312-345` (`ctlRoute`) | GM default is 100/127 when the file has CC7 |
| Drums | `engine.js:190-253` (`drumHit`) | `0.75·(0.3+0.7·vel/127)` × 0.5 or 0.62 |
| Soundfont samples | `voices.js:162` (`_norm`) | each sample loudness-matched to RMS 0.32 |
| Reverb return | `engine.js:77,94` | 0.5 |
| Recorded clips | `src/audio/clips.js:414-420` | unity, then **the same 0.22 master** |
| Album fade | `src/audio/transport.js:301-306` | ramps the master to 0 |

Nothing anywhere normalises loudness: there is no per-song gain, no limiter, and no measurement.

## 3. Measurements

Method: `/tmp/loudness/measure.mjs` (scratch, not in the repo).

- **Console voice:** the real renderer (`RUNNERS` from `tools/chip-worker.mjs`, the exact worker pipeline) on the cached rip in `/tmp/recap/rips/`. Each channel is mixed the way the app's graph mixes it (a mono buffer gets ×0.707 per side), trimmed at the capture's lead, × `MASTER_VOL`.
- **Synth voice:** a sample-level model of `playSynthVoice`'s default path built from the published `.mid`. It uses the same `VOICE_AMP`, velocity mapping, duty → wave choice, attack/release/`ve` decay, CC7/11, equal-power pan and noise drums, × `MASTER_VOL`.
- **Loudness:** ITU-R BS.1770 integrated (K-weighted, gated) LUFS, plus sample peak. Up to 60 s per song, at track fader 1 and master 100%.

**Reference:** commercial soundtrack releases and streaming playback sit around −14 LUFS (Spotify/YouTube normalise to −14, Apple Sound Check to −16), with peaks near −1…0 dBFS. **The target used below is −16 LUFS.** Chip music has a 11–15 dB crest factor (peak minus LUFS in the "raw" column), so −16 LUFS lands its peaks at about −1 to −4 dBFS without a limiter.

| Console | Song | Console raw (no master) LUFS / peak | **Console in app** LUFS / peak | Synth in app LUFS / peak | Synth − console | Console below −16 target |
|---|---|---|---|---|---|---|
| NES | FF1 Battle | −17.7 / −5.8 | **−30.9** / −18.9 | −23.4 / −12.4 | +7.5 | 14.9 |
| NES | FF1 Overworld | −18.0 / −6.4 | **−31.2** / −19.6 | −24.3 / −12.6 | +6.9 | 15.2 |
| NES | SMB3 track 10 | −20.0 / −4.7 | **−33.2** / −17.9 | −24.3 / −13.4 | +8.9 | 17.2 |
| NES | SMB3 track 11 | −18.7 / −6.4 | **−31.9** / −19.5 | −23.0 / −14.8 | +8.9 | 15.9 |
| Game Boy | Link's Awakening Overworld | −18.8 / −5.4 | **−31.9** / −18.5 | −26.0 / −14.3 | +5.9 | 15.9 |
| Game Boy | Link's Awakening Mabe Village | −22.1 / −5.6 | **−35.2** / −18.7 | −31.6 / −25.9 | +3.6 | 19.2 |
| SNES | FF6 Terra | −23.8 / −12.8 | **−36.9** / −25.9 | −26.8 / −17.0 | +10.1 | 20.9 |
| SNES | FF6 Battle Theme | −24.6 / −10.2 | **−37.8** / −23.4 | −25.6 / −13.6 | +12.2 | 21.8 |
| PS1 | FF7 You Can Hear the Cry of the Planet | −24.2 / −8.9 | **−37.3** / −22.1 | −27.5 / −13.4 | +9.8 | 21.3 |
| N64 | SM64 Slider | −15.9 / −3.3 | **−29.1** / −16.5 | −17.7 / −6.5 | +11.4 | 13.1 |

Read it like this:

- **The console voice in the app is 13–22 LU below a normal listening level.** At Josh's 200% (+6 dB) it is still 7–16 LU short, which matches "I've always had to put it to 200%".
- **The synth is louder than the console voice on every song:** NES +7–9, GB +4–6, SNES +10–12, PS1 +10, N64 +11 LU. That is the "MIDI is louder" half.
- **The largest single cause is the shared `MASTER_VOL = 0.22` (−13.2 dB)**, a headroom constant for the July synth that now applies to everything, Josh's recorded clips included.
- **Second cause: renderers keep hardware or headroom scale and nothing compensates.** The NES and GB renders peak −5 dB with nothing else applied. The SNES and PS1 renders sit a further 6–8 dB lower: SNES from the mono fold (×0.5) plus no echo return, PS1 from the ×0.5 headroom plus a linear centre pan (0.5 per side). Mono chip buffers then lose another 3 dB at the track panner.
- **Third cause: synth voice amplitudes were never calibrated against the console render.** `VOICE_AMP` square 0.5 is about 6× a real NES pulse at volume 15, and the synth plays squares for SNES/PS1/N64 instruments too.

Model limits, all small next to the gaps:

- The synth model leaves out the hat highpass (overstates hats slightly), the sustain pedal and voice/patch annotations; it assumes all-default voices.
- The SNES render has no echo, so a fixed renderer would read a few dB louder.
- 60 s or less per song.

## 4. Proposed fix

**No per-game tables.** Every gain is derived from the file being played, or from a chip's own full scale.

### A. One loudness model: measured per-song gain to a −16 LUFS target (ReplayGain / Sound Check style)

1. **Measure the console render's loudness once per song**, at capture time. `tools/recapture.mjs` / `tools/import-set.mjs` render the same pipeline. Store it as a fact next to `secs` in the album's track entry: `"cap": {..., "lufs": -24.2, "peak": -8.9}`.
   - Fallback when the entry has no measurement: measure in the app. Use the whole buffer for a non-stream render (`chipPublish` holds `pcm`), or the first chunk(s) for stream mode (`chip-stream.js`), and cache the result in memory only.
   - It is a measurement of the file, so it obeys "no one-time hacks": the next game on the engine is measured the same way.
2. **Song gain** `G = clamp(−16 − lufs, so that peak + G ≤ −1 dBFS)`. It goes on one new `S.songGain` node between the track panners and the master. It is a song-level node, so **track faders keep their exact meaning** (relative, 0–1.5, unity at 1), and solo/mute and the mixer meters are unchanged.
3. **Synth voice for a captured song: the same G, plus a per-chip synth-match constant** derived from the renderer's full scale, not from listening. One full-volume chip channel through that chip's renderer should have the same RMS as one full-velocity default synth voice.
   - Today's measured residuals (NES ≈ +8, GB ≈ +5, SNES ≈ +11, PS1 ≈ +10, N64 ≈ +11 LU) are what the constant must remove.
   - The per-song spread within a console is about 2 LU, so a constant is good enough.
   - Better, if the spread proves audible: also measure the synth render's loudness at capture time (the `.mid` is known then; an offline render as in §3) and store `"synthLufs"`. Then **"Hear the MIDI" switches at equal loudness, as an A/B should.**
4. **Songs with no capture** (compositions, imported `.mid`): one synth calibration constant that puts a typical 3–4-voice synth song near −16 LUFS. On the §3 numbers that means replacing the 0.22 with about 0.22 × 10^(8/20) ≈ 0.55 after the voice-amp calibration; verify on scratch songs only, never Josh's files.
5. **Clips play at unity** through the song gain, as in every DAW. A take is not attenuated by 13 dB.
6. **Safety net:** a master `DynamicsCompressorNode` set as a limiter (threshold −1 dB, ratio 20, attack 1 ms, release 100 ms). The peak cap in step 2 already prevents overs on measured songs. The limiter only catches stacked fader boosts and un-measured paths. It must not pump at normal levels: verify by ear.
7. **Bounce/export** (`bounce.js:143`) uses the same `songGain`, so exports match playback.

Why not the alternatives:

- **A fixed per-chip constant alone** ("the chip's full scale = 0 dBFS") fixes NES/GB scale but leaves songs 6+ LU apart. Real game mixes sit well below their chip's full scale (FF6's battle theme peaks at −10 dB on the raw render).
- **Live auto-gain / compression** changes the music's dynamics. That would be editing Josh's evidence.

**Ear check before it ships:** FF1 Battle, Terra, Cry of the Planet and SM64 Slider at master 100%, console vs "Hear the MIDI" back to back, on the iPad speaker and on headphones. Pass = no level jump on the toggle, and no reach for the volume slider. This is a playback change, so the "smoke before push" and device-test rules apply.

### B. The global volume control (Terminal #184)

What other apps do, checked against Apple's own guides. One correction: Logic does have a master volume.

- **Logic Pro for Mac:** a Master Volume slider is an *optional* control-bar item (Customize Control Bar → Modes and Functions; Option-click resets it to 0 dB). The mixer has the Master channel strip, a global gain over all outputs.
- **Logic Pro for iPad:** a Master channel strip in the Mixer that "changes the gain of all output channel strips without affecting their relative levels". It corresponds to a Master Volume slider in the control bar, and a double-tap resets it to 0 dB.
- **GarageBand for iPad:** a Master Volume slider "lets you change the overall volume of the song" and *is also controlled by the iPad's hardware volume buttons*.
- **Ableton, Reaper and others:** a master-track fader with a 0 dB default.

The common pattern: content plays at its own level (unity), the master control defaults to 0 dB as a mixing tool, and the listening volume is the device's hardware volume. None of them needs a permanent boost to be heard. Night Roll needs 200% only because of `MASTER_VOL` 0.22 and the lack of normalisation.

**After fix A, the header 🔊 button has nothing left to compensate for.** Removing it loses nothing:

- Listening level → the iPad's volume buttons, like GarageBand.
- Balancing → the track faders.
- Overall mix trim → the Mixer's master strip (Logic's pattern), which can stay at a 0 dB default.

The choice is Josh's:

1. Remove the header button and keep the Mixer master strip, defaulting to 100% (= 0 dB).
2. Remove both.
3. Keep both.

**Migration either way:** his devices store `ff1roll-mastervol = 2`. When fix A ships, that stored value must be reset (or ignored) once. Otherwise the new levels get +6 dB more on top and the limiter works constantly.

## 5. Follow-ups this surfaced (not part of A)

- **SNES echo return** (already queued in open-items): FF6 is drier and quieter than the hardware. Song gain covers the level, not the space.
- **PS1 linear centre pan, 0.5 per side** (`spu-render.mjs:214`): the PSX SPU's volume registers are per side. Check against real SPU behaviour whether a centred voice should be 0.5 or about 0.707/1.0 per side; that is a renderer fidelity question.
- **Soundfont / game-instrument voices** have their own normalisation (`_norm` → RMS 0.32). They need the same song-gain path and a check against the target.
