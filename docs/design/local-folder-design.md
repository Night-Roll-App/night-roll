# Local folder mode — saving without GitHub

Status: SHIPPED 2026-09-15 on main (Josh: deploy it now, test on his Mac).
Technical reference lives in NIGHT-ROLL.md "Local folder mode"; this doc
is the design record. Split out of `wave-tracks-design.md`.

## Why

- Josh's son has no GitHub account and is not going to enjoy getting
  one. Josh: "having to set people up with GitHub kind of sucks."
- GitHub can remove content on a rights holder's notice (DMCA). A
  recording that is not yours must never be uploaded; it needs a
  durable home that is not GitHub.
- Device storage inside the browser is not that home: Safari can evict
  it after a week without a visit, and the user cannot see it.

The son uses Chrome on a MacBook Pro, the one platform where a browser
can write real files: the File System Access API
(`showDirectoryPicker`). Safari and the iPad cannot.

## Shape

A fourth KIND of Data location: **"a folder on this computer."** The
Data-locations sheet today has three rows, each a read base URL and a
GitHub write repo; folder mode replaces both with one directory
handle. Songs, analysis, and audio all live in that folder. Nothing
about tokens, repos, commits, or Pages reaches the user.

- **Pick once.** Settings → "Save to a folder on this computer…" opens
  the Chrome picker. The handle is stored in IndexedDB (handles are
  structured-cloneable). On reload the app checks the permission; if
  Chrome asks again, one "Reconnect folder" button (it must be a user
  gesture). Chrome 122+ can remember the grant across visits when the
  user ticks "allow on every visit"; installed as a PWA it persists.
- **Layout mirrors the repo exactly:** `albums/<album>/<song>.mid`,
  `<song>.rollnotes.json`, `<song>.notes.txt`, `<song>.audio/<file>`.
  The folder IS a repo without git. If he ever wants GitHub, `git
  init` in that folder and push; if he never does, the files are his.
  Josh can also drop the folder's albums into the real repo by hand.
- **Catalog by scan, not manifest.** In folder mode the song picker is
  built by walking the folder for `*.mid` (`album.json` still supplies
  titles and order when present). No `manifest.json` to go stale.
- **Save = write files.** One Save writes the .mid, the .rollnotes.json,
  the .notes.txt, and any new audio files, in place, with overwrite.
  No commit, no build, no CDN lag, so the cross-device freshness check
  and the "committed" bookkeeping simply do not run in this mode.
  Tombstones still apply unchanged (the folder copy would resurrect a
  deleted annotation exactly as the repo copy would).
- **Drafts stay as they are** (localStorage between Saves), so undo,
  Revert to saved copy, and the "unsaved dot" keep their meaning.
  Autosave-on-every-edit is cheap in this mode (silent writes are
  allowed once granted) and is Josh's call — it would make Revert
  meaningless, which is why v1 keeps explicit Save.
- **Audio bytes chain becomes:** this device's IndexedDB (until
  Saved) → the folder → the audio repo. For a folder user the last
  link never fires.

## Code shape

Every read already funnels through `songsURL()`, `analysisURL()`,
`nsfURL()` and every write through a handful of PUT helpers plus
`batchCommit`. Folder mode is a backend behind those seams:
`readSongFile(path)`, `readAnalysisFile(path)`, `writeFiles([{path,
bytes|text}])`, `listSongs()`. The GitHub backend is the existing code;
the folder backend is `getDirectoryHandle` / `getFileHandle` /
`createWritable`. Nothing above the seam changes.

Testable without the native picker: `navigator.storage.getDirectory()`
(the Origin Private File System) returns the same
`FileSystemDirectoryHandle` interface, so the whole folder backend
runs in Playwright's Chromium against OPFS. The vm suite gets a fake
directory handle.

## What it does not do

- Safari / iPad: not available. Fallback for those is a downloadable
  project bundle and an Import that reads it back — not needed for
  either current user (Josh has GitHub, his son has Chrome), so it is
  v1.5, not v1.
- Shareable links: a `?song=` link into someone's local folder means
  nothing on another machine. In folder mode the link button says so.
- Sync between two people: there is none. Son's folder → zip → Josh,
  or Josh imports a song. The layout match is what keeps that trivial.

## What this changes in the audio design

- In `wave-tracks-design.md`: the dedicated audio repo stays Josh's
  default; for the son the audio repo never exists; the bytes chain is
  device → folder → audio repo.
- Build order: this lands first, on its own branch (`local-folder`),
  deployed to the preview repo the same way (audio doc §12). Useful
  for MIDI-only songs on its own, so it stands without audio.

## Shipping notes

- Help sheet entry (Settings → folder), HELP.md rebuild, drift keyword
  `folder on this computer`.
- NIGHT-ROLL.md: a "Storage backends" section — the seam, the two
  backends, the OPFS test trick.
- CLAUDE.md "Annotations + the .mid are the only real state": the
  folder is a repo without git, so the rule reads the same; the
  reframing proposed in the audio doc §10 covers both.
- README: Night Roll saves to GitHub or to a folder on your computer.
- open-items.md: iPad/Safari bundle fallback queued as v1.5.

## Open for Josh

1. Explicit Save (parity with today) vs autosave-on-edit in folder
   mode. v1 proposes explicit Save.
2. Does the folder also become the READ source for FF1 songs and
   analysis, or only for compositions? Proposal: the folder is a
   complete data location (songs + analysis + audio) so a folder user
   never sees the repo at all; the FF1 corpus can be copied in once.


