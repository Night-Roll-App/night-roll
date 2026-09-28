# Adding a console to Night Roll — the whole checklist

What "a console is supported" means, learned from NES → Game Boy → SNES →
PS1 → N64 (2026-08 … 2026-09). Each step names where the existing
consoles did it. Genesis (VGM) is the next one: its capture exists
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
   test sets, publish one game per push.
8. **The listening pass.** Josh's ear on every song of 3+ games (the
   release gate in open-items). Ear reports are failing tests.
9. **Docs.** NIGHT-ROLL.md section, tools/<console>/INTEGRATION.md, help
   sheet + HELP.md + drift keyword, WEB-SESSION.md if analysis changes,
   open-items.
