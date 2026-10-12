# Night Roll mascots

Josh's picks (Terminal #283–#285, 2026-10-08):

- **The mascot:** #6 in `sprites.json`, the wizard with the note-topped staff. He is the app icon and the
  mark beside NIGHT // ROLL (`tools/brand/make-icons.mjs` draws both from the sprite).
- **His name:** **Nocturno** ("Maybe Nocturno", #285; "For now yes", #286). He was "Maestro" on the
  sketch pages (`mascots.html`, `maestro-poses.*` keep that name as the record of what Josh saw).
- **His companion:** #20 Echo, the bat. Not used in the app yet (ideas: splash, loading, about).
- **High potential:** #1 Ember and #3 Vesper.

Files:
- `sprites.json`: the 20 original sketches as data (24×24 rows plus a palette).
- `sheet.png`: their contact sheet.
- `mascots.html`: the page Josh picked from.
- `maestro-poses.json` / `.png` / `.html`: 10 poses of the wizard with notes, plus the name ideas.

App icons for the native suite (Josh, 2026-10-12; candidates in `app-icons.json` / `app-icons.html`):
- **Night Roll Guitar:** G6, Nocturno with a red electric superstrat (pointy RG-style headstock) where his staff stood ("G6 is killer"). He asked for an electric: "the juxtaposition makes it funny."
- **Night Roll Tuner:** T1, Echo above a tuning fork ("I kind of like T1"; T3 and T4 "are cool" — kept).
- `tools/brand/app-icon-ios.mjs <id> <AppIcon.appiconset dir>` writes the 1024 px icon into an app.
