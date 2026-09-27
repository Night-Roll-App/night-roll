# Song organization — a proposal (advisor, 2026-09-27)

For Josh. Nothing here is built. Every point has an example; claims
about today cite index.html lines (as of 85f48ad) or a doc section.
You decide; I propose.

## 1. The mess, as I understand it

Two questions got tangled into one list: **where a song is** (this
device, GitHub, Files) and **what kind it is** (yours, a rip, a
starter). "Night Roll Sketches" is a repo folder
(`albums/compositions/nightroll/`, L11826) used as a stage marker;
"Night Roll drafts" is a device thing shown like an album (L8853);
imports land in drafts too (L10526, L12405). So Ambush is in Sketches
AND drafts, Threnody in My Compositions, Threnody 2 in Sketches, and
Chrono Trigger sits in drafts until "Commit", a word that means
nothing without GitHub. The Open list is flat (`renderSongGroups`,
L8846), so every game is one more top-level row. Is that it?

## 2. The model — yours, with one amendment

Your words: *"regular folders … unnamed until you save it … you pick
what folder it goes into and you give it a name … published … is like
in a separate place"* and *"nothing special about drafts or sketches
or my compositions. Those should just be folders that you create on
your own, and you can publish them if you want to."*

Five sentences: **Local is folders you make, on this device (in the
iPad app they are real folders in Files → Night Roll). A new song is
Untitled until Save, which asks folder + name. Publish copies a local
song, or a whole folder, to GitHub at the same folder path. Edit the
local copy again and its row says "changed since publish" until you
republish; published copies are read-only. Import puts a folder into
Local, ready to publish.**

