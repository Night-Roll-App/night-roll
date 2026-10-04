# Audio ("wave") tracks — design proposal

Status: BUILT 2026-09-15 on branch `audio-tracks` per the revised design
below (advisor review appended in full at the bottom). Technical
reference: NIGHT-ROLL.md "Audio tracks". Josh's son: "I
wouldn't use it unless it supported waves." This is the design for
that, written before code so Josh can rule on it.

"Waves" here means an audio file — a guitar take, a vocal, a phone
recording, a DAW bounce — sitting in the song as a track next to the
MIDI voices: it plays in time with them, mutes, solos, has a fader and
a color, loops with the song, and shows a waveform in the tracks view.

## 0. One-paragraph shape

An audio track is an ordinary empty track in the .mid whose `audio:`
annotation gives it a clip: a file (any format the browser decodes:
wav, aiff, mp3, m4a) anchored at a bar.beat with a start offset in
seconds. The placement is a normal synced annotation, derived onto the
track at `finalizeNotes` the way voice/color already are; the bytes
are song material that live in a `.audio/` sidecar directory and go up
with Save. Playback is one AudioBufferSourceNode per pass riding the
existing event scheduler — what chip audio already does for NSF
captures, so mute/solo/fader/speed/album-play/export come free. The
tracks view draws peaks; the roll gets a thin span strip; the score
shows nothing.

## 1. What already exists that this stands on

- **Chip audio** (`chip`, `chipStart`): a decoded AudioBuffer per named
  track, started at `playT0` with an offset, `playbackRate = playRate`,
  routed through `trackGain(ti)`, stopped in `stop()`, cut at
  `albumEndAbs`.
- **Sampled instruments** (`sfDecode`): lazy `decodeAudioData`, the
  RAM lesson (a full decode costs ~60MB per instrument on the iPad).
- **NSF bytes in IndexedDB** (`idbOpen`, store `nsf`): "big binary that
  belongs to this device until committed."
- **batchCommit**: blobs → tree → commit, accepts `b64` files. Today it
  serves imports only; Save is three Contents-API PUTs (see §6).
- **Data locations**: songs / analysis / NSF rows, each with a read base
  and a write repo. Audio gets a fourth row.
- **Tracks view** (`laneGeom`, `drawTracks`, `hitTracksNote`,
  `tracksGhost`): lanes, headers with M/S/fader, ghost-drag time slide.
- **`track:` directive**: voice/color/vol by track NAME, derived at
  `finalizeNotes`, last-wins dedupe on read. The `audio:` directive is
  the same mechanism with different fields.
- **Tombstones**: a deleted synced annotation stays deleted.

## 2. Data model

### 2.1 The track lives in the .mid

An audio track is a named track with zero notes in the .mid, exactly
what ＋ creates today. `writeMidi` already emits empty tracks (a new
composition has three). Cost: Logic shows one empty track named
"guitar". Benefit: every consumer of `song.tracks` — `trackState`,
`rawNotes`, chips, M/S, fader, rename, delete, undo, Save As, Move
to…, drafts — sees the track from `setSong` on, with no async creation
and no duplicate-lane risk when a draft and the annotation both
describe it.

`tr.kind = "audio"` is DERIVED at `finalizeNotes` from the `audio:`
annotation by name, and cleared when the annotation is gone, exactly
as voice/color/vol are at index.html:2385-2394. An annotation with no
matching track is ignored like a stray `track:`; a track whose
annotation was deleted degrades to an ordinary empty lane.

### 2.2 In memory

```js
song.tracks[ti] = {
  name: "guitar", notes: [],       // the .mid's part
  kind: "audio",                   // derived from the audio: annotation
  color, vol,                      // via track: directive, as today
  clip: {
    file: "guitar-take-2.m4a",     // slug, unique in the song's .audio/
    at: tick,                      // song tick where file second `offset` sounds
    offset: 0.0,                   // seconds into the file that land on `at`
    dur: 151.3,                    // seconds (derived from the decode)
    buffer: AudioBuffer|null,      // decoded MONO, this song only
    peaks: Float32Array|null,      // min/max per 256 samples (derived)
    where: "device" | "repo" | "missing" | "decoding" | "ready",
  }
};
```

### 2.3 The annotation

Text form (canonical — every type round-trips through text; it is not
legacy): `audio: guitar file=guitar-take-2.m4a offset=0.0`
JSON: `{"at":[5,1],"type":"audio","track":"guitar","file":"guitar-take-2.m4a","offset":0}`

- `at` = bar.beat anchor. Bar.beat, not seconds: edit the tempo and the
  clip's START rides the grid while its body does not stretch (the
  DAW convention; the help text says so).
- The kv grammar is `\w+=\S+`, so file names are slugified at import
  (`guitar take 2.m4a` → `guitar-take-2.m4a`).
- `gain` is NOT here — `vol=` on the `track:` directive is the fader.
- Read-side dedupe: last-wins per track name, the `trackdir` rule.
- **Moving a clip changes its identity** (`noteIdentity` is the note's
  JSON), so a move tombstones the old annotation and adds the new one,
  or the repo copy resurrects beside it on next load. Delete tombstones.
