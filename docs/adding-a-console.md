# Adding a console to Night Roll — the whole checklist

What "a console is supported" means, learned from NES → Game Boy → SNES →
PS1 → N64 (2026-08 … 2026-09). Each step names where the existing
consoles did it. Genesis (VGM) is the next one (still parked, Josh 2026-10-06): its capture exists
(tools/vgm/, CHIPS.vgm), everything after step 3 does not — PARKED by
Josh 2026-09-28; do Genesis first when a console is next added.

1. **Real rips first.** Get 3+ real sets (different drivers/years) before
   writing a hook (memory "real files before app hooks"). Keep them in
   /tmp/claude-501/rips/<console>, never in the repo; .gitignore the
   extensions.
2. **Ground truth.** Build a reference player on the Mac (scratch/usf2wav
   for N64, the PSF player for PS1) — every later claim is checked against
   its render: onsets, pitch, levels. Without it, ear reports can't be
   settled (the Dire Dire Docks week).
3. **Capture → notes.** A parser/emulator under tools/<console>/ that
   yields notes with ticks, tempo map, loop, per-channel identity; the
   driver/version detected FROM THE FILE (no per-game tables — CLAUDE.md);
   `CHIPS.<kind>` in index.html (magic, ext, perFile/libFile, parse/capture);
   the MIDI writer names tracks the renderer will match; warnings name what
   is not supported ("expansion sound chip …", "a driver Night Roll cannot
   read yet"). Real-rip tests guarded on the rip dir; synthetic tests.
   **What the .mid must carry (capture v2, docs/plans/2026-10-06-capture-
   fidelity-audit.md):** the console voice replays the rip, but the .mid is
   what the roll, the synth voices ("Hear the MIDI") and Josh's edits use,
   so a capture writes everything the driver does that can be written as
   standard MIDI:
   - loudness inside a held note — a per-note shape (poly aftertouch inside
     the note, docs/plans/2026-10-06-in-note-dynamics.md), not split notes;
   - slides as SEPARATE notes, start and target pitch both visible (Josh,
     2026-10-06: "I like that they show up as separate notes"), heard as a
     slide on the console voice; small vibrato/detune as pitch bend;
   - which instrument plays each note (program change), moving pan (CC10
     events, not one pan per track), channel volume (CC7), reverb/echo
     send (CC91) even before the synth plays it;
   - a sample/drum channel (NES DPCM and its equivalents) as its own last
     track — only on songs that use it, so no existing track number moves.
   Every one of these must survive Night Roll's own draft → publish path
   (parse → draft → write re-encodes every song; add a round-trip test over
   the console's whole catalog before importing).
   The NES is the first console on v2 (NIGHT-ROLL.md "NES capture v2"):
   per-note series kept relative to the note's start in the reconstructor
   (`bendSeries`, `dutySeries`, `volSeries`), thinned to corners by the
   writer; the sample channel's hits read AFTER the capture's timing is
   settled (`CHIPS.<kind>.hits`, called by captureChipTrack after t0, the
   loop scan and the tempo fit), so they can never move a bar; a drum track
   named so every kit test (`isKitTrackName`, `trackIsDrums`) knows it.
   The SNES is the second (NIGHT-ROLL.md "SNES capture v2"): the same
   relative series (`volSeries` = VOL × the DSP's own envelope, `bendSeries`,
   plus `panSeries`/`echoSeries` for CC10/CC91 and `srcn` for the program),
   carried through the app's frame rebin (`spcRebin`) and written by the
   shared `makeMidi` (`ccFromSeries`, `shape` options) — a new console reuses
   those writer fields rather than adding its own. Bends are measured from
   the note's own starting register value, never from an estimated root.
4. **Chip audio.** A renderer (tools/<console>/…-render.mjs) giving one
   buffer per track (stereo pair `{l, r}` when the hardware pans), the
   console's own samples/synthesis, envelopes, volume under held notes,
   pitch slides, vibrato, reverb — each from the driver/hardware docs,
   verified against the ground truth. `CHIPS.<kind>.run/render/renderRate/
   lead`, the worker runner in tools/chip-worker.mjs, the modules in
   tools/package.mjs RUNTIME_ENTRIES (the iPad build ships only those).
5. **Persistence + publish.** keepBytes (per-track files) and libs (a set's
   shared library) stored on the device and uploaded to the game files &
   instruments repo at publish (vault paths in album.json); console folder
   in CONSOLE_OF (albums/<console>/<game>/). Tap-to-hear: a `previewOne`
   path in the worker if the renderer can render one note.
6. **Instruments.** An extractor under tools/instruments/ (samples +
   regions + tuning + exact envelope, or synth presets for chips without
   samples), verified against the renderer, named; SF2/SFZ export follows.
7. **Terminal import.** tools/import-set.mjs handles the format; import the
   test sets, publish one game per push. Stamp the capture version on each
   album.json track. A later re-capture runs through the capture diff
   (SAME / VELOCITY / ADDED-TRACK / MOVED): a song whose bars move is never
   replaced in place — if it has published annotations, keep the old song
   and add the re-capture as a new one so Josh can move his annotations
   over (Josh, 2026-10-06). The tools: `tools/recapture.mjs --console <c>`
   dry-runs the whole console into /tmp/recap/ (report per song),
   `tools/capture-diff.mjs` is the per-song gate, and `--apply --album`
   lands one album; a new console's album.json `nsf` block must name every
   archive file its capture reads, or the re-capture cannot fetch it
   (NIGHT-ROLL.md "Re-capture").
8. **The listening pass.** Josh's ear on every song of 3+ games (the
   release gate in open-items). Ear reports are failing tests.
9. **Docs.** NIGHT-ROLL.md section, tools/<console>/INTEGRATION.md, help
   sheet + HELP.md + drift keyword, WEB-SESSION.md if analysis changes,
   open-items.