The amendment: *"maybe you can't modify published versions … then you
can save it locally."* For songs you own, don't make that a step. On
the Mac you open Ambush from PUBLISHED (the iPad's local copy isn't
there); your first pencil stroke should silently create the Mac's
local copy in the same folder — which is exactly what today's draft
does (L11826 comment). Ask only when a local copy already exists and
differs ("Open your local copy, or replace it with the published
one?"), or when the song isn't yours (starters, rips, a link): that is
Save As, which stays.

What today's pieces become: the localStorage draft **is** the local
copy; Local Save (L11937) becomes the real Save (a file in
Files/folder; a checkpoint where no folder exists — Safari on the
web); folder mode (NIGHT-ROLL.md "Local folder mode") is already
"Local as real files"; the repo is Published; `local/` keys (L10559)
become a folder you pick at Save; starters are Published in the bundle.

Worked examples:

- **New song → published.** File → New (tempo/meter only): "Untitled
  2" under LOCAL. ⌘S: folder [Graveyard stuff ▾ · New folder…], name
  [Ambush 3] → Files → Night Roll/graveyard-stuff/ambush-3.mid.
  Publish → `albums/graveyard-stuff/ambush-3.mid` in the repo (the
  manifest gains the folder; `manifestPlace` already creates albums,
  L11876). Edit → *changed since publish* → Publish.
- **Chrono Trigger → published.** Import the .spc set; the importer
  proposes folder [SNES/Chrono Trigger] (from the chip kind, `CHIPS`
  L12708) — one tap. Audition, rename, ✕ duds. **Publish folder** →
  one commit (`commitImports`, L13346) to
  `albums/snes/chrono-trigger/`; it appears under PUBLISHED.
- **No GitHub.** LOCAL is Files; PUBLISHED shows only the bundled
  Starters. Save As on the Bach starter makes their own local song.
  Publish reads "Connect GitHub to publish". No token, commit or repo
  is ever mentioned.

## 3. The folder structure on GitHub: mirror it

Your words: *"do you want the same folder structure … or maybe you
just want to mirror it how you have it locally. I'm not sure."*

**One answer: mirror. The local folder tree IS the repo tree,
`albums/<folder>/…/<song>.mid`, any depth.** Reasons: (1) annotations
are keyed by path (CLAUDE.md), so a song must have ONE path in both
places — choosing a different destination at publish time would give
every song two keys and force an "origin" link that rename and Move
would have to maintain; (2) it is already how folder mode works
(local-folder-design.md "Layout mirrors the repo exactly … the folder
IS a repo without git"); (3) a published folder and a local folder
then mean the same thing, so "changed since publish" is one
comparison per path (`savedStamp`/`lastsync`, as today). Ambush:
local `albums/graveyard-stuff/ambush.mid` ↔ published
`albums/graveyard-stuff/ambush.mid`. Chrono Trigger: local
`albums/snes/chrono-trigger/` ↔ the same 89 paths in the repo.

Console groups are then **parent folders, not a field**: NES/Mega Man
2 is `albums/nes/mega-man-2/`. No `group` field, no manifest field;
Open nests by path.

What the app enforces:

- **Path-safe names.** Folder and file names go through `slugify`
  (L11888); the name you typed is the display title in that folder's
  album.json (`title`, `songs` overrides — the mechanism `renameRepoTitle`
  uses, L12544). Unique within a folder, case-insensitive (Files and
  Pages both fold case).
- **One path everywhere.** Move = the path changes on this device AND
  in the repo AND in every other device's keys (today's `moveComposition`,
  L13635, plus the boot `MOVED` remap, L2934). Rename of a
  never-published song renames the file; rename of a published song
  keeps the filename and sets the title (today's rule; links and
  analysis docs point at filenames).
- **The manifest** stays the published index (Pages cannot list a
  directory): `tools/build_manifest.mjs` walks any depth instead of one
  sub-level (L35); the app derives the tree from the song paths it
  already carries, so old manifests still work. Local: the folder
  scan (`folderScanAlbums`, L16815) or the draft keys.

## 4. Existing albums under "just folders"

There are no built-in albums or stages. Every current album is
already an ordinary folder; each becomes one as-is, and moves are
yours (yes per move):

- `final-fantasy-i/` — as-is (its `songs/` sub-folder stays a scanner
  rule, L20; analysis/ and reference/ untouched).
- `compositions/` ("My Compositions") — as-is. Your three Logic
  exports (CM6-G7b9, cool-b-maj-with-b-part, threnody) get
  `"locked": [...]` in album.json: Save As only, never `writeMidi`.
- `compositions/nightroll/` ("Night Roll Sketches") — an ordinary
  nested folder. Keep, rename, or merge its 14 songs up into
  compositions/ (section 7). `NR_DIR` (L11826) stops being special:
  New and Save As write wherever Save says.
- `imports/chrono-trigger/`, `mega-man-2/`, `tmnt-2/`,
  `final-fantasy-legend/` — ordinary folders under "imports"; move to
  `snes/`, `nes/`, `nes/`, `game-boy/` when you say so. The NSF vault
  path in album.json is independent of the folder, so chip audio
  survives a move.
- `starters/` — an ordinary folder, read-only in the bundle.

Words: sections **LOCAL** / **PUBLISHED**; rows *not published* ·
*published* · *changed since publish* · *annotations changed here*;
menu **New song · Save · Publish… · Move to… · Rename… · Import…**.
"Commit", "Night Roll drafts" and "Sketches" all disappear.

## 5. Open, and the sharp edges

```
OPEN
LOCAL · this iPad
  Graveyard stuff (3) ›        Ambush · published
  My Compositions (14) ›       Ambush 3 · not published
  SNES › Chrono Trigger (89) · not published
  Untitled 2 · never saved
PUBLISHED · joshcough/night-roll
  My Compositions (17) ›   Starters (4) ›   Final Fantasy I (19) ›
  imports › Mega Man 2 (24) ›  TMNT 2 (24) ›  Final Fantasy Legend (17) ›
```

Tapping a published song with a local copy opens the **local** copy
(the row says so); the compare bar (L13566) plays the published one.
The iPad app already reads repo + bundled starters (`initCatalog`,
L1886–1913); a shared link (`?songs=`, L1819) shows only that repo's
PUBLISHED, read-only.

- **Same name, two folders:** different paths, fine. Same folder:
  "Replace Ambush?" — your *"overwrite that one"*.
- **Rename after publish:** title only (above); a filename change is a
  Move, which republishes and remaps keys. No second copy is possible.
- **Two devices, one song:** local copies are per device; publish
  from both and the last wins — no merge, ever. Keep the "newer
  published copy" check on open (`loadSongInner`) and ask once: keep
  mine / take the published one.
- **Untitled and a crash:** the working copy needs a key from the
  first edit; "Untitled N" is the key and Save renames every per-song
  key (the `renameLocal` loop, L13648).
- **Annotating FF1:** an annotations-only local copy — which is
  today's `ff1roll-notes-` stash. Nothing changes but the row word.

## 6. The Files checkbox and the Commit button

Today the box is either/or (L16903–16906; open-items "OPEN DESIGN
QUESTION"). Under your model **Files IS Local**: the app edition's Save
always writes there; Publish goes to GitHub when connected. The box
goes away; Settings says "Your songs are kept in Files → On My iPad →
Night Roll. Publish sends them to GitHub." Desktop folder mode stays
for the son. The import button: **Publish folder** with GitHub; **Save
folder to Files** with a folder library (`commitImports`'
`folderActive()` branch); otherwise **Connect GitHub to publish**,
disabled — the folder is fully usable under LOCAL.

## 7. Migration — order, size, the key cost

Moving a folder costs one `MOVED` entry per song (every device's
draft/notes/edits/ts/tombs/lastsync keys ride along at boot, L2934),
a `git mv` of .mid/.rollnotes.json/.notes.txt/.md/.ask.md (a pure
move, the mirror tree), a manifest rebuild, and old links kept alive by
the same table in `songPathFromURL` (L1834). Mechanical, but every
device must load the new build once, and a device that publishes
before it does so resurrects the old path. So: few moves, batched.

1. **Words** (small): Commit → Publish; drafts list gone from Open.
2. **Save names the song; folders; mirror publish** (two days, risky):
   Untitled keys; the Save sheet (folder + name, last folder
   preselected); Publish per song or per folder; the scanner and
   `build_manifest` walk any depth. No repo moves.
3. **Open as LOCAL / PUBLISHED, nested** (a day): `renderSongGroups`,
   `fsubAlbums` (L12291); help sheet, HELP.md, drift keyword,
   NIGHT-ROLL.md.
4. **iPad: Save writes Files, checkbox removed** (a day; test with
   `createApp({edition: "app"})`).
5. **Your moves, one batch** (risky, last, yes per song): the 14
   nightroll/ songs (ambush, ambush-2…, carnival, cool-bmaj-progression,
   fanfare, graveyard, graveyard-2, graveyard-3, KeyChangeTest-07-26,
   majorly-dim, night-black, running-with-the-runs, sus, threnody-2)
   up into compositions/ — and imports/* under console folders if you
   want them there. ~170 MOVED entries in one table, one commit.

## 8. Rejected

- **Choose a destination at publish time**: two paths per song, an
  origin link to maintain, and rename/Move get a second failure mode.
- **A `group` field instead of parent folders** (my first draft):
  cheaper, but a second grouping idea beside folders — your "just
  folders" is simpler.
- **Editing published copies in place** (today, compositions): two
  devices silently fight over one file; local-then-publish makes it
  visible.

## 9. Questions only you can answer

1. First edit of a published song you own: silent local copy (my
   amendment) or ask first (your words)? *Default: silent; ask only
   when a differing local copy exists.*
2. Mirror the local tree on GitHub? *Default: yes.*
3. Console folders as parents (`nes/mega-man-2`)? Move the four
   imports now, or leave `imports/`? *Default: parents; move now, one
   batch.*
4. Merge nightroll/ into compositions/, or keep it as your folder?
   *Default: merge, in the same batch.*
5. iPad: Save always writes Files, no checkbox? *Default: yes.*
6. Should Save also publish? *Default: no — one deliberate tap.*
7. Keep the three Logic exports locked? *Default: yes.*
8. The strays in nightroll/ (test.rollnotes.json,
   test-chord-inserts.rollnotes.json, cool-b-maj-with-b-part.md)?
   *Default: ask you per file.*