- Rename track → rewrite `track` in the annotation, the 7942 path.
- Add `audio` to the three hand-maintained directive filters (2618,
  3837, 8413) or it shows as prose in the subtitle and notes list.

### 2.4 The bytes

Checked in this order:

1. **This device's IndexedDB**, store `audio`, key `<songKey>|<file>`
   → `{bytes, mime}`. Written at import, BEFORE decode (Safari's
   `decodeAudioData` detaches the input buffer). `navigator.storage.
   persist()` requested on first write: Safari evicts script-writable
   storage after 7 days without a visit, and until Save this is the
   son's only copy. The lane badges "on this device only" until the
   bytes are in a repo.
2. **The audio repo** at `albums/<album>/<song>.audio/<file>`, fetched
   via the audio Data-locations row. A 404 is never cached (Pages CDN
   lags ~10 min after a Save; the `albumMetaCache` lesson).

A clip whose bytes resolve nowhere draws hatched with the file name
and "audio missing on this device" and plays silence. The song opens.

`.audio/` is a directory so a track can grow to several clips. The
manifest builder scans `*.mid` only and ignores it.

### 2.5 Drafts

`saveDraft` stores no bytes and no clip: the track is already in the
draft as an empty named track, and the clip comes from the annotation
(local notes). IDB keys ride along in `moveComposition`'s
`renameLocal` (today it moves localStorage only).

## 3. Playback

Clips are scheduler events. Units matter: `tickToSec` already divides
by `playRate`, so event `sec`/`dur` are WALL seconds and buffer
offsets are BUFFER seconds.

- `buildSchedule` pushes per clip:
  `{sec: tickToSec(at) - offset/playRate, dur: clip.dur/playRate, ti, clip, n: {ch: 0}}`.
  The stub `n` exists because both chase loops filter on `e.n.ch` and
  `scheduleNote` reads `n._preview`; a clip event without it throws.
- `scheduleNote` dispatches AFTER the transport-stopped guard:
  `e.clip` → `scheduleClip(ti, clip, when, durSec)`. It computes the
  buffer offset from the ACTUAL start time (scheduleNote bumps `when`
  to now+3ms and the pump admits events up to 50ms late; for a clip
  that is drift, for a note it is nothing):
  `offset = clip.dur - durSec*playRate + (actualWhen - when)*playRate`,
  `start(actualWhen, offset)`, `stop(actualWhen + durSec)`.
- One gain node per pass with 5ms ramps in and out: a pass boundary
  cuts the outgoing node mid-waveform and starts the next mid-waveform.
  Real click, cheap fix.
- **Pass-end clamp at the call sites** (6500, 6509), not a new
  `scheduleNote` argument: `dur = min(dur, passEndAbs - abs)` where
  `passEndAbs` is `loopSeg.end - playOffset` for pass 0 and
  `passAbs + segLen` after. Today a MIDI note straddling the loop end
  rings past it; a 3-minute clip would play the whole song past it.
  Also clamp to `albumEndAbs` — the pump stops event STARTS there but a
  clip started earlier would play through the fade into the next song.
