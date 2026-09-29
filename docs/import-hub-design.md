# Import hub: design (2026-09-29)

Josh: "I still hate the file import line. It lists all the extensions.
Maybe we make file import have its own dialog and then it can tell you how
or what you need to import for each system that we support. Plus,
obviously, just importing MIDI itself. And maybe we need to support
importing waves to create a new song from just a wave file."

Drafted by one advisor, fact-checked against the code by a second.
Josh accepted the recommended defaults.

## File menu

Replace the `<label class="fitem" for="fileinput">Import… (.mid / .nsf / …)</label>`
line in `#filesheet` with `<button class="fitem" id="fileimporthub">Import…</button>`,
which opens `#importhub` (`.overlay` > `.sheet`, like `#jobssheet`). Keep
`<input id="fileinput">`, its accept list and its comment verbatim. The
`application/octet-stream` entry is why iOS Files lets every extension be
picked, and the byte-sniff in `openPickedFiles` stays the real gate.

One shared input: every section's "Choose files…" calls
`fileinput.click()`. A `data-kind` on the button changes only the status
wording. Files picked in the "wrong" section fall through to the
existing sniff and route correctly.

## `#importhub`: one scroll, help-sheet dl/dt/dd rhythm, in this order

1. **MIDI**: .mid/.midi/.smf/.kar/.rmi → a song (Keep local or Create
   album, as today).
2. **NES**: the .nsf, plus its .m3u if the rip has one (track names).
   Not supported, with the exact refusal the app gives: expansion-chip
   games (VRC6, VRC7, FDS, MMC5, Namco 163, Sunsoft 5B): "expansion sound
   chip <names> not supported".
3. **Game Boy**: the .gbs, plus its .m3u.
4. **Super NES**: every .spc of the album, picked together.
5. **Genesis**: .vgm/.vgz. Synth voices only (no console-audio render yet).
6. **PlayStation**: every .minipsf plus the one .psflib, picked together.
   Reads Sony's standard driver (SEQ/VAB) and Square's AKAO (Final
   Fantasy VII/VIII/IX, Chrono Cross); both play the console's own audio.
7. **PlayStation 2**: every .minipsf2/.psf2 plus the one .psf2lib.
   Reads Sony's standard driver (SQ/HD/BD) and Square Enix's BGM/WD
   (Final Fantasy X); both play the console's own audio. Streamed-audio
   rips (Ico, XIII) are refused: "this is streamed audio, not note data —
   Night Roll reads sequence data (notes), not pre-rendered streams".
8. **Nintendo 64**: the .miniusf files plus the one .usflib.
9. **SoundFont**: one .sf2; its presets become track voices, not tied to
   a song.
10. **New song from a recording**: one .wav/.mp3/.m4a/.aif/.flac → a new
    song.

Also say in the NES/Game Boy sections: a playlist (.m3u) picked on its
own, later, names an open song's album. And that captures run in the
background (⏳ jobs), so the capture window can be closed.

Section titles use `FOLDER_NAMES`: NES, Super NES, Game Boy, Nintendo 64,
PlayStation, PlayStation 2, Genesis.

## New song from a recording

`createComposition(120, 4, 4)`, then `importAudioFiles([{name, bytes, type}])`
with `audioReplaceTi = null`. The song is `Untitled N` until Save, 4/4, at
120 BPM; Josh taps ♩ Tempo from this take afterwards. Its length comes
from the clip (`computeSongEnd`'s audio-track branch). `createComposition`
seeds three empty note tracks, which stay (he writes notes into them).
Status: "new song — Edit → Pencil to write notes against the recording.
It lives on this device until Save."

## Drop target

No drag-and-drop exists today. `dragover`/`drop` on `#importhub` only,
feeding the dropped files to `openPickedFiles` (its comment already
anticipates a drop).

## Unchanged

The capture panel (`#importsheet`) and jobs. The hub hands off and gets
out of the way.

## Cleanups that ride along

- Delete `CHIPS.psf2`'s dead `if (song.kind === "bgm-unimplemented") throw …`
  (ps2Song never returns that kind now).
- Help sheet: the File entry's import paragraph shrinks; a new
  `<dt>Import…</dt>` covers all ten kinds. Remove the two outdated claims
  in the current help text (PS2's Square Enix driver "identified but not
  supported yet", and the "Square Enix's PS2 driver excepted — synth
  voices" caveat). "Super Nintendo" in help text and the FEATURES list
  becomes "Super NES".

## Phasing: three commits, each browser-verified

1. The hub, the File-menu button, the help text.
2. The drop target.
3. New song from a recording.

Tests: vm string-match tests for the hub's sections and the refusal
strings; a recording-song test using the audio-track fakes; drift keyword
"New song from a recording".