- **Clips chase even while cycling.** Both chase loops are off under
  cycle (Josh's phantom-chord ruling, 6462/6497). A clip anchored at
  bar 1 under a cycle over bars 9–12 would be silent. Clips are the
  track, not a tail: a separate clip-chase runs regardless of cycle.
- `stop()` stops every node in `audioSrcs` (today only chip nodes are
  stopped; MIDI nodes die on their own after the gains disconnect at
  400ms — a 3-minute clip would keep rendering into a disconnected
  gain). `onended` prunes the list so it doesn't grow one node per pass.
- `albumLeave` restarts in place only `if (chipActive())`; extend to
  "or any clip." `albumPlayIdx` awaits `chip.renderPromise` with a 15s
  cap; await clip decode the same way, or every audio song's first
  pass in an album run is silent.
- `computeSongEnd` is notes-only. Fold in the clip's end, converted
  with the NATIVE tempo map (not `tickToSec`, which carries playRate),
  or an audio-only song loops one bar and the fitted view cuts the clip.
- Speed slider: tape-style. At 50% a guitar drops an octave. The LCD
  adds "audio: pitch follows." Time-stretch is a library; not v1.
- Download audio (MediaRecorder off `master`): free, once songEnd
  includes the clip. Download .mid: the empty track goes out as-is.
- Mute/solo/fader: `trackGain`. Count-in: `playT0` shift. Metronome:
  own gain. Nothing to do.

`kind` guards needed: `voiceType` (last track = triangle — an appended
audio track would demote the bass voice of every unannotated
composition), `trackIsDrums` (name regex: `drums-di.wav` would become a
drum lane), `drBassTrack` (`/bass|tri/` on name), the retrack guard at
4761 and `moveSelectionToTrack` (notes must never land in an audio
lane), `buildScoreModel` (compositions keep empty tracks → phantom
stave).

Decode: at song load once bytes resolve, off the transport's path;
the callback form `sfDecode` uses. Downmix to mono INSIDE the decode
callback and drop the stereo buffer there (peak RAM for a 3-min WAV is
otherwise ~30 compressed + 63 stereo + 32 mono MB). Peaks computed in
the same callback, once.

## 4. Display

### 4.1 Tracks view (the home)

- Lane body: per pixel column, the min/max of the peak buckets it
  covers, a vertical line in the track color at 0.7 alpha; 1px clip
  edges; empty outside the clip. Selected clip: gold outline.
- Header: unchanged (dot, name, M/S, fader, vol%); "∿" after the name.
- Hit test: `hitTracksNote`, then `hitTracksClip`. Two hook points,
  not one: pointerdown's hold-to-grab (4554) and the tap path (5025).
- Tap = select (setInfo: name · length · starts at bar.beat · offset ·
  where the bytes are). **Second tap plays from the clip start** (the
  chip's second-tap idiom).
- Drag: hold-to-grab a selected clip and slide in time via
  `tracksGhost.dT`; `dLane` ignored for clips. Same 16th snap as notes.
  Undo: one entry; commit tombstones the old annotation (§2.3).
- Lasso: a box overlapping the clip's span selects it; a time-slide
  moves notes and clips together.

### 4.2 Piano roll: a dumb strip

A 24px strip under the ruler drawing each clip's SPAN as a bar in its
track color, name inside. No waveform. Josh edits notes in the roll
and hears a guitar; without this he sees nothing and asks "where is
it?" An afternoon. A real docked waveform lane is §8.

### 4.3 Score: no staff for `kind === "audio"`.

### 4.4 Chip in the track bar: same chip; second tap opens the clip
sheet (§5.3) instead of instrument families.

## 5. UX

### 5.1 Two doors (menu/row parity)

- **File → Import…**: the byte-sniff grows an "audio" branch (RIFF/
  WAVE, FORM/AIFF, `ID3`/MPEG sync, `ftyp`, `fLaC`) confirmed by a
  decode. `#fileinput`'s accept list stays as it is (no accept summons
  the photo library on iOS).
- **＋∿ chip** on compositions, next to ＋ and ＋🥁, with its OWN
  `<input accept="audio/*">` — on iOS that opens Files. Voice Memos
  need Share → Save to Files first; the help says so. One tap for the
  son.

Lands in the OPEN song if editable: a new empty track named from the
file slug, clip at the cursor's bar, setInfo says where. Locked
capture → the existing "Save As first" sheet. Multi-select = one track
per file.

### 5.2 Size gate at import (RAM is paid now, not at Save)

Over 20MB: an in-app sheet with the size and three buttons —
**"Store as 16-bit mono WAV"** (trivial JS, lossless for a mono
source, halves a stereo DAW bounce to ~16MB) / "Import as-is" /
"Cancel". No transcoder to m4a in v1 (browsers can't encode AAC/MP3
without a bundled library).

### 5.3 Clip sheet

- File name, length, format, size; where the bytes are.
- **Starts at** bar.beat; **offset** with ±10ms / ±100ms / ±1 beat /
  ±1 bar buttons; and **"Align first sound to the anchor"** (onset
  threshold on the peaks trims leading silence — one tap instead of
  thirty for a late count-in).
- Caveat line for m4a/mp3: Safari and Chrome trim AAC priming
  differently, so the same file can start 20–50ms apart across
  browsers; millisecond alignment is honest only for WAV/AIFF.
- **Replace file…**, color picker, fader, ✕ Delete track (tap twice).

### 5.4 Save

The sheet lists the audio files it will upload with sizes. Already-
committed files are detected by computing the git blob sha client-side
(SHA-1 of `"blob <len>\0" + bytes`) and comparing with the tree — no
`committed` flag to drift across devices.

## 6. Storage and repos

- **Dedicated public audio repo from day one** (e.g.
  `joshcough/nightroll-audio`), the NSF-archive shape: raw-fetchable
  without a token, so reading needs zero setup. Why not the app repo:
  every push runs Playwright with a checkout that downloads every HEAD
  blob; every Pages build copies the tree (1GB cap); every clone pays;
  ten WAV takes equal the whole soundfont library. The fourth
  Data-locations row exists either way; its default is the new repo.
  Cost: two commits per Save, a token granted to both repos.
- **Save migrates to `batchCommit`.** Today `commitCompositionNow` is
  three Contents-API PUTs (.mid, .rollnotes.json, .notes.txt) plus the
  manifest — three or four commits and Pages builds per Save. Worth
  fixing regardless; with audio it would be five. Hoist blob uploads
  out of batchCommit's 409 retry so a 30MB blob never rides through it
  twice.
- Save As / Move to… within one repo can re-point tree entries at the
  existing blob sha (correct for the Git Data API) — but those flows
  use the Contents API today and must move to trees too. Across repos,
  re-upload.
- Blob API: base64 JSON up to 100MB, no binary door. A 30MB WAV is a
  40MB string in a Safari tab holding a decode — survivable, the reason
  the size gate bites.
- Orphans (replaced/deleted clips) stay in the repo in v1.
- **Git LFS is ruled out**: Pages and raw serve pointer files.

| Item | Size |
|---|---|
| 3 min, 44.1k, 16-bit stereo WAV | 31.8 MB |
| same, mono | 15.9 MB |
| same take as m4a @192k | 4.3 MB |
| decoded float32 stereo | 63.5 MB |
| decoded mono | 31.7 MB |
| GitHub blob API max | 100 MB |
| Pages site max | 1 GB |
| this repo's .git today | 137 MB (85 MB soundfonts) |

## 7. iOS notes

- `decodeAudioData` resamples to the context rate (48k on iPads) —
  fine. Safe formats: wav, aiff, caf, mp3, aac-m4a, alac. FLAC needs a
  test. ogg/opus/webm: no — including the app's own Download-audio
  output from Chrome.
- A buffer source does not hold the audio session in the background;
  only a media element does (the August stall). No regression, no
  promise of lock-screen play.
- Older A-series iPads have far lower jetsam ceilings than M-series;
  the 20MB gate is for RAM as much as for git.

## 8. Explicitly not v1

- Mic recording (getUserMedia with echoCancellation/noiseSuppression/
  autoGainControl OFF, `outputLatency` compensation Safari reports
  poorly, playback bleed without headphones). Needs everything v1
  builds; the clip model is source-agnostic on purpose.
- Clip looping (a 4-bar riff repeating — per-pass events make it N
  events; the first v1.5), trim handles, split, multiple clips per
  track, fades.
- Time-stretch. Docked waveform lane in the roll. Vendored encoder.
  Orphan cleanup.

## 9. Tests

vm suite: `audio` annotation text ⇄ JSON identity; `kind` derived and
cleared at `finalizeNotes`; `buildSchedule` event `sec`/`dur` with
offset at playRate 1 and 2; `scheduleClip` offset math and pass-end
clamp (FakeCtx gains `createBufferSource` recording start/stop args,
and `decodeAudioData` must return a buffer with `numberOfChannels` and
two channels — both fakes, `tests/harness.mjs:93` and `:114`); the
`kind` guards (`voiceType`, `trackIsDrums`, `drBassTrack`, retrack);
`computeSongEnd` with a long clip; move tombstones the old annotation;
score model has no staff; peaks of a synthetic ramp. Drift keyword
`audio track`.

Playwright (CI only): import a 1s fixture wav, lane draws pixels in
the track color, play creates a buffer source, reload persists from
IDB, cycle over a later range still sounds the clip.

## 10. Rule framing (advisor's, replaces the enumeration)

"The repo copy of a song is complete. A song's state is the files that
travel with it through Save, Save As, Move, and Revert — today the
.mid, the .rollnotes.json, and any song-owned sidecars (`.audio/`). A
device holds drafts, never the only copy; anything held only on a
device must say so on screen." Josh's rule, so Josh's edit to approve.

Doc sweep owed on ship: NIGHT-ROLL.md (section, spec, code map),
WEB-SESSION.md + `dump_notes.mjs` (notes.txt header lists audio tracks
by name and span so an analysis session knows a voice exists it cannot
see), README, help sheet + HELP.md + drift keyword, open-items.md.

## 11. Decisions for Josh

1. **Two questions for your son before code:** (a) files, or a record
   button? If record, v1's bridge is Voice Memos → Files → ＋∿.
   (b) Does he have write access and a token, and on which device?
   Without a token nothing he does can Save; the storage half is inert
   for him and IDB eviction becomes the whole story.
2. Dedicated public audio repo as the default (advisor: yes, day one).
3. Save migrates to one batchCommit (advisor: do it regardless).
4. The rule framing in §10.
5. Mono downmix at decode — acceptable loss for v1?
6. Roll: the dumb span strip (advisor: yes) vs nothing.

## 12. Branch and preview deploy (Josh's rule, 2026-09-15)

The work lives on branch `audio-tracks`, never merged to `main` until
it has proven itself; it must still be deployable so his son can use
it. Pages here serves `main` directly (no workflow), so a second
branch has no URL of its own in this repo. Options weighed:

- **Subpath preview in this repo** (switch Pages to an Actions deploy
  that assembles `main` at `/` and the branch at `/preview/audio/`):
  every fetch is relative so it would work, BUT same origin = the
  preview shares localStorage and IndexedDB with the real site — the
  exact drafts, token, and prefs a buggy branch could corrupt. It also
  changes how `main` deploys. Rejected.
- **Netlify/Cloudflare branch previews**: a new account and service.
  Rejected for now.
- **A second repo with its own Pages site** — `joshcough/night-roll-
  preview`, Pages from its `main`, URL `joshcough.github.io/night-roll-
  preview/`. Separate origin, so separate storage: bugs stay in the
  sandbox. Deploy = one push:

      git push preview audio-tracks:main

  (`preview` = the second repo as a remote.) Recommended.

Data locations on the preview site: reads default to "this site", i.e.
the branch's own copy of `albums/`; writes default to the app repo
(`songsRepo` is hardcoded to it at index.html:13129). Two choices for
Josh: leave writes on `night-roll` (one corpus, Saves from the preview
land in the real repo, git makes any damage revertible, the hard rule
"test on scratch compositions" applies) or point the preview device's
Data locations at `night-roll-preview` for total isolation. Audio
bytes go to the dedicated audio repo either way (§6).

CI: add `audio-tracks` to `tests.yml`'s push branches so the branch
gets the full suite (the `paths-ignore` stays). Rebase the branch on
`main` before each preview push so his son gets Josh's latest songs.

## 13. Local folder mode — its own project, done FIRST

Josh's ruling (2026-09-15): saving without GitHub is a separate
project and comes before audio tracks, because GitHub can remove
content on a rights holder's notice and his son has no account anyway.
Design moved to `local-folder-design.md`. What it means here: audio
tracks assume the folder backend exists, the audio bytes chain is
device → folder → audio repo, and for the son the audio repo never
exists.

## 14. Hard rule: other people's recordings never go to GitHub

Same rule as `*.nsf` (ROM music is never committed). GitHub honors DMCA
takedowns: content is removed, the repo can be disabled, repeat
notices can suspend the account, and a public Pages URL is
distribution, not storage. So:

- Your own takes and your son's takes may go to the audio repo.
- A band's track dropped in to learn from or play along with stays
  local: the folder on his Mac, or device storage on the iPad. Never
  Save-to-GitHub.
- Enforcement, the cheap way: the clip sheet has a toggle "someone
  else's recording" that blocks upload for that clip (Save lists it as
  "kept local") and keeps the device-only badge on the lane. Default
  off; the import sheet asks once per file.

---

# Appendix — advisor review (2026-09-15, verbatim)

Read against index.html @ b62628b. Verdict up front: **ship with changes — the playback half is close, the data-model half needs a different anchor, and the storage section misdescribes today's Save path.** Ranked list in §I.

## A. Playback vs. the scheduler as written

**(1) Clip as a schedEvents entry — not as proposed.**
- Both chase loops filter with `e.n.ch === 9 || trackIsDrums(e.ti)` (`index.html:6462`, `:6499`), and `scheduleNote` reads `n._preview`, `n.ch`, `n.duty`, `n.v` (`:6084`, `:6096`, `:6103`). A `{sec, dur, ti, clip}` event with no `n` throws in the first chase loop before it reaches any dispatch. Either give clip events a stub `n: {ch: 0}` or dispatch on `e.clip` *before* the filter at the two call sites.
- **Cycle does NOT "work the same way."** Both chase loops are disabled while cycling (`cycling ? false : …` at `:6462` and `:6497`, Josh's phantom-chord ruling). A clip anchored at bar 1 under a cycle over bars 9–12 is silent for the whole cycle. Clips need a chase that bypasses that guard — they are the track, not a tail.
- **Units are mixed throughout §3.** `tickToSec` already divides by `playRate` (`:1882`), so `e.sec`, `e.dur`, `durSec` are *wall* seconds; buffer offsets/durations are *buffer* seconds. Correct forms: `sec = tickToSec(at) − offset/playRate`, `dur = clip.dur/playRate`, `start(when, clip.dur − durSec·playRate)`, `stop(when + durSec)` (the proposal's `/ playRate` double-applies: at 200% it cuts the clip at a quarter of its length). `applySpeed` stops and replays (`:7477-7484`), so `buildSchedule` reruns — fine.
- `scheduleNote` bumps `when` to `now + 3ms` (`:6087`) and the pump admits events up to 50ms late (`:6509`). For MIDI that's inaudible; for a clip the offset must advance by the same delta or that pass drifts by up to ~53ms. Compute offset from the actual start time, not from `when` as passed.

**(2) Pass-end cut — half real.** The pump cuts event *starts* at `loopSeg.end` (`:6489`) but never cuts durations: a MIDI note straddling the loop end rings past it today. The absolute pass end is computable in the pump (it's `passAbs` at `:6496` plus one `segLen`; pass 0 is `loopSeg.end − playOffset`). `scheduleNote` has no slot for it — don't add one; clamp `dur` for clip events at the two call sites (`:6500`, `:6509`). Also clamp to `albumEndAbs`: the pump stops scheduling *starts* past it (`:6508`) but a clip started before it plays through the fade and into the next song's load. Chip handles this with a single `src.stop` at `:6405`; per-pass nodes need it per event.

**(3) Double-trigger / leak / outliving stop.**
- `stop()` stops chip nodes only (`:6541`); MIDI sources are left to die on their own after the gains disconnect at 400ms (`:6556-6558`). A 3-minute clip node would keep rendering into a disconnected gain for minutes. Your `audioSrcs` stop is necessary — also prune it per pass (`onended` removal), or it grows one node per pass forever (`chip.srcs` only resets in `chipStopSrcs`).
- `albumLeave` restarts in place only `if (chipActive())` (`:6611`). A clip with an `albumEndAbs` stop would end mid-song after ✕. Extend the condition.
- `albumPlayIdx` awaits `chip.renderPromise` (`:6646`) but nothing would await a clip decode → under the "skip this pass" rule the first pass of every audio song in an album run is clip-silent. Await the decode with the same 15s cap.
- `loadSong` (`:2791`), `openDraftDoc` (`:10256`), cycle-edge drag (`:4949`), `albumAdvance` (`:6657`) all call `stop()` first — fine once stop kills nodes.
- Export (`:10875`) plays once through `songEndTick`, which is note-derived — see B: a clip longer than the MIDI is truncated in the bounce.

**(4) Transport-stopped guard** (`:6084`) reads `n._preview` — with the stub `n` it works and it's the right place (a pump callback landing after Stop must not create a node that isn't in `audioSrcs`). Keep the clip dispatch *after* the guard.

**Q3 (click at pass boundary): yes, real, at both ends** — the outgoing node is cut mid-waveform and the incoming starts mid-waveform. One gain per pass with ~5ms ramps in/out. Cheap; do it.

## B. Data model — annotation-created track breaks more than it saves

Concrete breakage of "track CREATED from the annotation at loadNotes time":

1. `setSong` builds `trackState` and `song.rawNotes` from `song.tracks` *before* `loadNotes` runs (`:2856`, `:2859`, `:2876`). A later-appended track has no `rawNotes[ti]` → `applyChop` throws at `:2097` on its first run (`appliedChop` is null, so it does run); `trackAudible` throws at `:2998` until `renderTrackbar` lazily fills `trackState`. You'd need the `addTrackUndoable` shape (`:12979`) — and `loadNotes` can be abandoned mid-flight by `loadGen` (`:2462`, `:2489`), leaving half-created state.
2. **Duplicate lanes.** §2.4 stores the track in the draft; §2.2 recreates it from the annotation. `openDraftDoc → setSong → loadNotes` yields two "guitar" tracks. Same for `forkCurrentSong` (`:10330-10337` copies tracks; `:10345` inherits the annotation). The proposal contradicts itself here.
3. `voiceType` (`:5588`): *last* track = triangle. Appending an audio track demotes the bass voice of every unannotated composition to a pulse the moment a clip is added. Audible regression.
4. `trackIsDrums` (`:6001`) is name-regex: a file `drums-di.wav` → track "drums-di" → drum lane geometry, drumHit routing, and *excluded from chase*. `drBassTrack` (`:11810`) `/bass|tri/` on name → "bass-take" becomes the drummer's follow track with zero notes. Both need `kind` guards.
5. `computeSongEnd` is notes-only (`:2110`). A song whose longest thing is the clip loops at the MIDI end; an audio-only song loops one bar. `pxqFloor`/`fitView` key off `songEndTick` (`:4413`), so the clip draws past the fitted right edge. Fold clip extent in — converted with the *native* tempo map, not `tickToSec` (which carries `playRate`), or song end moves with the speed slider.
6. Retrack guard at `:4761` compares only `trackIsDrums`; `moveSelectionToTrack` (`:7955`) pushes into `tr.notes` and `rawNotes[target]` — notes can be dragged *into* an audio lane. Same for the ⇄ target list.
7. `buildScoreModel` keeps empty tracks on compositions (`:6773`) → phantom stave unless kind-checked (you say you will; that's the line).
8. Ordering: `＋` appends at the end (`:12980`), so "MIDI first, audio after" breaks the first time a MIDI track is added after a clip; `writeMidi`'s channel map is index-based (`:10291`).
9. Identity/tombstones: `noteIdentity` is the JSON of the note (`:10131`). *Moving* a clip changes `at` → the repo copy resurrects on next load beside the moved one (the exact bug `saveVoices` handles at `:5747-5748`; the read-side dedupe at `:2380` covers only `trackdir`). Delete and move both need tombstones.
10. `saveLocalNotes` persists only `b1,q1,b2,q2,text,section,chord,cnote,keydir` (`:2520`). `file`/`offset` must live in `text`. The text form is not "legacy": it is the canonical in-memory shape for every type (`jsonToRawNote` `:2139`, `noteToJSON` parses text `:2224-2250`). And the `\w+=\S+` kv grammar (`:2207`) breaks on "guitar take 2.m4a" — slugify filenames at import.
11. The hand-maintained directive filters at `:2618`, `:3837`, `:8413` — without an `audio` entry the annotation shows as a prose subtitle during playback and in the notes list.
12. Safe: `dispPitchExtent`, `findPc` (`:8614`), `nameChord`, lasso (`:3372`), `laneGeom` default range (`:3517`) all tolerate empty notes.

**Recommendation: the other option (§11.1).** Put an empty, named track in the `.mid`; derive `tr.kind = "audio"` at `finalizeNotes` from the annotation exactly as voice/color/vol are derived and cleared (`:2378-2394`). That kills 1, 2, 8, the async-creation race, and Save As/Move for free; the annotation without a track is ignored like a stray `track:` (`:2390`), a track without its annotation degrades to an ordinary empty lane. Cost: one empty track in Logic (writeMidi already emits empty tracks — `createComposition` makes three, `:10314`). Keep one array + `kind` — a second array would re-implement M/S/fader/rename/delete for nothing. Still add the guards in 3–7.

## C. Storage

- **Save is not batchCommit.** `commitCompositionNow` (`:11431`) does three Contents-API PUTs (`putMidAt` `:11463`, `putRollnotes`, `putSongsText`) = three commits, three Pages builds per Save, plus `updateManifest`. `batchCommit` serves imports only (`:11357`). So "one commit, one Pages build" is false today; adding audio via batchCommit makes it four commits unless Save is migrated to batchCommit (worth doing regardless). Note batchCommit's 409 retry re-runs every blob POST (`:11210-11221`) — hoist blob uploads out of `attempt` before 30MB rides through it.
- **Blob API:** POST `/git/blobs` accepts base64 JSON up to 100MB; there is no binary/multipart door in the REST API, so a 30MB WAV is a 40MB string, JSON-stringified, in a Safari tab already holding a 60MB decode plus chip buffers. Survivable, not comfortable; it's the reason the size nudge should bite.
- **Re-point claim is correct for the Git Data API** (tree entries `{path, mode, type, sha}` referencing an existing blob in the *same* repo). But Save As/Move use the Contents API (`moveComposition` `:11524-11534`, forks commit via `commitCompositionNow`), which cannot reference by sha — so this requires rewriting those flows onto trees. Across repos (the fourth row) shas don't transfer; re-upload.
- **Skip the `committed` flag.** Compute the git blob sha client-side (SHA-1 of `"blob <len>\0" + bytes`, SubtleCrypto) and compare with a tree listing. Flags drift across devices; hashes don't.
- **Dedicated repo from day one, as the default.** `songsRepo` is the app repo (`:13129`). Every push runs Playwright with `actions/checkout@v4` (shallow, but every HEAD blob downloads — all audio, every CI run); every Pages build copies the tree (1GB cap); every clone pays. The NSF-archive shape (public, raw-fetchable, `vaultFetch` `:6288`) needs no token to *read*. Cost: two commits per Save, a token scoped to both repos, no cross-repo blob sharing. The row exists anyway — just don't default it to the app repo.
- Pages CDN lag (~10 min) after a Save: the other device's fetch 404s → never cache "missing" (the `albumMetaCache` lesson `:6272`); retry on next open.
- IDB keys must ride along in `moveComposition`'s `renameLocal` (`:11508` moves localStorage only).
- `build_manifest.mjs` claim holds (`tools/build_manifest.mjs:22`, `:35-37` — only subdirs with `album.json` become albums).

## D. iOS / Safari specifics missed

- **`decodeAudioData` detaches the input ArrayBuffer in Safari.** Write IDB first or `slice()`, or the stored record is empty.
- Resamples to the context rate (iPads run 48k; 44.1k files resample — fine). Formats: wav/aiff/caf/mp3/aac-m4a/alac safe; FLAC needs testing (media playback yes, decodeAudioData historically flaky); ogg/opus/webm no. Use the callback form `sfDecode` already uses (`:5686`).
- **m4a offset is not portable.** Safari and Chrome trim AAC encoder priming differently; the same file can start 20–50ms apart across browsers. ±10ms buttons are honest only for WAV/AIFF. Say so in the sheet.
- Peak memory during decode: compressed + float32 stereo + mono copy ≈ 30+63+32MB for a 3-min WAV, on top of chip renders and soundfont decodes. Drop the stereo buffer inside the decode callback. Jetsam ceilings on older A-series iPads are far below M-series; the 20MB gate exists for RAM as much as for git.
- **IDB eviction:** Safari's 7-day script-writable-storage cap applies after 7 days of Safari use without visiting the site (Home Screen web apps are exempt); storage-pressure eviction applies regardless. Today that loses a draft; here it loses the son's only take until Save. Call `navigator.storage.persist()`, and badge the lane "on this device only, unsaved" until the bytes land in a repo.
- **File input:** `#fileinput`'s accept list is deliberate (`:665-669`: no accept summons the photo library). Give ＋∿ its *own* `<input accept="audio/*">`; on iOS `audio/*` opens Files (Voice Memos require Share → Save to Files first — document it).
- Background/lock screen: the context goes "interrupted" (`:5178-5183`); a buffer source does not hold the audio session (only a media element does — the August stall). No regression, no improvement; don't promise it.
- `AudioBufferSourceNode.playbackRate` behaves as in `chipStart` (`:6396`); the only difference is per-pass offsets in buffer seconds (A.1). At 50% practice speed a guitar drops an octave — the LCD should say "audio: pitch follows."
- `File.arrayBuffer()` of 30MB on iPad is fine.

## E. UX

- ＋∿ one tap → picker → lands: good for hands. "At the cursor if on a bar line, else 1.1" is a hidden rule; always land at the cursor's bar and say so in setInfo.
- Size gate at import is the right moment (RAM cost is now; by Save he's built on it). Keep "Import anyway", but add a real fix that needs no library: **"store as 16-bit mono WAV"** — trivial JS, lossless for mono sources, halves a stereo bounce (15.9MB). Phone recorders already give m4a; DAW bounces are the WAV problem.
- ±10/±100ms is thirty taps to fix a late count-in. Add **one button: "align first sound to the anchor"** (onset threshold on the peaks, trims leading silence). Also ±1 beat / ±1 bar.
- Hold-to-grab is note-based (`pendingEdit` from `hitTracksNote` at `:4554`, `:4665`) and the tap path previews the note (`:5031`); a clip needs its own hooks in both. Tap = select is fine; make the *second* tap play from the clip start (the chip's second-tap idiom).
- What a DAW/phone user expects and won't find: **record**, trim handles, **loop the clip** (a 4-bar riff repeating is the first thing a chiptune-adjacent "waves" user tries — per-pass events make it N events; cheap v1.5), fade in/out, a waveform where the notes are.
- Skipping the roll is defensible for v1 only with a dumb strip: he edits notes in the roll, hears a guitar, sees nothing. A 24px strip under the ruler drawing the clip's *span* as a colored bar (no waveform) is an afternoon and prevents "where is it?"

## F. Rule framing

Keep the intent, drop the enumeration: **"The repo copy of a song is complete. A song's state is the files that travel with it through Save, Save As, Move, and Revert — today the .mid, the .rollnotes.json, and any song-owned sidecars (`.audio/`). A device holds drafts, never the only copy; anything held only on a device must say so on screen."** The last clause is what the proposal needs operationally (D's badge), and it generalizes to the next sidecar without another amendment.

## G. Phasing

Import first is right, *because* record needs everything import builds (clip model, storage, per-pass playback, peaks) plus its own hard parts: iOS `getUserMedia` with `echoCancellation/noiseSuppression/autoGainControl: false` (defaults mangle music), `outputLatency` compensation that Safari reports poorly, and bleed from the app's own playback into the mic without headphones. Record without import also has no way to bring in a better take from elsewhere. But: the son said "waves," not "record." **Ask him two questions before building:** (a) files or a record button? — if record, the bridge is Voice Memos → Files → ＋∿, which v1 covers; (b) **does he have a token / write access, and which device?** Without a token nothing he does can Save, the storage half of this design is inert for him, and D's eviction risk becomes the whole story. That answer changes v1 more than anything in §A–C.

## H. Claims that don't match the code

1. "The .mid goes up [via batchCommit]… one commit, one Pages build" — Save is three Contents PUTs (`:11431-11447`); batchCommit is import-only (`:11357`).
2. "The chase path handles 'already started'" / "Cycle works the same way" — chase is off while cycling (`:6462`, `:6497`) and filters on `e.n.ch` (`:6462`, `:6499`).
3. `stop(when + durSec / playRate)` and the `sec`/`dur`/offset formulas — `tickToSec` already divides by `playRate` (`:1882`).
4. "Every place that iterates notes tolerates an empty track" — `voiceType`, `trackIsDrums`, `drBassTrack` key on position/name (`:5588`, `:6001`, `:11810`).
5. "Legacy text form, parsed, never written" — text is the canonical form every type round-trips through (`:2139`, `:2224`, `:2520`); it must be written.
6. "`albumEndAbs` cut, same line chip uses" — chip's is one `src.stop` on a hardware-looping node (`:6405`); per-pass events need the clamp per event, and `albumLeave` restarts only for chip (`:6611`).
7. "Album play: nothing to do" — `albumPlayIdx` awaits chip render, not clip decode (`:6646`).
8. "Tombstones: deleting = tombstoning" — moving changes identity too (`:10131`); no read-side dedupe covers `audio` (`:2380` is `trackdir` only).
9. "`saveDraft` gains `kind`/`clip`" contradicts annotation-created tracks (B.2).
10. "`hitTracksNote` first; then `hitTracksClip`" — two hook points, not one (`:4554` pointerdown, `:5025` tap).
11. Tests: the vm `FakeCtx.decodeAudioData` returns a 1-sample object with no `numberOfChannels`/`getChannelData(1)` (`tests/harness.mjs:114-115`), and the e2e fake must stay in step (`harness.mjs:93`) — the downmix and peaks code will throw in the suite until both fakes grow.
12. "~8M samples ≈ 20ms" — closer to 30–80ms on an iPad main thread; once, in the decode callback, is fine — just not per draw.

## I. Verdict: **ship with these changes** (the data-model anchor is a redesign of §2, not a tweak)

1. **Track in the .mid, `kind` derived at `finalizeNotes`** from the annotation (B). If you keep annotation-created tracks anyway: one idempotent creation site using the `addTrackUndoable` shape, and drop the track from the draft.
2. **Fix playback math and dispatch** (A): playRate units; stub `n`/dispatch before the chase filter; clip chase runs while cycling; clamp `dur` to pass end and `albumEndAbs` at `:6500`/`:6509`; per-pass gain with 5ms ramps; explicit stop + per-pass pruning of `audioSrcs`; `albumLeave` and `albumPlayIdx` handle clips.
3. **`computeSongEnd` includes the clip (native rate); `kind` guards** in `voiceType`, `trackIsDrums`, `drBassTrack`, the `:4761` retrack check, `moveSelectionToTrack`, `buildScoreModel`.
4. **Storage:** default the audio row to a dedicated public repo; migrate Save to `batchCommit` (one commit); client-side blob sha instead of a `committed` flag; blob uploads outside the retry; IDB write before decode; never cache "missing".
5. **Text form is canonical:** `audio: <track> file=<slug> offset=<s>`; slugify at import; add to the three directive filters; tombstone on move and delete.
6. **Device-only badge + `storage.persist()`**; m4a-offset caveat in the sheet.
7. **UX:** own input for ＋∿; "align first sound" button; store-as-mono-WAV option; dumb roll strip; second tap plays.
8. **Before any of it:** the two questions to the son (G).
