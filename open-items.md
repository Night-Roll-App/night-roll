# Open Items

Standing list of things agreed but not done, and questions asked but not
answered. Prune as items close; add as they appear. (Claude: check this at
session start alongside the quiz.)

## Theory FACTS toolkit — BUILT 2026-10-04, not wired in (Josh: "make sure they're tested… just tell me where it would be integrated")

`src/theory/facts/*.js` + `tools/theory.mjs` + tests/theory.test.mjs
(docs/theory-toolkit.md). Pattern finder (any transposition, across a
library), form/repeats/sequences, melody, rhythm (+ harmonic rhythm from
HIS chord bands), bass, voice-leading facts — facts only, Learning-mode
nets in the tests. The CLI is live for sessions now.

- QUEUED (Josh's call): wire the six ✦ Ask tools (find_pattern, form_facts,
  melody_facts, rhythm_facts, bass_facts, voice_facts) — docs/theory-toolkit.md
  §3.1 names the exact lines in src/ask/tools.js + context.js and the
  tests; §3.0 is the three-line `factsDocFromState()` adapter. Help-sheet
  entry + drift keyword + HELP.md at that point, not before.
- Later, on demand only: pattern hits highlighted on the roll, a form
  strip lane, a Facts… sheet (§3.3).


## On-screen keyboard — DONE 2026-10-04 (docs/daw-inventory.md §1a, the
shortlist's first item). Real-piano look, fixed 44 px keys over the whole
88-key piano with a scroll, Play/Scroll switch, two-finger scroll in either
mode, ‹ C3 – E5 › octave buttons, 🔒 lock, Sustain, edge chevrons for lit
keys off-screen. See NIGHT-ROLL.md "On-screen keyboard". Built on a
worktree branch (not yet merged/pushed). Decisions taken without asking:
no auto-follow during playback (chevrons instead); the scroll pref
persists per device and does NOT re-home on song load once set (home only
until the first scroll); Sustain also rings the guitar's taps; a chord that
turns into a two-finger scroll lets go of its notes. To eyeball on the
iPad: the black-key offsets, the bar at phone width (wraps under 560 px),
two-finger scroll vs chord feel. Remaining from §1a: Logic's Scale mode
(gated on a declared key — Learning rules), Sustain as a hold button.

## Playhead strip — DONE 2026-10-03 (Josh: "if I could click that spot
under the ruler I wouldn't have that problem"). A thin band under the
ruler, right above the notes, in Roll/Tracks/Score: tap moves the cursor,
drag scrubs, neither ever touches rangeSel (the ruler above it still
parks/re-arms a cycle exactly as before). See NIGHT-ROLL.md "Playhead
strip (2026-10-03)" for the RULER_H/STRIP_Y plumbing. Branch:
worktree-agent-ae6a59166855402f4 (not yet merged/pushed to main — built on
a worktree per the task that spawned it). Tests: 4 new cases in
tests/gestures.test.mjs; night-roll.test.mjs 420/420 (1 pre-existing
skip); test:e2e:smoke 8/8 (one existing spec updated — listener mode's
"no bands" invariant moved from RULER_H===BASE_RULER_H to
STRIP_Y===BASE_RULER_H, since RULER_H now always includes the strip).

## FOR JOSH — WEEKEND TO-DO (written 2026-10-01; only things only he can do)
1. Redirect for the bare address: in the Mac's Claude Code terminal, `!` as the
   FIRST character: `! gh repo create Night-Roll-App/night-roll-app.github.io --public --source ~/.claude/jobs/c9506483/tmp/redirect --push`
2. App Store / TestFlight (see APP STORE below): (a) TestFlight → internal
   testers → install from the TestFlight app; (b) App Store Connect privacy
   labels (no data collected) + the listing text from docs/app-store-listing.md;
   (c) approve or redo the screenshots in ~/Desktop/nightroll-screenshots/;
   (d) with the iPad's silent/bell switch on, play a song — does it still play?
   (Build 3 upload is mine once you've done (a).)
3. Listening checks: FFX "Aeon Battle" plays without crashing; tapped SNES/NES/
   Game Boy notes sound like the game; FF4 "Main Theme (Ocean)" has no stray hat.
4. PS2 (unparked 2026-10-01): FFX Challenge — mute ch 30 + ch 31 and compare to
   the game recording (decides the no-instrument rule).
   Q1 FFX pitches — facts found 2026-10-01: the published files predate the WD
   key-range fix (67672709, the one that fixed the battle themes' instruments);
   the fresh capture is grounded in each sample's own root key. Listen against the
   game recording: Ominous "ch 11" from bar 17 (published is an OCTAVE off — easiest);
   Hurry!! "ch 9" first notes; Welcoming of Maester Mika "ch 8"/"ch 9" at bar 5;
   Blitz Off "ch 16"/"ch 18" at bar 12. If the published is wrong → re-capture those 4.
5. Optional: Settings → Other → Chip stream "on", play Challenge — full quality?
   Any ticks at the joins? ("auto" now exists too — 2026-10-01, streams a
   song only where the whole render would've had to downgrade or refuse, so
   Challenge is the one case worth A/B-ing "auto" against "on"/"off".)

## QUESTIONS FOR JOSH — the one list (numbered; answered ones move to DONE)
Q1. (ASK LATER — Josh, 2026-09-30) FFX by ear: 4 songs play at
    different pitches in a fresh capture (Blitz Off, Hurry, Ominous,
    Welcoming of Maester Mika). Published or fresh — which is right?
Q2. (ASK LATER) Archive move: make the archive token (resource owner
    joshcough, only the archive repo, Contents read+write) and say "go".
Q5. ANSWERED YES (2026-10-01) — waiting on Josh to run ONE command (the auto-mode
    permission classifier blocks me from creating a public repo). Files are ready in
    the job tmp dir (index.html + 404.html redirecting to /night-roll/):
    gh repo create Night-Roll-App/night-roll-app.github.io --public --source ~/.claude/jobs/c9506483/tmp/redirect --push
Q6. (found 2026-10-02, module-split step 0b) A real, pre-existing bug in
    convertAnchors() (meter-change handling for .rollnotes, src/app.js
    ~line 13996 — was index.html ~13996 before the split): `n.q2 || oldBpb`
    references `oldBpb`, which is never declared anywhere in the app. It
    throws ReferenceError the moment a note has a `b2`/`q2` loop-end pair
    AND `q2` is falsy (0) — reachable only from a specific rollnotes shape,
    so it may never have fired for any of your songs. Does this need a fix,
    and if so what should the fallback be (the old beats-per-bar? 1?), or is
    this a dead path worth deleting instead? tools/split/check.mjs's static
    scan (not a test, not an ear report) found it — not fixed as part of the
    split (a verbatim move must not touch app logic).

Q7. ANSWERED (Terminal #92: NES/SNES sound great) — step 7 shipped ba19c73. Was: Split step 7 (audio) is built but held for
    your NES/SNES sound check on the current iPad build. Can you do the
    check soon, or should I continue with the non-audio steps first?
Q8. ANSWERED (Terminal #93): Night-Roll-App/claude-bridge, private, rename later OK; scope = ALL AI (bridge, in-browser/cloud models, Ollama, LM Studio, the AI window). Was: The AI library's new repo: name and
    visibility? Default: Night-Roll-App/claude-bridge, private.
Q9. (ASK LATER — module split phase 2 steps 3/4/4b/4c, 2026-10-04) iPad
    ear check needed before these steps are considered fully verified.
    Step 4c moved the whole transport/voices/clips cluster — play/stop,
    the play gate, scheduleNote/previewNote, the sampled/game/SF2 preload,
    scheduleClip + the WSOLA apply side, the offline bounce — out of
    app.js (verbatim, no logic change, verbatim.mjs ✔ on every commit),
    so the list is docs/split-phase2-plan.md §3's step-4 list IN FULL, no
    longer narrowed: synth, SF2, game voice, NES + one streamed console,
    clip at 0.5×, note preview, album auto-advance, metronome. (iPad
    mute → revert first, per the known-good-engine rule.)

## QUEUED, READY TO APPLY: SPC NON-voice misclassification fix (2026-10-01) — 12 scratch/ .mid files waiting on a real re-capture + Josh's apply
Diagnosis: FF4 "Main Theme (Ocean)" voice 6 is a ~4s near-silent "ocean
wash" using the hardware NOISE generator as a texture, not a drum — but
`tools/spc/notes.mjs` called EVERY NON voice a GM drum unconditionally,
so it got named "drums" and `index.html`'s `drumHit` turned each ~4s
swell into a bright 45ms click.

Fixed, generic (not FF4-specific): `reconstruct()` now classifies each
NON voice after the fact — `classifyNoiseVoices`, `DRUM_MIN_HITS` (8) and
`DRUM_MAX_MEDIAN_DUR_SEC` (0.5), same kind of rhythm evidence
`tools/kit-guess.mjs` uses — documented in `tools/spc/INTEGRATION.md` §6
and NIGHT-ROLL.md. A voice that doesn't qualify keeps its own `voiceN`
track (never folded into the merged "drums" track) and its pitch is
unchanged. `drumHit` also stopped collapsing a long captured duration
(≥1s) to the fixed 45ms tick — it now sustains a decaying noise burst
over the real length (capped at 8s). Tests: `tests/spc.test.mjs` ("NON
voice classification: …", 3 cases) and `tests/night-roll.test.mjs`
("drumHit: a long captured duration…"). `npm test`: 345/347 (2
pre-existing failures are the concurrent footer-builder session's
#syncbtn/#viewbtn work, confirmed unrelated — not this change's).

Scanned every SNES capture album for a published "drums" track (the only
songs rule 1 can possibly affect): 14 songs across chrono-trigger,
final-fantasy-4, final-fantasy-6. 12 RECLASSIFY to a texture voice (the
unconditional-drum rule was wrong almost everywhere it fired):
chrono-trigger/{blackbird-outside, earthquake, last-battle, ocean-waves,
quiet-beach, tsunami, voice-of-lavos} (all 7 of CT's "drums" songs),
final-fantasy-4/{main-theme-ocean, the-package-opens, tranquil-beach}
(all 3 of FF4's), final-fantasy-6/{blazing-fire, quiet-beach} (2 of 4).
Unchanged, stay real drums: final-fantasy-6/{the-phantom-train, train}
(train-wheel rhythm, ~32-34 short regular hits — correctly still a kit).

Dry-run re-capture (scratch/snes-drum-audit/{audit,recapture_final,
midi-read}.mjs — rip zips from /tmp/claude-501/rips/snes, capture
`secs` read from each album.json's `nsf.tracks[song].secs` so the window
matches what was actually captured) produced new .mid files for all 12 in
scratch/snes-drum-audit/final/ — NOT written to albums/. Per-song note
EVENT COUNTS match the published files exactly for all 12 (confirms the
classifier only moves notes between tracks/channels, never adds, drops,
or retimes one — provable from the code too: `classifyNoiseVoices` only
clears `e.drum` after reconstruction, touching nothing else). 3 of the 12
(blackbird-outside, ocean-waves, tranquil-beach) come out byte-identical
to the published .mid outright. The other 9 match in count and are close
(a handful of ticks) but not byte-identical: some published songs were
originally captured with `snap:false` ("raw hardware timing" — confirmed
by reproducing voice-of-lavos and the-package-opens byte-exact with
`snap:false`, and tranquil-beach byte-exact with `snap:true`), a
per-song call this session can't recover from the repo. That choice is
orthogonal to this fix (it's `makeMidi`'s existing `snap` option, applied
the same way to every voice in a song) — not something rule 1 touches.

Before applying: run a REAL re-capture through the app's own import flow
(File → Import → Super NES, same pipeline that made the published
albums — the browser path knows each song's actual historical capture
length/snap choice; this session's CLI approximation doesn't) for the 12
songs above, then gate it the same way the 2026-09-30 PS1/PS2 effort did
(notes equal the published ones, nothing melodic lands on channel 9) —
tmp/recapture-writer.sh/-writer2.sh no longer exist in the tree (that was
a one-off; this session didn't recreate it). I did NOT touch albums/.

Also found, not fixed (out of scope — no SPC console-audio renderer
exists yet): `index.html`'s SPC import still says "synth voices; no
console audio yet" (`CHIPS.spc.files` lists `"?spc/apu-render"` as
optional/unused). If/when one lands, its PCM would be keyed per-voice
("voice0".."voice7", `tools/spc/apu-render.mjs`) but a drum-classified
voice's MIDI track is the single merged "drums" name — `chipHas()` would
need a name-mapping fix before a drum track could play real console
audio, same as every other kind already does. Noted in
`tools/spc/INTEGRATION.md` §6.

## docs/chrome-density-plan.md steps 1-3 DONE 2026-10-01, not committed/pushed

Built per spec (CLAUDE.md shipping checklist; this session was told not to
commit/push — that's the parent terminal session's call after Josh's
browser check):

1. Claude status out of the header: #nowchip (markup/CSS/JS) is gone; the
   AI window's #asknowstrip keeps the full line, now line-clamped to 2
   rows instead of truncating to 1. ✦ AI (#askbtn) gets a `working` class
   (pulsing ::before dot — ::after stays .hasnote's ✉) and an aria-label
   ("Talk to the AI tutor — Claude Code is working: …") on the same
   bridge-connected-and-not-idle condition the old chip used. Help's
   "What Claude Code is doing now" dd rewritten (dt kept verbatim).
2. 🎓 Learning tag: #modepill, a gold pill at the header's right end
   (where #nowchip sat), visible only in Learning mode, collapsing to the
   bare 🎓 under the header's ~860px container width (same compact-icon
   trick #nowchip used). Tap opens View ▾ (viewsheetbtn.click()) — never
   toggles the mode; in Listener mode it stays visible (Learning/Listener
   are independent switches) but is inert, since View ▾ itself is hidden
   there. #lcdmode removed from the LCD; boot + applyMode() point at
   #modepill instead. Help's "🎓 Learning mode" dd now describes the tag.
3. Track chips: H off the chip. renderTrackbar only appends the H toggle
   when the track IS hidden (lit gold, aria-pressed=true; one tap unhides
   via the same trackToggle(ti, "hidden")) — otherwise the chip is just
   dot/name/M/S, ~24px narrower. Hiding itself now starts from a new
   "Hide notes" toggle (#vmhide, aria-pressed) in the chip's voice menu
   header row (buildVoiceMenu); the Mixer keeps its own always-visible H.
   Help's "H hides the track" sentence rewritten to say where the toggle
   lives now (kept the exact phrase, added FEATURES keyword "lit H").

tests/night-roll.test.mjs: the status test (~6256) now asserts
#askbtn.working + its aria-label instead of #nowchip; the VoiceOver chip
test split into a not-hidden case (4 children) and a hidden case (5th =
lit H); added a #vmhide toggle test. `node tools/build_help.mjs` run
after the help edits. `npm test` green (vm suite only — CLAUDE.md: no
local Playwright).

4. DONE 2026-10-01 (second builder, same session) — Notes popover: ☰ Notes
   ▴ (#listbtn) opens a drop-up (#notesmenu: + New note/#notebtn, ☰ All
   notes/#notesall). Scope grew mid-build (Josh): the footer's view button
   (#viewbtn) and ⋯ More (#moresheet) became drop-ups too, same shared
   openDropUp()/closeDropUp() helper — #viewbtn's own label now names the
   CURRENT view ("▦ Roll ▴"), and ⋯ More is no longer a dockable window
   (out of makeWindow()/docking.spec's WINDOWS; a stale docked "moresheet"
   id is purged from wm on load).
5. DONE 2026-10-01 — Readout inline + fitReadline: #readline back in the
   button row (flex: 1 1 300px; .footerspacer dropped), fitReadline()
   (ResizeObserver + a MutationObserver, both vm-harness-guarded) adds
   .ownrow under a 300px leftover. docking.spec's readout check: #noteinfo
   ≥ 300px OR (#readline.ownrow AND #noteinfo ≥ 60% of the footer).

Full writeup: NIGHT-ROLL.md "Chrome density pass (2026-10-01)" §4-5;
docs/chrome-density-plan.md build order marked done through step 5.
`node tools/build_help.mjs` run after the help edits.

STILL QUEUED: Josh's own browser check at 1376px and ~1030px (6-note
lasso, a hidden track, Learning on/off) — then commit + push (parent
terminal session's call, per instructions; this sub-session did not
commit/push and ran no Playwright).

## docs/footer-redesign-plan.md Option A v2 — steps 1-5 DONE 2026-09-30, not pushed

Built per spec, delegated to Sonnet (plan-then-delegate): #readline
wrapper (readout + Chord? as the footer's own first line, replacing the
3d60818 hotfix CSS); footer line 2 trimmed to ⊞ Lasso/🎹/☰ Notes/+ Note +
conditional ⚠/✦ reply/Clear edits, ⋯ More always last with a gold ⏳N
badge; new #moresheet (VIEW segment replacing the cycling #viewbtn,
SELECTION READOUT's 8va now always-visible, HIGHLIGHT's find:/◯5, KEY
SIGNATURE's picker+mode+Set+explanation, SONG's Publish/⏳ Jobs) styled
like #viewsheet on tablet/desktop, a full-width bottom sheet on phones,
outside-tap close exempting native `<select>` pickers; 💬 out of the
footer (toggleSubtitle(), View ▾ only); folding is a class now
(`footer.folded > :not(#readline)`), footer controls 44px, a container
query drops "⊞ Lasso"/"⋯ More" to glyphs under ~420px. Docs (NIGHT-ROLL.md,
this file, docs/footer-redesign-plan.md) + HELP.md updated; `npm test`
green (vm suite — see tests/night-roll.test.mjs's new "8va" / jobs-badge
tests, tests/e2e/editor.spec.mjs's fold-class update, tests/e2e/
docking.spec.mjs's #noteinfo-width check, CI only).

QUEUED: step 6 — Josh's own browser check at 1376px and ~1030px (AI docked
right) with a 6-note lasso, then commit + push (this session didn't
commit/push per its instructions). Nothing blocking; not yet verified in a
real browser.

## View switcher restored + View ▾ regrouped — DONE (shipped ee0e69e; the 3-way segment replaced by one cycling button in c045382, Josh: "way too big")

Josh, 2026-09-30, after a day on footer v2: "Put the view changer button
back in the bottom left — I use it a lot in analysis," and "there's a
Score view and a Tracks view but no Roll view, and Listener mode is stuck
between them — look hard at the ordering." Built by a delegated session
(plan-then-delegate), NOT committed/pushed per its instructions:

- #viewbtn is live again: a ▦ Roll / ▤ Tracks / 𝄞 Score segmented control,
  first item in the footer's left group (before ⊞ Lasso/🎹). Same
  viewsegroll/tracks/score ids and viewSeg object the hidden #moresheet-era
  segment used — only its markup location changed.
- View ▾ (#viewsheet) regrouped into four .cfgsec-labelled sections: VIEW
  (▦ Roll — new — / ▤ Tracks view / 𝄞 Score view, a radio) → PANELS (🎹
  Instrument panel, 💬 Notes strip, 🎚 Mixer, ◂ Tracks) → DISPLAY (🛠 Edit
  toolbar, ▦ Bottom bar, ▦ Grid…, ▸ Section levels) → MODE (🔍 Analyze ▸,
  ⇄ Compare with repo, 🎓 Learning mode, 📻 Listener mode — last).
- Docs: NIGHT-ROLL.md ("View switcher restored, View ▾ regrouped"
  subsection, under Footer v2), HELP.md rebuilt (`node
  tools/build_help.mjs`), FEATURES drift keywords intact.
- Tests: `npm test` green except one pre-existing failure in "Game order"
  (album-list ordering, tests/night-roll.test.mjs:6394) — unrelated to this
  change (confirmed via `git diff` — nothing touched there) and inside the
  area the other concurrent session was actively building (album list
  ordering/album play/manifest); not this session's to fix.


## Annotations v2 — DONE 2026-10-01: P3 reader (34ea078), P4 writer (d8c84ce), P5 batch: 1195/1196 files converted, one commit per album; graveyard-3 converted after Q10 — 1196/1196. Tool: tools/migrate-rollnotes-v2.mjs.

## docs/provenance-plan.md P0 + P2 — DONE 2026-09-30: ONE publish function; the bugs it fixes

`publishSong(key, h, report)` replaces `commitCompositionNow` +
`publishDraftSong` + the inline annotations-only branch — the Publish
button and Publish all now call the SAME function for every song, open
or not (Josh's ruling: "Publish all must behave exactly like publishing
the open song"). `tests/night-roll.test.mjs` ("Publish: …", 5 new tests)
pin the fixed behavior; `npm test` green (full suite).

Move now publishes through publishSong too (2026-09-30): a moved song is
byte-identical to publishing it at the new path, deleted notes stay deleted
(tombstones now ride every rename, Save As included), and a failed publish
undoes the rename before any old file is deleted. Two tests.
Audio clips now move with the song (copied before any old file is deleted).
Left: a move made with no token stays local; clips that exist only in the
repo aren't carried forward when it's published later. Moves also write
manifest.json twice (harmless).

Bugs fixed (docs/provenance-plan.md "Bugs found"):
- Publish all wrote the un-baked tempo map for a not-open song (the open
  song's own Publish baked it) — the two diverged. Fixed: `bakeTempos`
  (pure, lifted out of `finalizeNotes`) runs for every song's publish,
  open or not, from the draft's stored un-baked base.
- Publish all re-published a tombstoned (locally-deleted) synced note,
  because it never subtracted tombstones for a not-open song.
  `annotationsFor(key)` (factored out of `loadNotes`' merge) does now.
- Publish all skipped recordings, the README, and the iPad Files mirror
  for every song but the open one. Fixed: `uploadAudioClipsFor`/
  `filesMirrorFor` run per song; the README moves to once per JOB
  (`writeSongsReadme`, called once after the loop) instead of never.
- A captured-but-not-yet-committed draft in a console folder (not just
  `albums/imports/`) passed `syncable()`/`dirtySongs()`, so its
  annotations could try to publish before its .mid existed. Fixed:
  both now exclude any `isCaptureKey` draft still on this device.
- An Untitled (`local/`) song's tempo: note never baked into playback —
  `isComposition()`/`isCompositionKey` require a repo path. New
  `bakesTempo(key)` (local/ OR his own folder, with a draft) is the
  playback-baking gate; `isComposition()`/`isCompositionKey` stay the
  narrower "does this key ever get a .mid PUBLISHED" gate.
- `musicSig` ignored the tempo map, so a tempo-only edit never
  republished the .mid. Fixed: `musicSig` now includes it — every
  EXISTING caller already agreed on the un-baked convention on both
  sides of its own comparison, so this was safe to widen; `publishSong`
  passes it the BAKED doc, and stores that under a separate `midSig`
  field so the (un-baked) `pubSig` the "edited since last save" UI
  relies on elsewhere is untouched.
- The tempo-baking ratchet (a removed tempo: note's baked event never
  went away): `bakeTempos` recomputes from the stored un-baked base on
  every call, never accumulates — confirmed by a test that publishes,
  deletes the tempo note, republishes, and checks the baked event is
  gone, not just stale.

Not done (deferred, matches the plan): P1's stored-origin model (today's
predicates — `isComposition`/`isCompositionKey`/`bakesTempo` — are used
as-is); the un-baked base still lives only in the local draft, not the
file itself (P4's v2 header); "three copies of the editable? test
disagree" (P1); the tools/ scripts that read the legacy text grammar.

## docs/provenance-plan.md P3 + P4 — DONE 2026-10-01: .rollnotes v2, reader then writer

P3 (reader + version guard, shipped first so no device ever meets a v2
file it can't read) then P4 (writer) — see docs/annotations-v2.md,
docs/annotations-v2.schema.json, NIGHT-ROLL.md's ".rollnotes format", and
tests/night-roll.test.mjs's "annotations v2"/"P4:" tests. `npm test`
green (full suite).

P4: `serializeNotesList`/`serializeRollnotes`/`serializeRollnotesStamped`
write v2 (`format`/`version: 2`, optional `origin`) through every writer
(`publishSong`, `commitImports`, the iPad Files mirror, Copy/Download) —
a v1 file upgrades to v2 the next time the app publishes it, notes
unchanged. `forkCurrentSong`/`moveComposition`/`createComposition`/
`commitImports` now set `origin.kind`/`from`/`movedFrom` directly instead
of writing a `"forked from"`/`"moved from"` note (Q8, DONE — six existing
files get it in P5); a not-yet-published song's origin stashes in
`localStorage["ff1roll-origin-" + key]` until the first Publish writes it
for real, and every later publish re-reads whatever's already on disk
rather than re-deriving it. `originOf(key)` checks a stored
`rollnotesOrigin.kind` first, outright. Closed P3's known gap: the note
editor Save/Delete, chord/section/key dialogs, lasso-annotation paste,
the chord tool, and Analyze → Adopt all refuse on a locked (too-new) song
now, same message Publish/Move/the Ask tool already used.

Next: **P5**, the one-time batch migration of every file P4's
natural publish-time upgrade doesn't reach on its own (not done here —
Q3 ruling already covers it: format conversion isn't editing, no
per-song approval needed).

## IMPORT HUB — DONE 2026-09-29 (docs/import-hub-design.md, Josh: "I still hate the file import line")

All three phases, built exactly to the reviewed design. `npm test` green
(full suite, not just the vm files touched).

1. **The hub.** File → Import… (`#fileimporthub`) opens `#importhub`, one
   screen with a section per format — MIDI, NES, Game Boy, Super NES,
   Genesis, PlayStation, PlayStation 2, Nintendo 64, SoundFont, New song
   from a recording — each saying exactly what it needs and its own
   `Choose files…`, all sharing the existing `#fileinput` (its accept list
   and byte-sniff untouched; a pick from the "wrong" section still routes
   correctly). Non-dockable window (`makeWindow("importhub", {dockable:
   false})` — a one-shot picker, not a panel worth pinning open).
2. **Drop target.** `dragover`/`drop` on `#importhub` only, feeding
   `openPickedFiles` like any pick; a dashed-gold highlight while dragging.
3. **New song from a recording.** `openPickedFiles`'s audio branch now
   calls `createComposition(120, 4, 4)` first when no song is open, before
   `importAudioFiles` — previously a recording pick with nothing open
   silently did nothing (`importAudioFiles` returns early on `!song`).

Cleanups that rode along: `CHIPS.psf2`'s two dead `bgm-unimplemented`
throws removed from index.html (tools/ untouched, out of scope); help
sheet's Import… paragraph shrank behind a new dedicated entry covering all
ten kinds, two outdated PS2 claims removed; "Super Nintendo" → "Super NES"
in help text and the FEATURES drift list. Full writeup: NIGHT-ROLL.md
"Import hub".

**Also this session — the ✦ AI panel (and every migrated window) docked
short cut off its input row.** `.overlay.docked .sheet` no longer scrolls
as one block; the one scrolling body per window (`#asklog`, `#instrows`,
`#notelistrows`, `#jobslist`, `#pubjoblist`, `#infosheettext`) flexes and
scrolls on its own, so the header and the input/button rows always stay
visible at any dock height. NIGHT-ROLL.md "Docked-short content flexes".

**Also this session — reopening a track's voice menu now drills back to
the picked instrument** instead of resetting to the systems list (Josh's
report: he picked a Final Fantasy IV instrument, closed the menu, reopened
it, and it didn't drill back down — "it really needs to"). Exposed and
fixed a render-race between three things that can each rebuild the same
open popup (`voiceMenuRenderToken`) and closed the old-vault gap the
archive-by-console move left open (see "ARCHIVE BY CONSOLE" below).
NIGHT-ROLL.md "Reopening the menu drills back to the pick" /
"Render races on the SAME popup".

**Also this session — a track's voice menu could stay open on the WRONG
track** (Josh's report, traced): tapping a different track's chip while
its neighbor's voice menu was open didn't close it — the tap-away closer
exempted every chip, not just the one the menu belonged to, and the chip
click handler only closed anything on a SECOND tap of the already-selected
track. Fixed both; covered by a real-browser e2e test (`tests/e2e/
editor.spec.mjs`, CI-only) since the fix lives inside a `pointerdown`/
`.closest()` chain the vm harness can't drive.

**Needs eyes in a browser** (not done here, no local Playwright per
CLAUDE.md): the File menu's new Import… button and the hub open/scrolled;
the drop-target highlight; a real drag-and-drop pick; the new-song-from-a-
recording result; the ✦ AI panel docked bottom at 240px with its input
visible; the voice menu's auto-drill on a real device.

## ZELDA (NES) EAR/EYE REPORTS — DONE 2026-09-29

Four fixes from Josh's 2026-09-29 report on The Legend of Zelda (NES),
all in tools/nsf/notes.mjs and index.html, `npm test` green (full suite,
not just the vm files touched):

1. **Ghost notes** (tracks 5-7): the no-loop tail trim's last real
   register change is often the driver releasing the final note (a
   volume drop) via a write that ALSO touches the length-counter
   register, which `reconstruct()` treats as a note boundary regardless
   of pitch — splitting one note into a real half and a same-pitch
   "ghost" tail. `trimSustainedTail` (tools/nsf/notes.mjs) now drops any
   event that starts at/after the trim's own frame F and continues the
   SAME pitch as the note before it, and lets that note ring to its own
   conclusion (F) instead. A different pitch at/near F (a real final
   attack, e.g. track 21's G#7) still gets its short ring-out. Verified
   against the real rip (tracks 5, 6, 7, 21, 37).
2. **Two-bar minimum in album play**: `albumEndSec`'s "does this loop"
   signal was just "does the segment have any notes" (true for nearly
   every song), so a non-looping song's whole length got doubled
   (ALBUM_PASSES) — a sub-bar jingle played all the way through two
   bars, mostly silence, before the album advanced. `currentLoop()` now
   reports whether it found a REAL loop: directive (`.looped`); only
   that gates the extra pass. A genuine loop still gets its OST-CD two
   passes.
3. **Track 21 losing G#7 (MIDI 104)**: PMIN/PMAX (the roll's editable
   display range) were a fixed C1..C7 (24-96) — any real note above C7
   fell outside every bound derived from them (view fit, lane height,
   hit-testing), so it vanished off-canvas after a zoom/tap. computeSongEnd()
   now extends PMIN/PMAX (never shrinks them) to cover the loaded song's
   real note range. An ordinary song sees no change.
4. **Status line (#noteinfo/setInfo) truncation**: long messages lost
   everything past the ellipsis with no way to read them. It now clamps
   to 2 lines instead of 1, and tapping opens the full message in a
   small sheet (#infosheet) — no native dialogs. A copyable message
   (chord/note detail) keeps its existing tap-to-copy, unchanged.

Also (main session, same session): FOLDER_NAMES — snes: "SNES" →
"Super NES"; added ps2: "PlayStation 2" (missing before; the raw
folder name "PS2" showed).

Needs eyes in a browser (not done here — no local Playwright per
CLAUDE.md, and this session doesn't push): the #infosheet sheet's
open/close chrome (✕, backdrop tap, Esc — wired generically for every
`.overlay`, untested by the vm harness, which stubs `document`
without `querySelectorAll` and skips that wiring on purpose); the
2-line clamp's look in the real footer layout; track 21 in the roll
after a zoom/tap; Zelda tracks 5-7's audio actually stopping clean at
the real note's end with no audible ghost.

## APP STORE — WHERE IT STANDS (2026-09-28; the one current list)

Done: Apple Developer Program; App Store Connect record; builds 1-2
uploaded (CURRENT_PROJECT_VERSION 3 next); icon = the original
(afb518c); support email nightrollapp@gmail.com; org Night-Roll-App
created; four starters (bach, fur-elise, gymnopedie-no-1,
moonlight-sonata-1); name "Night Roll"; price $4.99; background
playback (shell audio mode + "playback" audio session).

Remains:
1. TestFlight → internal testers → install from the TestFlight app. Josh
   (not confirmed done).
2. App Store Connect: privacy labels (no data collected) and the listing
   entry from docs/app-store-listing.md. Josh.
3. Screenshots: drafts at ~/Desktop/nightroll-screenshots/ (2752×2064).
   Josh approves or asks; the terminal redraws.
4. Control Center bell muting Web Audio: likely fixed by the "playback"
   audio session (it ignores the silent switch). Josh checks: bell on,
   play a song. Terminal fixes if it still mutes.
5. Upload a new build with tonight's changes (build 3). Terminal.
6. Org move: DONE 2026-09-29 (fd26e59). Site
   https://night-roll-app.github.io/night-roll/; the listing draft's URLs
   follow. Token DONE 2026-09-29: a fine-grained token owned by
   Night-Roll-App (night-roll + nsf-archive, contents read/write), set in
   the Mac browser, iPad Safari and the iPad app; old tokens deleted.
7. APNs push: not a store blocker; after the store work (decided
   2026-09-28).

## NES/GB INSTRUMENT FOLDERS — DONE (2026-09-28)

Single-file vaults publish at <vault>.instruments/ (tetris.nsf vs
tetris.gbs no longer collide); 24 folders moved, TMNT 2, Final Fantasy
Legend and both Tetrises published. The Instruments browser and game
voices list NES and Game Boy. Archive cruft: a stray mm2.nsf at the
root duplicates mega-man-2.nsf (tied to no album) — Josh's call.

## PS2 milestone 1 — DONE 2026-09-28: rips → notes for Sony's stock driver (SQ/HD/BD); Square's own driver (FFX, "BGM"/"WD") identified only; not wired into the app, no audio, nothing committed/pushed. See docs/plans/ps2.md §8 for findings and what milestone 2 (chip audio) needs.

## PS2 milestone 2 — DONE 2026-09-28: a PS2 set imports like a PS1 set —
CHIPS.psf2 (index.html), the ps2 worker runner, tools/package.mjs; chip
audio through the SAME tools/psx/spu-render.mjs as PS1 (zero PS2-specific
render code — an HD/BD bank reshapes into a VAB-shaped bank). Two real
bugs found only by rendering real Dark Cloud audio end to end (not
guessed): a per-VAG native sample rate real HD files carry (22050-44100
Hz) that toBank() parsed but dropped, and a pan double-offset (every real
program's panpot byte reads exactly 64 = an ABSOLUTE pan value, 64 =
centre — the same convention vab.mjs's own tone.pan uses — not an offset
to add 64 to). Both fixed with regression tests. `npm test`: still 100%
green (psx suites unaffected — same renderer, unmodified). Verified: 59/59
real Dark Cloud songs via tools/import-set.mjs to a scratch dir (not
published); 3 songs' full app capture+render path (notes, loop, per-track
RMS > 0) via scratch/ps2-app-render.mjs — pitch checks are inconclusive
(no PS2 reference player exists; see tools/ps2/INTEGRATION.md §4/§5 for
the numbers and why). NOT committed/pushed (per this agent's brief). Not
done: Square's BGM/WD reader (FFX etc. still refused by name, a distinct
opcode table, not AKAO-descended after all), PS2 instruments, the
listening pass. Docs: tools/ps2/INTEGRATION.md (new), NIGHT-ROLL.md
"PlayStation 2 import", help sheet + HELP.md + drift keyword ("PlayStation
2"), docs/plans/ps2.md status line.

## Game instrument libraries: load any SoundFont 2 — DONE 2026-09-28 (untested by ear)

`tools/instruments/sf2.mjs` (browser-clean, no Node imports) reads any
.sf2 — a fan-made game font, a better piano, anything — into the same
in-memory shape `play.mjs` already plays, resolving the real SF2
generator rules (global zones, preset-level additive offsets, a preset
layer's key/vel range narrowing an instrument zone's). File → Import…
routes a .sf2 by its RIFF/sfbk header; it keeps a device copy
(IndexedDB) and, with a game files & instruments repo configured, pushes
it to `soundfonts/<slug>.sf2` there too (files over 50 MB ask first, over
95 MB stay device-local only). Voice id `sf2:<slug>:<bank>:<program>`,
assigned from the voice & color menu's new **Soundfonts ›** family;
playback reuses `scheduleGameNote` (a shared resolver, not a copy) so a
soundfont preset and a game instrument cache/fallback the same way. SF3
(compressed) and 24-bit samples are refused with a clear error, not a
garbled render. Tests: tests/instruments-sf2.test.mjs (parser round-trip
+ a hand-built font with global zones/preset offsets), "soundfont:"/
"soundfont voice: …" in tests/night-roll.test.mjs. NIGHT-ROLL.md "Game
instrument libraries" step 4 has the full design. Not yet: heard by
Josh's ear against a real community SoundFont (a fan GoldenEye/OoT/FF7
font, say) — everything above is measured against the parser's own
round trip and a hand-built synthetic file, same gap the SF2/SFZ export
and the SNES extractor both flagged (no `fluidsynth`/real player on this
machine to cross-check against).

## PS1 SOUNDING PITCH — WAITS ON JOSH'S EAR (2026-09-28)

The roll shows the sounding pitch for N64 (checked against a real player)
but NOT yet for PS1: no PS1 player runs on the Mac without a Sony BIOS,
so FF7's offsets (409 of 1091 tracks, consistent per program) are
measured against our own renderer only. ONE CHECK unlocks it: play "You
Can Hear the Cry of the Planet" in Night Roll and a recording (YouTube):
is the repeating motif in the same octave? Same → our renderer's octave
is right → flip PSX_SOUNDING_ON in index.html and re-capture the PS1
albums. Different → a renderer bug to fix first.
Community soundfont comparison (same day, scratch/instr-compare/reports/):
GoldenEye's GoldenEyeVault font matches 104/106 samples with identical
loops — its ~90–100¢ sharp band is theirs (our GE render matches
lazyusf2 within a cent). OoT's fan font loops whole samples (ours reads
the driver's loop start). SM64's is GM-retuned on purpose. FF7's Nyx
font: 72/93 samples byte-identical, but several MELODIC instruments
differ by ~an octave (e.g. Synth bass −1071¢) — same open question as
the ear check above; our PS1 side is checked only against our own
renderer, so this is not evidence either way yet.

## Sounding-pitch offsets — DONE 2026-09-28; one disagreement to ear-check; PS1 ground truth still open

`tools/sounding.mjs` measures, at capture time, when an instrument's
sample was recorded an octave (or two) from the written key, and shifts
the roll to show the sounding pitch (Josh's ruling). NIGHT-ROLL.md
"Sounding-pitch offsets" has the full design, plus the 2nd-harmonic
guard added on review (a bright sample's 2nd harmonic winning
autocorrelation over a quieter true fundamental — this WAS a real bug,
caught by re-checking: Bombing Mission's prog 55 was exactly this false
positive and now measures 0; nothing else in the 90-song FF7 catalog
uses prog 55 with a different result, so the fix isn't just papering
over one case).

**Needs Josh's ear**: a full survey of all 38 SM64 + 90 FF7 captures,
post-hardening, found FF7 Bombing Mission (102b) still has two shifted
channels (prog 49 −12, prog 40 +12) — disagreeing with an earlier
informal spot check that called Bombing Mission "all 0". Both programs
shift identically in 14 and 9 other FF7 songs respectively (cross-song
corroboration, not noise), so this is very likely a real miss in that
earlier spot check, not a bug in the new measurement — but it's a claim
about what Josh hears, so it's his call, not a fact a tool should
assert unprompted. Also open: Cave Dungeon ch 7 (bank 21 inst 7)
measures UNSHIFTED (offset 0, corr 0.98) — disagreeing with the ground
truth list in the task that added this feature, which grouped it with
ch 0/6 (both −12, confirmed); INTEGRATION.md's own §9.6 text only
computed the fundamental for inst 0/6 (inst 7 is a different recording,
tuning 0.281 not 1.0). Test the shifted tracks by ear on a re-import of
both albums; if Cave Dungeon ch 7 or Bombing Mission's two channels
sound RIGHT as written (not shifted), the autocorrelation method needs
a second look at those specific instruments.

**PS1 ground truth is still unverified against a real player** (N64's
was, against lazyusf2). Tried building kode54's Highly Experimental
core into a WAV renderer fed our own assembled RAM image (scratch/
psf2wav.c, scratch/psf-ram-dump.mjs — both left in scratch/, gitignored,
for reuse) — it compiles and boots, but its BIOS synthesizer
(`mkhebios_create`) needs a real, copyrighted Sony PS2 BIOS dump as raw
material (it extracts genuine kernel modules from one by name); we
don't have one and aren't getting one. So FF7's shifted programs are
verified only against OUR OWN renderSpu, same as before — if anyone
ever has a legitimately-owned PS2 BIOS dump, scratch/psf2wav.c is ready
to receive it (`bios_set_image` before `psx_init`) and would let a
future session cross-check the whole per-program table (32 entries) the
same way N64's was checked.

## Game instrument libraries: SF2/SFZ export — DONE 2026-09-28

`tools/instruments/export.mjs` writes any extracted library (instruments.json
+ WAVs) as SoundFont 2 and SFZ, so the instruments load in any DAW/sampler,
not just Night Roll. Ran on all 14 real libraries into
scratch/instruments/export/ — sizes from 1.3 MB (n64-ge) to 86 MB
(final-fantasy-ix SF2; its SFZ set is 2579 files). tests/instruments-export.test.mjs
(4 tests, added to `npm test`; levels normalised per file, instruments named) round-trips a synthetic library through a
from-scratch RIFF/SF2 reader. Not verified by ear: `fluidsynth`/`sfizz` are
not installed on this machine, so no rendered note was checked against the
library's own player — an item, not a gap covered elsewhere. Docs:
NIGHT-ROLL.md "Game instrument libraries" (Step 2).

## Game instrument libraries: SNES — DONE 2026-09-28 (not published)

`tools/instruments/snes.mjs` extends extract.mjs/verify.mjs to `.spc` (an
instrument = one SAMPLE, identified by its content hash across the WHOLE
album, not a song's own SRCN number; envelope = its majority ADSR/GAIN
across every song that plays it, other combos kept as `envelopeVariants`;
drum vs melodic uses of the same sample split apart) — see NIGHT-ROLL.md
"Game instrument libraries" for the full design and how it got here (two
revisions: grouping by (SRCN, ADSR/GAIN) gave Donkey Kong Country 703
"instruments" from 59 samples; merging envelopes but still keying by a
song's own SRCN got that to 274; keying by sample hash — since a `.spc` is
one song's own ARAM snapshot, the same sample loads at a different SRCN in
almost every song that uses it — got it to 64). Ran on all 11 SNES albums
with rips on disk: 744 instruments total (was 2427, then 1990), 636
samples, 5.4 MB WAV total, album-wide instrument:sample ratio 1.17 (Chrono
Trigger's 92 `.spc` downloaded from joshcough/nsf-archive, not locally
ripped). Verified against apu-render.mjs on 3 songs/2 albums, unchanged
across all three revisions (a single-song extraction has nothing to
merge): every melodic note ≤ 3¢/≥0.975 shape/≤0.43 dB; noise/short-drum
rows fail only the centroid-fallback pitch check (shape still ≥ 0.987) —
not a real pitch error, see NIGHT-ROLL.md. Not run through export.mjs's
SF2/SFZ by ear either (same gap as the entry above). Not published to the
archive — scratch/ only.

## Game instrument libraries: NES + Game Boy — DONE 2026-09-28 (not published)

`tools/instruments/nes.mjs` extends extract.mjs/verify.mjs to `.nsf`/`.gbs`:
both chips are pure synthesis (pulse/wave/noise), so an instrument is
channel + duty + the volume-curve's SHAPE, and normalised so accent rides
on velocity, not the envelope; the "sample" is a synthesized cycle-
accurate loop (pulse/triangle/GB noise) or, for GB wave, the real
captured 32-nibble wavetable, content-hashed. See NIGHT-ROLL.md "Game
instrument libraries" for the full design, including bugs found and
fixed by verify.mjs's own numbers before this could be called done:
(1) the exported envelope stored the representative note's own
UNNORMALISED level, double-counting its accent against velocity — fixed
by normalising envelope points the same way clustering's own curve
already is; (2) GB samples were missing the DMG mixer's own gain(bit)
scaling (routing + master volume, ~−12 dB at default settings) that
apu-render.mjs always applies — fixed by baking in the reference gain a
full-stereo/max-volume song defaults to; (3) a pre-commit review caught
the first clustering design (quantize the curve to 0.1, cluster by exact
string match) still over-fragmenting real albums (Contra 175 instruments
from 11 songs, Castlevania 228) — replaced with a similarity merge
(`clusterByShape`: Pearson correlation ≥ 0.97 AND mean absolute
difference ≤ 0.08, medoid-per-cluster, see NIGHT-ROLL.md), which also
surfaced and fixed a correlation-formula bug (a flat curve's correlation
against anything is undefined and was scored 0, refusing to merge a
held note with a barely-decaying near-copy of itself at a mean
difference of 0.03 — rescored 1, deferring to the difference test).
Counts, total, before → after the similarity-merge rewrite: Mega Man 2
140 → 109; Contra 175 → 123; Castlevania 228 → 164; Link's Awakening
111 → 88. Contra/Castlevania/Link's Awakening still exceed ~60 melodic
instruments — checked by hand, and it's real per-song variety (e.g.
Contra's pulse1 duty-75% notes span flat-at-full, decaying to 14%, and
a RISING attack-shaped envelope, correlations against each other from
−0.72 to 1.0), not a clustering defect; loosening the bar further risks
merging genuinely different instruments, the opposite of the point.
Verify median shapes barely moved from the rewrite (MM2 0.90, Contra
0.75, Castlevania 0.67, Link's Awakening 0.91, both before and after) —
it fixed instrument count, not per-note fidelity, which was already
using the album's dominant curve either way. Ran on 22 of 24 real
albums with rips on disk (Gimmick, Just Breed and Lagrange Point are
expansion-chip NSFs the capture itself refuses, same as everywhere else
in this repo). Verified against apu-render.mjs on 2 NES albums (Mega
Man 2, Contra) + Castlevania + 1 GB album (Link's Awakening): pitch
reliably within a few cents once compared at the ROUNDED key's own
period (the raw captured one is essentially never an exact semitone —
pure quantization noise, not a pitch bug); envelope shape correlation
0.8–0.99 for most as-played notes, lower for an individual pick whose
own decay differs from its cluster's medoid, or for extrapolating a
software-envelope instrument well past a note's own observed length —
tests hold the MEDIAN across several picks to the bar, not every single
one (real per-note variance from choosing one representative per
cluster, not a bug). What doesn't fit: NES DPCM (a real sample channel) — the 2A03
capture never logs its registers in the first place, so no rip this
module has seen carries DPCM facts to extract; would need real sample
extraction like PSX/N64 if a capture ever adds it. GB pulse/noise's
envelope is only approximate at low volume (the DMG DAC's "off" state
doesn't scale with volume the way NES's does) — a minor timbral
softening, not fixed. Not run through export.mjs's SF2/SFZ by ear, not
published to the archive — scratch/ only (same gaps as the entries
above).

## Recording looped instead of growing the song — FIXED on the overnight branch (2026-09-26)

Josh's son: new song (two bars), MIDI keyboard + arpeggiator, ●, the
take wrapped onto bars 1–2. Cause: the transport's loop segment (0 →
song end) also applied while recording. Fix: an open-ended segment
while ● is armed (NIGHT-ROLL.md "Recording past the end"). Needs a
real-keyboard test by the son; vm test covers the segment math.

## ROADMAP — the whole remaining list (written 2026-09-26, end of a long day)
## PHASE 0.5 AUDIO SPIKE — DONE 2026-09-27 MORNING: GO

Throwaway Capacitor 8 shell at ~/work/ff/nightroll-shell-spike (not in
the repo; notes + results in its spike-notes.md), loading the Pages URL,
on Josh's iPad Pro 13" M4 via Xcode 26.6. Passed: sound, NES/SNES/GB chip
audio "perfect", timer interruption resumes by itself, dictation then
Play (last night's Safari failure!), audio file as a track, persistence,
bridge over Tailscale + GitHub, WebGPU. Failed: the Control Center bell
mutes Web Audio (known WebKit behavior; fix = a silent media element
held open in shell mode or a native session hold). Skipped: AirPods,
hardware keyboard (none). Bug seen: a wrong "newer save exists" dialog on
Threnody II after relaunch (repo stamp 2026-09-26 12:31 < the draft; the
fresh install likely stamped the draft before the annotation file
loaded) — fix in loadSongInner/saveDraft. Apple Developer Program:
enrolled. Next: Phase 2, the real shell (Files-app storage, icon, name,
TestFlight). (Since done: support email nightrollapp@gmail.com; four starters in albums/starters; icon = the original, afb518c. Current list: APP STORE — WHERE IT STANDS, top of this file.)

## SONG ORGANIZATION — JOSH'S ANSWERS (2026-09-27 evening)

Proposal: docs/song-organization-proposal.md. His rulings on its
questions: 1 ASK FIRST before making a local copy of a published song
(not silent); 2 mirror the local tree on GitHub (default); 3 console
folders as parents, move the imports AND Final Fantasy I under nes/ in
one batch (his addition); 4 DO NOT merge nightroll/ — "I can move them
on my own. I'm not ready for some of those to be official
compositions"; 5 iPad Save always writes Files, no checkbox; 6 Save
never publishes; 7 the three songs in compositions/ are finished Night
Roll songs (NOT Logic exports — the doc was wrong, corrected), keep
them protected; 8 the two test rollnotes deleted, the Cool B Maj
journal moved beside its song (done, this commit). Stale leftover:
nightroll/cool-b-maj-with-b-part.notes.txt (an older dump of the moved
song; the current one is in compositions/) — delete on his word.
Build order per the doc: wording → Save with folders + mirrored
publish → Open LOCAL/PUBLISHED → iPad Files → the one batch of moves.
DONE (evening): phase 1 — Open as LOCAL / PUBLISHED with folders by
path, Commit → Publish wording, publish buttons name their destination
(branch `folders`, merged). Phase 2 also DONE: New makes "Untitled N"
(local/, editable, never publishable); Save asks folder + name (own
folders ∪ repo folders, New folder…, nested paths allowed); Save As and
Move to… go to any folder; a never-published song moves on the device
only; editability by folder (READONLY_DIRS); build_manifest walks any
depth. Phase 3 DONE too: the iPad Files mirror (every Save also writes the
song into Files; the checkbox and the Files "mode" are gone; the
Settings row is one sentence) and "✎ Edit here" (a published song of
his with no local copy on the device asks first, then makes the local
copy). The batch of moves is MERGED (Josh: "Console folders go", 2026-09-27
evening; main 027ea97, iPad rebuilt): FF1 + the four imports under nes/ snes/ game-boy/, old
links and device keys remap at boot, new captures land under their
console, captures read-only by marker. Every device must load the new build once before publishing (a
publish from an old build resurrects the old path) — Josh's Mac
browsers included; the import sheet
proposing a console folder for new imports; notes.txt duplicate in
nightroll/ (cool-b-maj-with-b-part) on his word.

## OPEN DESIGN QUESTION (Josh, 2026-09-27): where saves live on the iPad

The Files checkbox in Settings (Saving tab) is the desktop folder mode:
on, Save writes into Files → On My iPad → Night Roll and Publish is
BYPASSED. Josh read it as "everything in Files until I hit Publish" and
found it confusing; then: "I would like everything that I do to be
saved locally and up on GitHub … I think we need to think through it
some more." Not the same as the folder mode (which exists for people
with no GitHub account). Candidate: Save writes a visible copy into
Files always (a mirror, never read from), Publish still goes to GitHub;
the checkbox then means only "no GitHub". Decide with Josh before any
code; until then the box is documented as-is (help sheet, folder entry).

## STARTERS (2026-09-27): four public-domain pieces

Bach Prelude in C (piano, tracks arpeggio/tenor/bass), Gymnopédie No. 1
(full 78 bars, verified against Mutopia's edition), Für Elise (A
section, 31 bars incl. the written-out repeat), Moonlight Sonata first
movement (agent in progress). Generator scripts were not committed (the
Bach precedent). Known drift: albums/manifest.json's imports albums are
in in-app order, `node tools/build_manifest.mjs` would re-sort them —
the starters were inserted by hand to avoid a 300-line reorder; decide
whether the tool or the app owns the order.

## QUEUE (2026-09-29, the order Josh approved)
SNES NOISE-VOICE FIX APPLIED (2026-10-01): 11 of 12 published songs had their fake
"drums" track renamed/merged back to its real voice by tools/spc-undrum.mjs (every
note verified identical against HEAD by an independent check). final-fantasy-6/blazing-fire
DONE too: the tool parsed without {trust: true}, which trims an unterminated note
(voice1, 22156 → 15360); fixed, re-run, verified identical — all 12 done.
DONE 2026-09-30 — FOOTER v2 TWEAKS (Josh, 2026-09-30 ~22:45, after using it):
Footer right-group push (Publish back on the bar before ⋯ More), ⋯ More
dropped VIEW and KEY SIGNATURE (View ▾'s own Tracks/Score and the LCD key's
tap-to-edit cover both — nodes kept hidden for the code/tests that still
drive them by id), ⋯ More promoted to a real window (makeWindow, dockable,
remembered position). Help sheet + HELP.md updated (the `key: picker` FEATURES
keyword now points at the transport display). tests/night-roll.test.mjs: new
footer-markup test; tests/e2e/docking.spec.mjs WINDOWS gained "moresheet".
See NIGHT-ROLL.md "Footer v2 tweaks (Josh, 2026-09-30, after using it)".
(He also found the Mixer and likes it.)
PS2 UNPARKED 2026-10-01 (Josh: "continue to work on PS2 stuff then"). Was: PS2 PARKED (Josh, 2026-09-30 ~21:55: "we're spending a lot of money on it…
I never even played FFX… just do whatever you think is best"). Finishing
only what protects every console: the OOM crash fix + import recovery, and
the streamed player (step 3, default off). PARKED until he asks: FFX ch30/31
no-instrument rule (his M/mute ear test is optional), Q1 FFX pitches,
FFX/Dark Cloud tuning, streaming steps 1a/1b/1d/1e/4/6.
DONE 2026-10-01: streaming step 5 ("auto") — streams a song ONLY where the
whole-render plan for it would downgrade (mono/a lower rate) or refuse;
default stays "off" either way (he hasn't A/B-listened to stream mode for
real yet — item 5 of the weekend list). See docs/streamed-render-plan.md
step 5, NIGHT-ROLL.md "'auto' (2026-10-01...)".
FFX CHANNELS WITH NO INSTRUMENT (Josh's ear, 2026-09-30, Challenge ch 30
"sticks out like a sore thumb" vs the game on YouTube): the BGM tracks have
notes but never a program change (0x20) — Challenge ch30/31, Hurry!! ch14,
Djose Temple ch9/12, Tragedy ch11. tools/ps2/bgm.mjs parseTrack defaults
them to program 0 (to stop silence) — an unvalidated guess, now known wrong
for ch30. Research (2026-09-30): no source documents it. VGMTrans emits no program
for such a track (implicit MIDI 0, same as ours); 0x60 is a common init
flag (775 uses, 773 on tracks that DO get 0x20) — not the answer. Two
generic candidates: (a) program 0 (today), (b) the driver never sounds a
voice with no instrument → silence. EAR TEST for Josh: mute ch 30 + ch 31
(M) in Challenge and compare to the game recording. If muted matches, the
rule becomes "no 0x20 → silent + a capture warning" for all 6 channels.
DONE 2026-09-30 (Josh's ruling that evening, replaces Q4's one-tap/no-form
detail): the capture's header button is "✎ Edit" (renamed from "✎ Make it
mine", `#makeitminebtn` id unchanged); it opens the "Edit a copy" sheet
(reused Save As form, `openSaveForm("editcopy")`) — Name defaults to the
song's title (editable), folder to `my-covers/` or the last one used, same
picker Save As has; confirm forks the copy the same way `makeItMine()`
always did, clash-suffix included. Captures/starters stay locked; the copy
is the editable one. Help sheet/HELP.md, the FEATURES drift keyword, and
the makeItMine tests (now driving the sheet: default name, a custom name,
clash suffix) all updated — see NIGHT-ROLL.md "Origins, RULES...". Also
done: the header never overlaps now — `.hdrleft`/`#songcrumb`/`#nowchip`
are real flex items (was `position:absolute` guessing widths), the crumb's
folder shrinks before its title, the Claude status chip goes icon-only
before it would crowd the title (NIGHT-ROLL.md "Header layout"); Settings
tabs scroll horizontally instead of disappearing before the content
(NIGHT-ROLL.md "Settings sheet: tabs scroll"). Browser-verify at 1376 and
1024 px with a right dock open still owed (not done from this session).
DONE (4cd9768) SMALL (P1 builder, 2026-09-30): the Publish sheet's "edited since publish"
check (draftFingerprint/pubCompareDraft ~L15336) special-cases tempo baking
but not meter — a meter-only edit may not show as edited until published.
EAR CHECK (2026-09-30): on the iPad, FFX Challenge now renders mono at
24 kHz to fit 600 MB (was 1.9 GB stereo 48 kHz → killed). Josh's ear decides
whether that's acceptable until the streamed render lands.
DONE (25cab92: the tap uses the instrument sounding at that note) BUG (Josh's ear, 2026-09-30 17:57, FF7 "You Can Hear the Cry of the
Planet"): choir/human-voice parts sound right in playback but a TAPPED note
sounds wrong. PS1 already has a console tap preview (tools/note-preview.mjs
renderOneNote, chipPreviewCache ~L9677) — so find why these voices miss it:
fell back to synth (log which path played), or findTemplateNote picked the
wrong program/sample for the track. Fallback idea if the one-note render
can't match: play a slice of the track's rendered buffer at the note.
DONE 2026-09-30: the AI message box is on its own full-width row, buttons
beneath; ~4 lines, grows to ~8, then scrolls (browser-checked at a 700 px dock).
AFTER THE BUDGET FIX (2026-09-30, Josh asked how Logic handles big songs):
stream the console render like a sampler — render ~10–20 s chunks just ahead
of the playhead, mix non-soloed tracks to one stereo bus, keep per-track
buffers only for tracks being muted/soloed, free behind the playhead. Whole-
song all-tracks buffers (1.9 GB for FFX Challenge) become the exception
("freeze"). Report peak memory before/after.
DONE (Josh via Ask, 2026-09-30 17:19, shipped 2026-09-30): every message to a
Claude bridge backend (♪ song, ✦ Ask, ⌨ Terminal) carries a "New since your
last message:" block so he never copies/pastes: NEW ⚠ errors (+ [debug] when
Debug log is on) and NEW setInfo status lines since his last message in THAT
chat, each capped at 20 lines/"(+N older)"; ✦ Ask/⌨ Terminal (no song context
of their own) also get a compact open-song line (title, path, published/
local, view, cursor bar.beat, playing/paused) reusing the song chat's own
wording. Per-chat "seen up to id" cursor (askSeenKey/askSeenAdvance,
localStorage, device-local) advances right after a send. Mark-as-read: a
cross-chat watermark (askSeenMax) drives the ⚠ badge (now shows UNREAD, not
total) and greys already-sent lines in the ⚠ Messages sheet. Learning mode is
the law: every logged line is tagged with the mode active when it was pushed,
and a Learning-mode build drops anything tagged Normal, whatever it says —
tested (mode-switch mid-session). askContext/askTerminalContext,
NIGHT-ROLL.md, help sheet, 6 new tests ("P7 bridge context" in
tests/night-roll.test.mjs). QUEUED, not done here: the Status window
(#infosheet) still shows only the current message (no history/grey/unread
count) — its 2026-09-29 test pins tapping it to reveal infoFull byte-for-byte,
and giving it the same treatment as the ⚠ sheet needs that contract
renegotiated first.

1. DONE: window manager phase B (drag-to-dock, tabs, Status not
   dockable, near-full divider). Josh (via Ask, 20:52): "really happy
   with the docking as it is" — NO more window-manager scope beyond
   what's built.
2. DONE: Renaming a song keeps its unpublished recording (`idbAudioMove` in
   `renameLocalKeys`, beside `idbDraftMove`).
3. BUILT, awaits Josh's ear (lock the iPad mid-song, synth song): Background playback skipping: schedule further ahead while
   `document.hidden` (the pump's 0.6 s look-ahead). Own build; ear test
   on a synth song.
4. DONE: Publish window: every row gets Open / Publish (that song only, as a
   job) / Revert (in-app confirm). Open no longer needs a draft.
5. DONE: Album links: the URL holds the album during album play;
   opening it shows the album ready; one Play tap runs it.
6. BUILT (needs the bridge restarted + the iPad build; Josh tries it): Camera button in the AI panel: send a screenshot of the app through
   the bridge (Josh: "I wish there would be a way for me to send you
   screenshots from the app itself").

7. DONE: Breadcrumb says Published or Local first (Josh via Ask, 2026-09-29):
   "Published › SNES › Final Fantasy 4 › Song" / "Local › Night Roll
   Sketches › Song"; the word never truncates, the folder/title does.

8. DONE: Play waits for the song (Josh, 2026-09-29: "the play button
   should not even be enabled until everything is loaded … once it hits
   100% it turns into the regular Play button"). ▶ disabled with a
   percentage while the chip source is found/fetched/rendered, song
   soundfont/game voices decode, audio clips decode; songs with nothing
   to load never flash disabled; a failed load enables Play and says why
   (synth fallback); a tap during loading does not queue a play; album
   auto-advance waits the same way. No modal. (Stopgap shipped: play()
   waits on chip.resolving.)
9. BUILT (vm tests green; not yet browser-verified or pushed): "What is
   Claude Code doing" status (Josh via Ask, 2026-09-29: "I wish I had a
   way to see what Claude Code was working on from here"). `claude-bridge.mjs
   --status "…"` (`--status ""` / `--status-clear` clears) stores one
   current line + the last 10 with times (`status.json` beside
   `inbox.json`); GET/POST `/v1/status`. The app shows it as a quiet strip
   atop the general chat and a "Now: …" row in ⏳ (always), piggybacked on
   the 60 s inbox poll and on open; tap for Recent (last ~10 + the last 3
   commit subjects from origin/main, fetched at most every 5 min). Nobody
   is calling `--status` yet at real steps (start, tests, pushed, iPad
   build) — that's the next wiring, once Josh has tried the strip.

10. DONE: AI panel at narrow dock widths (Josh's screenshot, 2026-09-29): below
    ~360 px the input goes full width with Speak / 📷 / Send in one row
    under it; the dock pill shortens to "Right ▸" (full text as its
    aria-label); tabs don't stack. Low priority.
11. FIXED (drawScore ignored skipCursor, so the cached scene kept a baked
    playhead and the overlay drew a second at roll geometry): Score view, playing: two gold playheads with ruler triangles (bar 1
    ~1.1 and bar 2 beat 1) — a ghost of the play-start or a stale frame?
    If intended, make it look different (thin, dim, dashed).

12. DONE: Each view keeps its own zoom + scroll (Josh, 2026-09-29): Roll →
    Tracks → Score → Roll lost a fully zoomed-out roll (33 bars → ~6).
    Per-view {zoom, x, y} saved on switch, restored before
    buildScoreModel/clampView can clamp it; views independent.

(The close guard below is moot since save model B: every edit is kept, nothing to lose on a song switch.)
(Leftover-recording cleanup: PARKED on purpose 2026-09-30 — under save
model B a Version can reference a recording, so deleting "orphaned" bytes
on revert/delete would break going back to that version. Needs a
reference count across versions first; only disk space is at stake.)
(Copyright + license line in index.html's header: already there.)
Queued, not now: the close guard ("SAVE CHANGES TO <song>?" on song
switch); delete leftover recordings on song delete/revert; two timeline
views at once.

PARKED (Josh: "I wouldn't want to think about it right now"): locking
published/imported songs' music. Two options on the table: (a) the
notes are set in stone, only annotations edit; (b) editing makes a
personal copy. He leaned toward locking both kinds.

## DAW WORK ORDER (Josh via Ask, 2026-09-29: "Can we start working on this stuff") — (a) DONE, (b) DONE (M silences + dims, S solos, H hides; all saved in track: annotations); metronome follows the song by default; ⏱ toggles, ⚙ settings; (c) DONE: the Apple Pencil grabs/draws at once (Settings → Other to turn off), fingers still dwell; (d) DONE: Return/K/C/R/⌘←→, ⌘A, ⌘X, ⌘D; (e) DONE for track changes (voice/color/vol/pan/M/S/H are ⟲ steps) — undo across song switches NOT done on purpose: entries hold note indexes that a reopened draft renumbers (setSong's comment); would need identity-keyed entries; (f) DONE: a note tap leaves the playhead alone (Settings → Other restores), + Note anchors at the tapped note; (g) DONE 2026-09-30: recording keeps what you played by default (raw, no input snap) — Settings → Other → "Snap while recording" (off by default) restores the old always-snapped input; a new Q Quantize command (edit row, Edit ▾, hardware key Q) snaps the selection afterward, 100/75/50% strength, optional "also quantize note ends", one ⟲ step (reuses selEditApply's mod/batch undo, same as divide/nudge/transpose). tests/night-roll.test.mjs: raw off-grid start, the pref restoring snap, and the quantize strength/undo behavior.
(a) count-in from anywhere + one-tap metronome · (b) mute/solo silence
only, saved with the song (track: annotation; hide stays separate) ·
(c) Pencil draws/edits instantly, fingers navigate · (d) keyboard
shortcuts + Select All / Duplicate · (e) undo coverage · (f) selecting a
note doesn't move the playhead (maybe a pref) · (g) raw recording +
Quantize. Save model (#1): advisor drafting 2–3 models for his ruling —
build nothing until he picks. iPad CoreMIDI plugin: DONE 2026-09-30 (Web
MIDI already works in desktop browsers — his son used it on a MacBook;
the iPad's WKWebView has neither, so the CoreMidiPlugin in night-roll-app
ios/App/App/AppDelegate.swift bridges a keyboard plugged into the iPad —
one MIDIClient + input port, connects every source, reconnects on setup
changes; running status expanded native-side; index.html's initWebMidi
picks Web MIDI or the native bridge automatically and both land in the
same midiMessage()). NEEDS JOSH'S TEST with a real keyboard on the iPad —
untested on hardware.

## DONE 2026-09-30: a console voice that fails to load says why; ▶ retries
Josh: "sometimes the instruments never load" (▶ enabled at once, synth,
no error). A lookup that FAILS (album info didn't load, the console file
or library didn't download, the render threw) now sets chip.fail with the
reason, shows "⚠ the console voice didn't load: <why> — tap ▶ to try
again", and the next ▶ re-runs the lookup (the ⏳ gate then waits for it).
Debug log (Settings → Other) lines "song open: console source …" say
which path ran. A song with no console source at all still plays synth
without a warning. If it recurs, get the Debug-log lines from Josh.

## PHASE 1 + PHASE 2 DONE 2026-09-30: THE FILE'S OWN LABELS vs THE LEARNER'S ANSWERS (Josh, 2026-09-30 08:41) — the tempo ruling still open
Spec: docs/declared-vs-learner-spec.md (advisor). Today: his answers never
reach the .mid (good); but import DROPS the file's key label, keeps only
the file's LAST meter, notes.txt leaks the file's meter in Learning, and
Normal's import seeds annotations without a tap (rule break). Build: keep
the file's labels as a `source` record (draft + .mid, verbatim); his
answers annotations only; an on-demand "Check vs file" in ☰ Notes (KEY /
METER) — Learning never reveals the file's value.

Phase 2 (spec "B"): the REST of a foreign file — text/copyright/
instrument-name/lyric/marker/cue metas, extra track-name metas, program
changes, channel pressure, pitch bend, every CC but 10 (pan)/70 (duty, and
only for a non-foreign parse — a foreign file's CC70/poly aftertouch are
never read as chip duty/envelope), SysEx, and empty tracks (e.g. the
conductor's own name/text) — now rides along too, verbatim, per original
track, as `source.metas`; both writers (index.html's writeMidi,
tools/nsf/midi-write.mjs's writeSongMidi) re-attach a track's raw events by
its ORIGINAL index (`tr.srcIndex`, set at import — never by name, so a
rename keeps them and a delete drops them), and merge an originally-empty
track's events into the written meta/conductor track since it was never a
Night Roll track a delete could apply to. No UI anywhere reads
source.metas (markers/lyrics/text stay the composer's own analysis,
preserved not displayed, same as Phase 1's key/meter labels). Docs:
NIGHT-ROLL.md "P2 phase 2". `npm test` green, full suite.

RULING FOR JOSH (later, not blocking): the two publish paths write
different tempo maps (baked tempo: annotations vs base) — which is right?

## AWAITS JOSH'S EAR: FFX pitches after a fresh capture (2026-09-30)
The gated re-capture refused FFX: 4 songs come out at different pitches
from today's PS2 pipeline than when first captured — Blitz Off (a part
85→38, others 52→50), Hurry (a track 67→60), Ominous (74→62), Welcoming
of Maester Mika (64→56). The pipeline's pitch handling changed since
(wd.mjs key ranges, held bends). Which is right is his ear's call: play
the published song vs a fresh capture (I can put the fresh ones on a
branch/preview). Separately DONE: 5 FFX songs (Blitz Off, Assault,
Challenge, Other World ×2) moved off the drum channel with identical
notes (71bba3b) — the OLD writer wrapped a 25th+ track onto channel 10.

## NEEDS JOSH'S RULING (not blocking): annotations file format v2 (FORMATS AUDIT #3)
.rollnotes.json is JSON wrapped round a text grammar (unknown kinds of note
are silently dropped by an older app; version still 1; no schema). The fix
(typed fields, version 2, keep unknown fields) would REWRITE every
annotation file on its next publish — a one-way change to his data, so it
waits for his yes. Plan when he says go: a v2 reader that still reads v1,
write v2 only for songs he edits, a JSON Schema in docs/.

## DONE 2026-09-30: every capture album re-captured through the shared MIDI writer (FFX excepted — its fresh capture changes pitches; awaits Josh's ear)
PS2 (FFX, Dark Cloud) and all six PS1 re-captures were REVERTED: the new
writer used each note's capture channel, and a console voice number that
mapped to MIDI channel 10 put melodic parts on the drum channel (Josh:
"the entire album … really bad"). Fixed in both writers (only a kit track
may use channel 10) with a test. NES / Game Boy / SNES re-captures were
clean (scanned: 0 affected) and stay. Verified the fix on a scratch FF7
re-capture: 90/90 songs with IDENTICAL notes to the published ones, 0 on
channel 10. PS1/PS2/N64 resumed 2026-09-30 with a GATE (tmp/
recapture-writer2.sh): an album commits only if every song's notes equal
the published ones and nothing melodic is on channel 10.
(Original entry:)
So published songs get back the pan / duty / envelope data the old writer
dropped (FORMATS AUDIT #1). One push per album, only existing .mid files
replaced, annotations untouched (tmp/recapture-writer.sh). Skipped: FF1
(pipeline-written, already carries duty; Josh's annotations), and albums
whose rip isn't on this Mac: Chrono Trigger, FF4, FF5, Mega Man 2, TMNT 2,
Final Fantasy Legend — re-download their rips to include them.

## AWAITS JOSH'S EAR: other apps' audio (2026-09-30)
YouTube stopped the moment he switched to Night Roll: the page asked
WebKit for a "playback" audio session (doesn't mix) when the audio engine
was created on the first tap. Now "ambient" (mixes) until Play or the
metronome, "playback" while playing, back to "ambient" on Stop (not
mid-album, not off-screen). Test: YouTube playing → open Night Roll (keeps
playing) → Play (YouTube pauses) → Stop. ALSO re-check background play
(lock the iPad mid-album). If audio goes wrong: revert this one commit
(iPad audio known-good rule).

## DONE 2026-09-30: MODEL PICKERS IN THE ⌨ TERMINAL TAB (Josh, 2026-09-30) — the terminal session reads GET /v1/terminal-prefs before each Agent launch
"I should also have the ability to change the model from here … the
advisor's model and any sub task models." Two pickers in the Terminal
tab — Advisors (read-only reviews) and Builders (implementation agents):
Opus / Sonnet / Haiku / Fable — stored on the bridge (GET/POST
/v1/terminal-prefs); the terminal session reads them before every
Agent launch. The terminal session's OWN model can't be switched
remotely (Claude Code's /model, typed at the Mac). The Ask tabs already
have their model menu (claude-code-opus/-sonnet/-haiku/-fable).

## ARCHIVE MOVE — WAITS ON JOSH'S GO, tomorrow, needs his token change
Prepared on branch `archive-to-joshcough` (e23a2bf, pushed, NOT merged):
Night-Roll-App/nsf-archive → joshcough/night-roll-archive (the name the
app's "create mine" already uses). The branch has the new defaults, a
read fallback to the old raw URL, and a second optional "Archive token"
in Settings → GitHub. The exact steps (a–e) are in that branch's
open-items. In short, for Josh:
1. GitHub → Settings → Developer settings → Fine-grained tokens → new
   token, resource owner joshcough, only the archive repo, Contents:
   read and write.
2. Keep the main token (resource owner Night-Roll-App, night-roll,
   Contents: read and write).
3. Say go: I transfer + rename the repo, merge the branch, build the
   iPad; he pastes the archive token into Settings → GitHub.

## PRIVATE REPO / PROTECTION — ADVISOR (2026-09-29; Josh: "am I being overly cautious?")
Verdict: now nothing; stay public. Pages sites are always public (the
served index.html is downloadable); Pages from a private org repo needs
GitHub Team ($4/mo/seat) — and private CI gets ~3,000 Actions min/mo
(check `gh run list` durations first). Songs + nsf-archive must stay
public (tokenless raw fetches, share links, README list, the iPad app).
Minify/obfuscate: skip (hours to undo; breaks one-file/no-build, harness,
readable iPad traces; the IPA is a zip anyway). Real protection: LICENSE
is PolyForm Noncommercial (792e432 — close any stale "awaiting his yes"
line), add a copyright/license line to index.html's header, one-time
secrets scan (DONE 2026-09-30: night-roll and the archive's full
history — no GitHub, Anthropic or AWS tokens), maybe a
"Night Roll" trademark search before marketing. Bigger legal risk: the
game-music archive (DMCA; Apple review) — decide at App Store launch
with TWO PRODUCTS (store edition without rips?). At launch, optional:
code repo private on Team + songs in their own public repo (songsRepo/
analysisRepo settings already separate; APP_REPO, shareLinkFor,
README target change once). What private WOULD hide: the design docs
and roadmap (NIGHT-ROLL.md, open-items.md) — Josh's instinct is right
for those, not for the code.

## AI SESSION CONTROLS — DONE 2026-09-30 (Josh via Ask, 2026-09-29 23:21–23:23)
The general bridge session was at 172 turns; the app's Clear chat only
cleared this device's log and never told the bridge, so the same Claude
session kept being resumed and growing. Built exactly as scoped:
1. Clear chat really resets: DELETE /v1/sessions/<key> drops that key's
   session id in sessions.json — the next turn starts a brand new Claude
   Code session (a fresh --session-id, never --resume); .ask.md and the
   inbox untouched. The app's Clear chat (after its existing confirm)
   calls it whenever the backend is the bridge.
2. Compact: POST /v1/sessions/<key>/compact runs the REAL `/compact` slash
   command non-interactively — `claude -p --resume <id> … "/compact"` —
   verified against a live throwaway session first; no summarize-into-a-
   new-session fallback was needed. Its stream emits a `compact_boundary`
   line with the exact before/after context size (pre_tokens/post_tokens),
   which the endpoint returns as-is. App: a **Compact** button beside
   Clear chat (in-app confirm), status line "compacted: 172 → 1 turns ·
   ~24k → ~3k tokens".
3. Usage per chat tab: the bridge sums each turn's stream-json "result"
   event (usage.input_tokens/output_tokens/cache_read_input_tokens/
   cache_creation_input_tokens, total_cost_usd — the real field names,
   found the same way) into sessions.json; GET /v1/sessions/<key> →
   {turns, tokens, cost}. App: a line under the tab strip, "N turns ·
   ~Nk tokens · $N.NN", hint "— long, Compact saves tokens" past 40
   turns; refreshed after every reply and on tab switch.
4. Plan-quota %: exposed for free — every turn's stream-json (and
   /compact's) already carries a top-level `rate_limit_event` line with
   this account's five-hour and seven-day utilization, no extra `/usage`
   call needed. Bridge keeps the last one seen; GET /v1/status returns it
   as `quota`. App shows it once, in ✦ AI's Recent (tap the Now: strip):
   "plan usage: N% this session · N% this week".
5. Visible only with the Claude Code bridge: askCaps now carries
   `sessions` (from /v1/status's new `sessions: true`, also added to
   /v1/jobs), gating the usage line, Compact button, and the plan-quota
   line — LM Studio/Ollama users never see any of it.
Files: tools/claude-bridge.mjs (sessionFor/sessionUpdate usage fields,
recordQuota, runCompact, the /v1/sessions/:key(/compact) routes); index.html
(#asksessionline, #askcompact, askSessionRefresh/askSessionRender,
the Clear chat and Compact handlers). Tests: tests/bridge.test.mjs (usage
accumulation, DELETE really resets to a fresh --session-id, compact's
exact before/after, a chat with no session yet is zeros not a 404).
NIGHT-ROLL.md "AI session controls"; help sheet "Session usage and
Compact" + FEATURES drift keyword.

## LEARNING vs NORMAL MODE — P0-P4 SHIPPED 2026-09-30 (advisor, 2026-09-29; build after the save model)
P0-P3 built as one change set: appMode()/ff1roll-mode + migration (early
boot block), P1 lasso chord auto-names in Normal, P2 MIDI import writes
timesig:/key: annotations in Normal only (tempo always applied — never
gated, it's the playback map not a discovery), P3 estimateKey
(Krumhansl-Schmuckler) + sfShownAt/keyNameShownAt route every display
call site (spelling, score key sig, degrees, find:, ◯5, LCD "Gm~", the
keysel "estimated — tap to set" label + Set-this-key button). Learning
never calls estimateKey (spy-tested). Tests: harness.mjs/e2e helpers pin
Learning by default so the existing suite is unaffected. Help sheet +
FEATURES keyword + NIGHT-ROLL.md section done (see its "Learning / Normal
mode" section for the full writeup).
P4 SHIPPED 2026-09-30 (built by a delegated Sonnet session, plan-then-
delegate): ASK_SYS split into shared BASE + RULE_LEARNING (yesterday's
"THE RULE…" paragraph, verbatim) / RULE_NORMAL ("Answer music questions
directly…"), picked by a new askSys() at send time — replaced every read
of ASK_SYS (askRun, askEstimate, askTakePrompt/✦ Fill). askContext/
askSpanNotes: Learning is BYTE-IDENTICAL to before (golden-snapshot test
+ the existing estimateKey spy, now covering askContext/askSpanNotes
too); fixed the leak where askContext read #keyunset's live label
(factored into a new keyLabelState(), reused by finalizeNotes so there's
one computation, not two) — Normal now states "key state: declared X" /
"estimated X (Krumhansl, confidence c)" / "undetermined…", plus a bare
"mode: normal" line (absent in Learning — that absence IS the bridge's
convention now, see below); the lasso line names the chord in Normal
("— chord: C (no 5th)") via the same nameChord() as P1's selection strip,
unchanged in Learning; askSpanNotes spells by the estimate and says so
in its header when Normal has nothing declared over the span. The
welcome bubble and the general-chat tutor-rule line are per-mode text.
tools/claude-bridge.mjs's BRIDGE_SYS_READ/FULL swapped "keys and analyses
are the user's discoveries" for the mode-line convention ("no mode line
= learning" — older app builds stay safe by construction). Help sheet
"House rules" dt + FEATURES keyword + NIGHT-ROLL.md's P4 writeup done.
Six new tests in tests/night-roll.test.mjs (search "P4:"). Browser-verify
+ push still needed for P4, same as P0-P3 below.
P6 BUILT 2026-09-30 (not yet browser-verified/pushed): Normal-only View ▾
→ "🔍 Analyze ▸" — a dashed/outlined VIEW layer on the roll (below the real
section/chord bands), never written to rollnotes. Per-bar chords reuse
bsInferTimeline (all non-drum tracks, seedRng pinned to the top-scored
candidate for determinism) + nameChord (on the real sounding pitches, not
bare pitch classes, so inversions read correctly); key is ONE whole-song
region reusing estimateKey() as-is (the spec's "cheap else one per song"
fallback — a real per-8-bar window would need a second K-S census
implementation). Off every session by default; a song change or a flip to
Learning (applyMode()) turns it off at once and cancels any pending
debounced recompute (saveEdits() schedules one, 400ms, on note edits —
never per frame). Tap a band to Adopt it (writes chord:/key: through the
usual annoSnapshot/pushUndo("anno") path, one ⟲ step) or, from a chord
band, Adopt all chords (every pending band, still one ⟲ step). Fixed a
latent harness gap while testing: applyMode() wrote document.body.dataset
unconditionally, and the vm harness deliberately has no document.body (its
own "vm harness" sentinel) — guarded, no behavior change in a real browser.
Tests: search "P6" in tests/night-roll.test.mjs (Learning absence + spy on
bsInferTimeline/estimateKey, Normal C-F-G-C fixture, mode-flip-cancels-
debounce, Adopt/Adopt-all undo-step counts, notes.txt/askContext
untouched). Help sheet "views" dt + FEATURES keyword + NIGHT-ROLL.md's P6
section done. NOT done: browser-verify (screenshot) + push.
Learning = today (nothing volunteered; Ask AI hints). Normal = keys,
meters, chord names shown (estimates marked "~"/"estimated"; never
written as annotations without a tap). One device-global switch: View ▾
"🎓 Learning mode" + Settings → Other. Default: a device with existing
Night Roll prefs → Learning (Josh's Mac + iPad); a fresh install → Normal.
~15 hiding places inventoried (keyunset/"not set (C)", LCD "C?"/"4/4?",
sharp spelling, score key sig, degrees, find:, ◯5, Chord?, Check labels,
Ask's ASK_SYS/askContext/welcome, bridge prompt). Lasso chord naming is
free (nameChord exists); the key needs a new estimateKey (Krumhansl–
Schmuckler, ~30 lines). Build: P0 plumbing (harness + e2e pinned to
Learning FIRST) · P1 lasso chord · P2 meter/labels (+ Normal imports
write file timesig/key) · P3 estimateKey + sfShownAt · P4 Ask per mode ·
P5 docs · P6 Normal "Analyze ▸" (built 2026-09-30 — see the P6 writeup above).
NEEDS JOSH (his rulings): (1) the CLAUDE.md "Keys/analyses" rule gets a
scope — proposed: "Learning mode is the law … Normal mode (other users,
one device switch) may show keys, meters and chord names, labelled as
estimates, never written without a tap, never leaking into Learning or
repo files; Claude sessions with Josh follow Learning rules regardless."
(2) should a MIDI file's own meter/key be applied on import in Learning
too? JOSH RULED (23:09, his words via Ask): "you have to determine the meter
by reading the music; there's no way we should tell them this song is in
3/4 or 6/8." Learning: an imported file's METER and KEY are neither
applied nor shown (the usual "4/4?" / not-set defaults; the file's values
kept as unrevealed data); TEMPO applies. Normal applies all three.
(1) DONE: CLAUDE.md reworded ("Learning mode is the law") — Josh gave
permission directly in the terminal, 2026-09-29.

## SAVE MODEL B — SHIPPED 2026-09-29: always kept; ⌘S = Save Version (music + annotations, last 20, device-local); File → Versions… (Go back to this keeps a "Before going back"); Publish separate; not connected = no Publish button, no ●; ✎ Edit locally without a confirm.
Also decided (Josh: decide, don't ask): metronome = tap ⏱ toggles the
click, a small ⚙ beside it opens settings; ✎ Edit locally happens on the
first edit with a footer notice, no confirm.
Follow-up decided (advisor, Josh asked 22:53): menu says "Save Version"
(⌘S), never plain "Save"; status "Version saved — only on this iPad";
"Versions…" beside it; "Publish…" keeps its word with a subtitle ("to
GitHub" / "to folder <name>"). Footer Publish (N) shows only when GitHub
or a folder is connected AND N > 0; Publish… always in File (unconnected:
the sheet says how to connect). ● = not published yet (music,
annotations or chat); only Publish clears it; hidden when nothing is
connected (a local-only user's work is always kept; Versions are the
save points).
(Advisor notes:)
Verified: Save (⌘S) checkpoints MUSIC ONLY (annotations not saved, not
shown by ●, not reverted); ● has three meanings; "Save" means a fourth
thing in folder mode; the Publish sheet's "edited since last save"
means since Publish.
A. "Everything is kept; Publish sends it": Auto-save always; Save goes;
   "Throw away my changes" / "Bring back my changes". S.
B. "Always kept, plus versions" (Logic/GarageBand): ⌘S = Save Version
   (music AND annotations, dated, device-local, last ~20); File →
   Versions… lists them + the published copy; going back keeps a
   "Before going back" version; Publish separate; ● = not published. M.
   (Recommended; A is a smaller first step toward it.)
C. "Save puts it in the repo": ⌘S publishes. Conflicts with his rule
   that publishing is deliberate. S–M.
Open question with it: does "✎ Edit locally" keep its ask-first confirm?
Stale wording list (help + UI strings, ~20 places incl. "Sync") is in
the advisor's report — fix it together with whichever model he picks.

## FORMATS AUDIT (advisor, 2026-09-29; Josh: "all that stuff is suspect … how do normal DAWs save everything about the song?") — #1-2 DONE on branch shared-midi-writer (2026-09-30); rest not built

Top findings, highest risk first:
1. DONE (branch shared-midi-writer, 2026-09-30). Imports used to LOSE data
   on publish: commitImports re-encoded captures with the app's writeMidi,
   dropping CC10 pan, CC70 duty, aftertouch envelopes and per-note channel
   the capture writer produced. Fix: ONE writer's logic — index.html's
   writeMidi is now a tested, byte-for-byte hand port of
   tools/nsf/midi-write.mjs's new writeSongMidi (it can't dynamic-import
   that module: writeMidi runs inside plain click handlers and the vm test
   harness, neither of which can `import()`, and there's no build step to
   bundle it in — see writeMidi's own comment in index.html). The
   draft-building call sites (import capture, dropped-MIDI-file import,
   openDraftDoc, forkCurrentSong/Save As, publishDraftSong) now carry
   tr.midiPan/offset and n.ch/duty/ve through to it too — the pan was
   being dropped a step before writeMidi ever ran. Old published capture
   .mids (already missing pan/aftertouch) are unaffected — nothing was
   re-published; next re-import/re-capture of the same source will carry
   them. tests/night-roll.test.mjs: writer parity + round-trip tests;
   tests/nsf.test.mjs's parity test TODO updated (duty now survives).
2. DONE (branch shared-midi-writer, 2026-09-30), same fix. writeMidi now
   writes a key signature (0x59) ONLY when the song already declared one
   (round-tripped from a file that had it, e.g. via tools/fix_keysigs.py —
   never invented, Learning mode is the law); track names are proper
   VLQ-length UTF-8 (a >127-byte name no longer corrupts the file;
   non-Latin-1 names no longer mangled — parseMidi decodes UTF-8 with a
   latin1 fallback, so every already-published name, all ASCII, still
   reads exactly as before); per-note channel (n.ch) survives, else a
   track falls back to one of 15 cycled melodic channels that never
   collide with the drum channel (9), whatever the track count. STILL
   open: one meter per song (matches the app's existing "one meter per
   song" model — not attempted), no program changes, no markers — none
   of these were asked for on this branch.
3. .rollnotes.json is JSON wrapped round a regex text grammar: unknown
   types become empty notes (an old build silently drops a newer file's
   data); version still 1 since audio/lane/vol/pan were added; no JSON
   Schema; editability hangs on a prose "moved from" note.
4. Same fact in several places: meter (.mid, timesig: note, ff1roll-ts-,
   draft), tempo (.mid baked vs draft base), titles (album.json vs
   manifest.json, both written by the app AND build_manifest).
5. Device state spread over ~12 key prefixes in three shapes; the local
   Save checkpoint leaves out annotations; localStorage's quota caps songs.
6. Outside assets referenced by storage path (game: ids broke once in the
   archive move) and sf2: by slug with no content hash.
How DAWs save: one project package (Logic .logicx / GarageBand .band are
folders; DAWproject is a zip of project.xml + metadata + media): one
versioned document (tracks, instrument state, mixer, automation, tempo +
meter maps, markers, metadata) + an audio pool folder; undo, window
layout and caches are NOT saved. Night Roll song package sketch:
<song>/ song.mid (full SMF from the shared writer) · song.rollnotes.json
(v2, typed fields, schema) · audio/ · refs.json (pinned outside assets
with hashes) · ask.md · notes.txt (generated); device-local: working
copy + checkpoint (with annotations) in ONE IndexedDB record per song.
Migration order: shared writer → rollnotes v2 (reads v1) → one device
record → folder layout (flat albums stay readable).
KEEP as is: .audio/ pool, the game-instrument JSON+WAV master with
SF2/SFZ export, the archive repo tier, device prefs local, .ask.md.

## DAW CONVENTIONS REVIEW (advisor, 2026-09-29; Josh: "rival the best DAWs") — nothing built

Ranked, most annoying first (effort S/M/L):
1. Three save verbs (Save / Publish / Sync), auto-save off by default,
   and the help contradicts itself on what Save and ● mean. DAWs save
   continuously; sharing is separate. S (help) / S (auto-save on) / M (one model).
2. No external MIDI keyboard on the iPad (no Web MIDI; the shell has no
   CoreMIDI plugin). M–L (CoreMIDI plugin) — still open.
   DONE 2026-09-30: raw take + Quantize (see "DAW WORK ORDER" (g) below).
3. Count-in only from bar 1; the metronome is a sheet, not a one-tap
   toggle. S.
4. Mute also HIDES a track and solo hides the rest; neither is saved
   with the song. DAWs: mute/solo silence only (hide is separate) and
   persist. S–M (track: annotation).
5. Apple Pencil treated as a finger (160 ms dwell; a fast stroke pans).
   iPadOS apps: pencil draws/edits instantly, fingers navigate. S–M.
6. Thin hardware-keyboard coverage: no Return (to start), ⌘X, ⌘A, ⌘D,
   C (cycle), K (metronome), R (record), zoom keys. S.
7. No Select All, no Duplicate/Repeat. S.
8. Undo gaps: voice/color/volume/pan changes and mute/solo aren't
   undoable; undo is wiped on song switch. S.
9. Tapping a note moves the play cursor (DAWs: selection never moves
   the playhead). S (maybe a device pref).
10. DONE (2026-09-30, branch `offline-export`): Download audio now
    bounces OFFLINE via OfflineAudioContext (renderSongOffline) —
    intro + one pass, loop/cycle both ignored (the real-time path's
    "an armed cycle may loop the bounce" quirk is not inherited: the
    offline path always renders the whole song from 0, matching the
    documented "loop off"), through the same voice/chip/sampled/
    game-instrument/clip code live playback uses. 16-bit WAV (own
    encoder, no dependency). iPad app: hands the file to the native
    share sheet via @capacitor/share (Capacitor.nativePromise, cache
    dir via @capacitor/filesystem) — Files/Messages/AirDrop/etc.
    instead of a bare browser download. Real-time MediaRecorder
    (m4a/webm) kept as the fallback for a browser with no
    OfflineAudioContext, refactored unchanged into recordRealtimeAudio.
    Tests: wavEncode header/samples, offline-vs-fallback selection,
    native Filesystem→Share call shape (tests/night-roll.test.mjs).
    See NIGHT-ROLL.md "Audio export — Download audio". Open question:
    should the real-time fallback path ALSO stop respecting an armed
    ruler cycle (today it still can, via play()'s own `cycling` branch —
    pre-existing, not touched here) for full parity between the two
    paths? Low stakes since the fallback only fires without
    OfflineAudioContext, essentially never in practice.
11. DONE 2026-09-30 (implemented, NOT yet committed/pushed — Josh or the
    terminal session should review and commit): Mixer window — a strip
    per track (fader, pan, M/S/H, a live RMS meter) plus a master strip,
    scrolling sideways inside its own dockable window (makeWindow,
    View ▾ → 🎚 Mixer, hardware key X); drag a strip by its name to
    reorder song.tracks itself (the .mid's own order — editable songs
    only, one ⟲ step, name-keyed annotations ride along untouched).
    Meters build nothing while closed. See NIGHT-ROLL.md "Mixer — a real
    DAW mixer window". tests/night-roll.test.mjs: strips write track: as
    one ⟲, reorder is one ⟲ and refuses on a non-editable song, meters
    off-while-closed, View ▾/hardware key both toggle it.
12. Fixed px fonts (iOS Text Size ignored) — DONE 2026-09-30 (implemented,
    NOT yet committed/pushed — Josh or the terminal session should review
    and commit): every font-size in the CSS and in JS-built inline
    styles/cssText converted px→rem (N/16), off a `:root` `--ts *
    --userscale` multiplier on `html`'s font-size (both default 1, so
    default renders BYTE-IDENTICAL to the old fixed px — confirmed by a
    pixel diff, 0 changed pixels at 1366×1024 and 820×1180, well inside
    the ≤0.1% allowance). `--ts` reads iOS Dynamic Type via
    `-apple-system-body` (WebKit only, CSS.supports-gated — a boot script
    right after `</style>`, before first paint); `--userscale` is a new
    Settings → Other <b>Text size</b> device pref (Small/Default/Large/
    Larger → 0.9/1/1.15/1.3) for a browser that doesn't carry Dynamic Type
    through. Layout (padding, grid, canvas) untouched on purpose — only
    text scales; a control that would clip grows via min-height instead.
    Reviewing the Larger-setting screenshots by eye found and fixed one
    real overlap: the header's `#songcrumb` (song title/breadcrumb) had a
    fixed `left: 380px` calibrated to clear the File/View/✦AI button
    cluster at default size — those buttons' TEXT grows with the buttons'
    (fixed-padding) box, so at Larger + a narrow viewport (820px) the
    crumb's "Published › …" overlapped "✦ AI"; `left` is now `23.75rem`
    (the same value, scaling with the same root multiplier as the text
    pushing on it). No other clipping/overlap found across the header,
    footer, track chips, transport LCD, File menu, Settings (incl. the
    new Other row), ✦ AI panel, or Mixer (its 74px-wide strip name still
    ellipsizes a bit sooner — that's the EXISTING ellipsis mechanism on a
    deliberately-unscaled fixed-width box, not new clipping). Canvas text
    (ctx.font — roll/score labels, instrument panel, circle of fifths)
    stays literal px, not part of this system yet. See NIGHT-ROLL.md
    "Text size — iOS Dynamic Type". Songs loop forever at the end —
    still open. M / S.
    SUPERSEDED 2026-09-30 (same evening, QUEUE above): the `left:
    23.75rem` guess (and `#nowchip`'s matching `position:absolute` on
    the right) is gone — `.hdrleft`/`#songcrumb`/`#nowchip` are real
    flex items now, so there's no width to guess at any text size, dock
    state, or viewport width. See NIGHT-ROLL.md "Header layout: real
    flex items, not position:absolute".

    VoiceOver half — FIRST PASS DONE 2026-09-30 (implemented, NOT yet
    committed/pushed — Josh or the terminal session should review and
    commit): every icon-only control now has a real `aria-label`
    (~23 static buttons found by a systematic scan, plus the dynamically
    built track-chip M/S/H and mixer strips), toggles carry
    `aria-pressed`/`aria-checked`, and every tab strip is
    `role="tablist"`/`role="tab"`/`aria-selected`. The canvas (`#roll`)
    is `role="application"` (keeps its own keyboard shortcuts instead of
    handing them to VoiceOver's navigation) with a live `aria-label`
    naming the song, view, visible bars, and track count. A new offscreen
    `#srlive` region announces play/stop, the bar.beat playback stopped
    at, and the selected note/chord — always the exact text the footer
    status line (`#noteinfo`) already shows, never more, because both
    are driven by the one `setInfo`/`srAnnounce` choke point (this is
    also why Learning mode's "never name what the screen doesn't show"
    rule holds here automatically, verified by a test with a lasso'd
    triad in both modes). Every sheet is a labelled dialog with focus
    moved in on open and returned to the opener on close. Visible
    `:focus-visible` ring widened from button/select to every
    interactive element. Tests (vm, `tests/night-roll.test.mjs`
    "VoiceOver:" prefix): the button-label scan, srAnnounce's throttle/
    de-dupe, setInfo→srlive mirroring, play()/stop() announcements, the
    Learning-vs-Normal chord-naming test, track-chip toggle semantics,
    canvas aria-label. DOM-wide behavior (tab strips, dialog roles, focus
    management — gated behind `document.querySelectorAll`, undefined on
    purpose in the vm harness) verified instead with a one-off Playwright
    accessibility-snapshot script + a focus-ring screenshot (0 pixels
    changed outside the ring itself). See NIGHT-ROLL.md "VoiceOver —
    first pass". Still open, NOT this pass: reading/editing a note's
    pitch or time by keyboard alone (notes are still only on the canvas,
    described in aggregate, not individually addressable); canvas-drawn
    text (instrument panel, circle of fifths, roll/score labels) has no
    alternative text; the non-`.overlay` popups (`#metsheet` — got a
    static dialog role only, no focus management — `#voicemenu`,
    `#wmmenu`, speed/volume popovers) are out of scope, being small
    anchored popups rather than full sheets. A full non-visual editor
    (keyboard-only note entry/editing, a VoiceOver rotor over the
    timeline) is real future work, not started.
Already matches convention (don't touch): Space play/stop; ruler-drag
cycle; pinch per axis + two-finger pan; catch-mode playhead follow;
unlimited undo for notes/annotations; chase on mid-song start; snap to
the grabbed note's grid; dockable sheets, Esc closes, no native dialogs.
Stale help: "∿ Audio tracks" says trimming/splitting and pitch-keeping
slowdown are "Not yet" — both exist.

## QUEUED IDEA (Josh, 2026-09-27 evening): a real windowing system

"A full-on windowing system like you would find in IntelliJ or VS
Code, where you can move windows around, attach them to the right-hand
side or left-hand side or the bottom … everything could be windowed.
You could have the roll view and the tracks view on top of each other,
for example." Not now (his words). What exists: every sheet drags by
its title and resizes by the ◢ grip, and remembers its spot per device
(ff1roll-sheetpos-<id>); roll / tracks / score are three renderers of
one timeline and one cursor. What it would take: dock zones (left,
right, bottom) with a split layout the views and sheets can live in;
two timeline views at once sharing scroll/zoom/cursor (the state is
global today: view.x, playCursor); a saved layout per device; a
phone-width fallback (everything back to one column). Do after the
store release. Claude's view: the sheets-as-windows half is cheap and
already started; the docked-views half is the real project.
REOPENED 2026-09-29 (Josh): "I would really like to be able to dock the
AI or the ask dialogue to the right hand side of the screen and see the
song on the left." Also: rename the Ask button to AI (plan "✦ AI").
Plan, in order: (1) dock the ✦ Ask/AI panel right, the roll takes the
rest, a draggable divider, the split saved per device, phone width falls
back to the floating sheet; (2) any sheet docks left/right/bottom, layout
per device; (3) two timeline views at once (shared view.x/playCursor
today) — last, if ever. Step 1 + the rename start after the job-system
work lands (index.html is busy).
STEP 1 BUILT then REBUILT (2026-09-29): the first build (c322e3c) used
`<html>` padding-right + `#asksheet.on.docked{position:fixed}` and broke
on the iPad — the panel didn't span full height, the roll/footer ran
under it, header buttons were cut off, the ⇥/⇤ glyphs rendered empty.
Replaced with a real shell: `#shell` (display:grid, 3 columns x 2 rows)
wraps the song's existing top-level flow in `#songregion` (always the
center column/cell, Josh's rule) with empty `#dockleft`/`#dockright`/
`#dockbottom` cells sized by CSS vars (`--dl-w`/`--dr-w`/`--db-h`,
default 0px). STEPS 1-2 BUILT: docking the ✦ AI panel moves its node into
`#dockright` and sets `--dr-w` (the grid track, not `<html>` padding);
floating moves it back and clears the var. Draggable divider (280px–
60vw), text "Dock"/"Float" button (no glyphs — they render empty on
iOS), sheet title reads "AI". Per-device pref `ff1roll-wm` =
`{right: {id, w}}` (migrated once from the old `ff1roll-aidock`), phone
width (<700) falls back to the floating sheet and crossing that width
live floats it. `resize()` runs the same path a real window resize does.
Details + step-3-8 reuse notes: NIGHT-ROLL.md "Window manager (shell +
docks)". Browser-verified headless at 1366x1024 (2026-09-29): docked,
song region 986 + dock 380 = 1366, roll and footer end at 986, panel full
height; floating restores 1366; iPad check is Josh's. NEXT (Josh, via
Ask, 2026-09-29): one window builder (wrapWindow/openWindow) giving every
window the same title (left), ✕ (right), title drag, ◢ corner grip and a
dock option — 26 hand-written .overlay/.sheet blocks today, the grip and
drag are bolt-on scripts with special cases (why the jobs grip landed
wrong). Migrate a few windows per commit with browser eyes; new windows
born on it. Then drag-to-edge docking + tabs on top of it. Josh's rule:
the song view is always the center; windows dock only left/right/bottom. Rename to "✦ AI" was already
shipped separately (fe80df3).
PHASE A BUILT (2026-09-29, delegated to a subagent — token budget): left
and bottom docks; a side dock's FULL height (edge to edge — the step-1/2
behaviour) vs INNER (beside the roll only, the song's header/footer
stay full width — Josh: "only the portion from the ruler to the bottom
of the roll … a header and footer of the song below it from the outer
context"); the bottom dock can split two windows side by side; and
`makeWindow(id, {dockable})`, registering a window for the shared Dock
menu (Left/Right/Bottom, then Full height/Beside the roll, then Float) —
the ✕/drag/grip mechanisms it sits beside were already fully generic and
are unchanged. Six windows migrated: AI, ALL NOTES, INSTRUMENTS, JOBS,
PUBLISH, Status. 20 windows not yet migrated (list in NIGHT-ROLL.md
"Window manager"), including `#importsheet`'s own drag/grip special case.
`wm` pref shape gained `mode` (side docks) and `split` (bottom); migrated
from both the pre-shell and the step-1/2 shapes. Details: NIGHT-ROLL.md
"Window manager (shell + docks)" → "Phase A". Vm-tested (10 tests,
`npm test` green); NOT yet browser-verified — the main session still owes
headless screenshots at 1366x1024 (checklist in the subagent's report:
each migrated window docked left/right/bottom, full vs inner, two windows
split at the bottom, floating again, and a saved floating spot seeded in
localStorage before load, since a fresh profile without one caused the
last iPad regression) before this counts as shipped.
PHASE B BUILT (2026-09-29, delegated to a subagent — token budget): drag-
to-dock (grab a dockable window's title, drag it to an edge — a highlight
shows the zone, full-height on the outer half of a side edge, beside-the-
roll on the inner half, bottom along the bottom edge; release to dock,
or in the middle to float; dragging a DOCKED window's title undocks it
and continues the same drag) and tab groups (dropping a second window on
an occupied side joins it as a tab — a small strip of chips above the
docked window(s), one shown at a time; tapping a chip switches; closing a
tab's window just drops its chip from the strip, same "close never
undocks" rule every dock already had). `wm`'s side shape gained `ids`/
`active` (was a single `id`) — migrated once more on load
(`wmMigrateShapeB`). Also: `#infosheet` (Status) is no longer dockable
(a one-shot status reveal isn't worth pinning open) — five windows
dockable now, not six. Details, the zone/full-inner-split reasoning, and
the two self-correcting fixups (an independently-reopened background tab
wins over a stale active; a closed active promotes an open sibling):
NIGHT-ROLL.md "Window manager" → "Phase B". Vm-tested (pure `wmZoneFor`,
the tab-group state transitions, migration, plus every phase-A
integration test updated to the new shape — `npm test` green, 194
passing). NOT yet browser-verified — the main session still owes headless
screenshots/pointer-drag checks at 1366x1024 (checklist in the
subagent's report): a real pointer drag of the AI window's title to each
edge docks it correctly; dragging a docked window out floats it under the
finger; two windows dropped on one side make a tab group, switching
works, and closing/reopening a tab behaves; the existing phase-A
assertions (panel at its edge, roll never under a dock, footer's last
chip visible) still hold. `tests/e2e/docking.spec.mjs` has the
Playwright side of this (CI-only, not run locally). Two timeline views at
once remains queued; a tab chip's own close ("x") button, and a visual
cue for a background tab before it's reopened, are new small queued
items (NIGHT-ROLL.md "Phase B").
VERIFIED + SHIPPED (2026-09-29): headless pointer drags at 1366x1024 —
left edge (full), pulled back to the middle (floats), right inner half,
bottom, right outer; Notes dropped on the right joins as a tab (2 chips,
AI + ALL NOTES). Fix during review: the strip listed only OPEN members,
so switching tabs (which closes the other) hid it — it now lists every
member, a chip tap opens its window, and ✕ on a grouped window removes
it from the group (`wmCloseWindow`). Window-manager scope CLOSED by Josh.
ALSO (Josh, iPad, same session): the divider's max size was a flat 60%/
70% of the window — docked Right, Beside the roll, he hit it before the
panel covered the song. Raised to `innerWidth`/`innerHeight` minus a 32px
grab strip (never so little the divider itself is lost off-screen), left
and bottom alike; double-tap a divider to reset it to the default size.
Confirmed (a new vm test, not a fix needed) that the roll/score canvas
already handles a sliver width/height without dividing by zero —
`pxqFloor`/`rowHFloor` were already defensive. Needs the same headless
check as above: drag the right divider nearly to the window's own edge
and back, and double-tap it.

## QUEUED IDEA (Josh, 2026-09-27): folders above albums in Open

"I want to be able to have folders for my albums, maybe like an NES
folder, an SNES folder, N64…" Not possible today (Open = albums + drafts,
flat). Sketch: album.json gains "group" (NES/SNES/Genesis/PS1/N64/Game
Boy/My songs); imports set it from the chip kind; Open lists groups →
albums → songs; manifest carries the field. Also his wish for Open to
separate "Published songs" from "Local songs" (it already splits albums
vs "Night Roll drafts"; a wording pass at most).

## QUEUED IDEA (Josh, 2026-09-27): "✦ Annotate this song for me"

Import a classical MIDI, ask the AI to analyze it and write the
annotations. Consistent with the 2026-08-19 ruling (asked-for = a tool):
on-demand, per song, per tap, never volunteered. Design sketch: an Ask
mode that returns structured chord/section/key lines, parsed into
annotations tagged as AI-written (reviewable, clearable in one go);
MIDI-derived songs only (chip imports included), audio tracks have no
notes. Not started.

## PHASE 2 — THE REAL SHELL, STARTED 2026-09-27 (afternoon)

Shell project `~/work/ff/night-roll-app` (local git, no GitHub repo yet;
Josh, 2026-09-27: no dev/prod split until App Store time): Capacitor 8,
packaged web files (`build-www.sh` runs tools/package.mjs; www/ is not
committed), the spike's AVAudioSession code, mic/speech strings,
.mid/.nsf document types, UIFileSharingEnabled, 1024 icon upscaled from
icons/icon-512 (a real master is a polish item). `build-ipad.sh` =
package → cap sync → xcodebuild → devicectl install+launch, silent since
Josh clicked Always Allow on the keychain prompt. First launch failed
("Couldn't open Overworld. Load failed"): the boot fallback song was
hardcoded and the app edition ships no FF1 → `homeSong()` picks the
first catalog song (7424964). The Bach starter now plays on piano
(42449c8; Josh: the chip voices didn't suit it — harpsichord is the
alternative). Files-app storage: `nativeDirHandle` over the Filesystem
plugin, opt-in switch in Settings (NIGHT-ROLL.md "iPad app: the Files
folder"). Needs Josh on the device: turn it on in Settings, Save a
starter, find it in Files → On My iPad → Night Roll. Open in Night Roll
also shipped (a .mid or chip file tapped in Files / Share → Night Roll
opens as a local draft; needs Josh: tap a .mid in Files on the iPad).
Also that afternoon: a Release archive of the shell succeeds
(`xcodebuild archive`, build/NightRoll.xcarchive); privacy.html on the
site (draft — Josh to read before the listing uses it); the overnight
branch deleted from GitHub (local tag archive/overnight-2026-09-26 keeps
it). TESTFLIGHT (2026-09-27 evening): the App Store Connect record existed
(Apple ID 6816720406); build 1.0 (1) uploaded from the Mac
(`xcodebuild -exportArchive` with ExportOptions method
app-store-connect / destination upload; the archive is
~/work/ff/night-roll-app/ios/App/build/NightRoll.xcarchive). Two
lessons: the icon must have no alpha (flattened onto #0D1120 with a
CoreGraphics script), and a build number is single-use (ITMS-90189 —
CURRENT_PROJECT_VERSION is now 2 for the next upload; never pipe
xcodebuild's upload through `head`, SIGPIPE kills it mid-way).
Info.plist carries ITSAppUsesNonExemptEncryption=false. Build 2 (the redrawn original icon, ~/Desktop/nightroll-icons and
icons/icon-1024.png, drawn by tools/icon-1024.swift) uploaded the same
evening; CURRENT_PROJECT_VERSION is 3. Screenshot drafts at iPad 13"
size (2752×2064) from the website via scratch/shots.mjs (headless
chromium, run only while Josh is away): ~/Desktop/nightroll-screenshots/
— 1 Overworld roll, 2 score, 3 Ambush, 4 Open tree, 5 Ask (empty), 6
Chrono Trigger. What remains is in APP STORE — WHERE IT STANDS at the
top of this file (the icon pick is done: the original, afb518c).

## APP STORE PREP — OVERNIGHT BRANCH FULLY MERGED 2026-09-27 (afternoon)

One commit at a time, each tested in Chrome and deployed alone: product
build 6e2a500, bridge installer 21c2739, Local Save + recording a36161b,
Bach starter 660b329, Publish all 2892e26, roadmap notes 54d7fbc. The
branch can be deleted. Also that afternoon: docs/promo-video-script.md
(agent draft, merged 232db19), the help wording on chip audio, and the
"newer save exists" false alarm (e1dc9ba: loadNotes now records the
file's saved stamp). (Since done: support email nightrollapp@gmail.com; four starters in albums/starters; icon = the original, afb518c. Current list: APP STORE — WHERE IT STANDS, top of this file.)

## (history) APP STORE PREP — BRANCH overnight-2026-09-26, PUSHED 2026-09-27, UNMERGED

Eight commits, none on main (Josh's rule that night: nothing to main):
local Save + auto-save off by default + the recording open-end fix
(9ae2f2f), EDITION flag + tools/package.mjs + ship guard + About
attribution (7422bcd), bridge launchd installer (bb18c88), Publish all
ships music+annotations+chat (d3d5aae), Bach starter album (0eb48ad),
roadmap + notes. Merge on his word ("merge it"); vm was green on the
branch; rebase onto main first (index.html has moved a lot since).
Needs Josh, in order: the audio spike at the Mac with the iPad plugged
in (~30 min); ~~an Apple Developer account~~ (DONE 2026-09-27 morning:
enrolled and paid); a support email address; two more starter songs.
(Since done: support email nightrollapp@gmail.com; four starters in albums/starters; icon = the original, afb518c. Current list: APP STORE — WHERE IT STANDS, top of this file.)
Told him 2026-09-27 01:20 by inbox note and email.
## ROADMAP — the whole remaining list (written 2026-09-26, end of a long day)

Josh's rulings tonight: $4.99 confirmed; support email he creates
tomorrow; app name "Night Roll" (availability checked — see below);
starter content = ONE well-known public-domain classical piece, fully
annotated by Claude as demo content (his explicit ask; the analysis
rule is about HIS music), plus two more songs to be picked; overnight
work happens on a branch (`overnight-2026-09-26`), nothing to main.

**Phase 1, to finish**
1. Step 5: `EDITION` flag; packaging script + ship guard (no FF1 /
   Mega Man / TMNT / compositions in the store build; byte-identical
   index.html); About attribution (FluidR3_GM, VexFlow, PolyForm).
2. Local Save + auto-save switch (off by default): Save is the
   checkpoint; Revert and Compare go to the last save; the working copy
   survives a crash; undoable Revert (stash + Restore local copy).
3. Live-test step 4 (README song list) on Josh's next Publish.

**Then the native app**
4. Phase 0.5 audio spike (needs Josh at the Mac, iPad plugged in).
5. Phase 2 Capacitor shell (Files, "Open in Night Roll", audio session).
6. Phase 3 TestFlight (enrollment, bundle ID, privacy labels).
7. Phase 4 App Store ($4.99, listing, screenshots, support page).

**Josh's decisions** — all done: 8 app name "Night Roll" · 9 starters
(four) · 10 support email nightrollapp@gmail.com · 11 price $4.99.

**Loose ends** — 12 Settings text overlap on the iPad (awaiting his
screenshot) · 13 seven edited songs live only in Brave: publish there
or discard · 14 delete `night-roll-test-songs` whenever · 15 bridge:
launchd always-on, per-song `--resume`, `--token`.

**Other consoles (Josh, 2026-09-26: "a big selling point")** — chip
import beyond NSF, in suggested order: Game Boy GBS (same 4-voice
family; the NSF pipeline ports nearly as is), SNES SPC (standard dumps;
sample-based, so notes = key-ons + pitch ratio, sample root guessed),
Genesis VGM (FM register logs), PS1 PSF/SEQ (SEQ is MIDI-like — often
easy), N64 USF (no standard music format; per game, hardest). Design
item; nothing built.

**Parked** — 16 Publish all shipping music + chat: DONE on the overnight
branch · 17 Compare under a chop; saved-only tracks: left as is on
purpose (chop shifts display ticks and re-applies from rawNotes; a
swap under it is not worth the risk; saved-only tracks have no lane) · 18 in-browser model on the iPad (WebGPU)
untested; Claude-by-API-key backend for users · 19 MIDI input
(Jamstik) v1.1 · 20 on-device model runtime in the shell v1.1.

**Starter content (2026-09-26 night):** `albums/starters/` holds
Bach's Prelude in C (BWV 846) — 35 bars, three voices, 35 chord labels
with notes on the interesting bars, six sections, key/tempo/meter —
generated from the score's chord table and annotated by Claude as demo
material at Josh's request (the analysis rule is about HIS music). The
Starters album shows on the site too (public domain) and is the only
album the packager ships. Since done: four starters (bach, fur-elise,
gymnopedie-no-1, moonlight-sonata-1).

**Parked** — 16 Publish all shipping music + chat · 17 Compare under a
chop; saved-only tracks · 18 in-browser model on the iPad (WebGPU)
untested; Claude-by-API-key backend for users · 19 MIDI input
(Jamstik) v1.1 · 20 on-device model runtime in the shell v1.1.

**Tonight, on the branch (Claude alone):** 1, 2, 15 (plist + token),
16, 17, and a first cut of the classical starter (Bach, Prelude in C
BWV 846 — 35 bars, public domain, textbook harmony) with full
annotations as an album `albums/starters/`. Josh reviews in the
morning; merge is his call.

## PHASE 1 — publish + links (in progress 2026-09-26)

Rulings so far: step 1 done (5add982) — the one deliberate step is
called Publish everywhere (File → Publish…, footer, PUBLISH sheet, ⇪
Publish song / Publish all; Save… in folder mode). Drafts and Revert
unchanged.

**Design gap Josh raised (2026-09-26, "not immediately"):** a user who
never publishes has no checkpoint — the device draft is always the
latest state, so Revert can only go back to the published copy, and
"every single thing you do is always saved, that kind of sucks … not
the way it works in Logic". Fix to build in this phase: a Logic-style
**Save** = a local checkpoint distinct from the working draft
(snapshot on the device; Revert → last Save, or the published copy if
none; the ● means "changed since the last Save"). In the iPad app that
Save is the file in Files and the draft is autosave/recovery. Also
queued from earlier: an undoable Revert (stash + "Restore local copy").
Josh's later ruling (same day): a Settings switch **Auto-save: off by
default** — off = edits live in a working copy until Save (the
checkpoint that Revert and Compare go back to; the working copy still
survives a crash, it just isn't "saved"); on = every edit is the save
(today's behaviour). Publish stays separate in both. Compare with repo
becomes "Compare with last save" (published copy only when never saved).

Step 2 done: share links / link mode (NIGHT-ROLL.md "Publish + share
links"); test repo joshcough/night-roll-test-songs is his to delete.
Step 3 done: Connect GitHub as a two-step setup with Check. Step 4
done: Publish keeps a song list (player links) in the repo's README
between markers; this repo's README seeded. Live run pending Josh's
next Publish.
Step 5a done: the advanced data-location rows are gone; NSF repo is a
visible optional setting (device-only default for other users). Josh
reported overlapping text above the GITHUB heading on the iPad — not
reproducible at 768 px here; awaiting his screenshot.
Remaining, one at a time on his go:
4 README with player links written into the songs repo, 5 EDITION flag
+ packaging script + ship-guard + About attribution.

## PHASE 0 — PWA — SHIPPED 2026-09-26 (NIGHT-ROLL.md "Installable app — PWA")

Josh installed it ("Dude, it works … I actually love the icon"). First
airplane-mode test: a song he had not opened "just hangs" → fixed the
same hour: every catalog song is warmed into the cache (~1.2 MB), song
fetches time out after 12 s, and a failed open says so. This also closes
the old "song open hangs on a CDN blip" item below. Awaiting his second
airplane-mode test.

Manifest, icons, service worker, kill switch, tests. Josh's exit
criterion still to run on HIS iPad: Add to Home Screen, airplane mode,
launch, a song plays. Pricing research landed in the Desktop plan's
appendix: $4.99 paid-upfront confirmed as the indie slot; enroll in the
Small Business Program before launch. Next: Phase 0.5 (WKWebView spike)
on "run the audio spike", or Phase 1 (publish + links) on "build
publish and links".

## iPAD APP PLAN v3 — on Josh's Desktop (2026-09-26; not committed by his rule)

`~/Desktop/nightroll-ipad-app-plan.md` (v2 kept beside it). Spine
unchanged: PWA → WKWebView audio spike → publish/links → Capacitor
shell → TestFlight → Store, $4.99. v3 rulings: one repo, one
index.html (no fork; a small private shell repo pins the web build);
an EDITION flag hides token/data-locations/Web-session in the app
edition, perf HUD stays; GitHub is reframed as the **Publish** feature
with player links (for him and every user); everything public for now
(a web app's code is its deployed page anyway); a noncommercial license
(PolyForm NC) to block republishing — DONE (792e432); AI tiers:
on-device runtime in the shell (v1.1), Claude by API key, a bridge on
a computer. Folder mode already IS the persistence adapter. Spike list
grew (recording, dictation, WebGPU). Budget 10–16 sessions. Open
decisions for him listed at the end of the file.

## BRIDGE SESSIONS + INBOX — SHIPPED 2026-09-27 (NIGHT-ROLL.md → The AI bridge → Sessions + the inbox)

Josh, from bed on the iPad: "I can't message you back without getting
out of bed, which is why I want the bridge to be able to have the model
then talk to you." Shipped: one Claude Code session per song
(`x-nr-song` → `--session-id`/`--resume`, tail-only prompts); that
Claude can SendMessage the terminal sessions (full mode); the terminal
answers with `node tools/claude-bridge.mjs --say "…"` → ✉ bubble in
✦ Ask + ✉ on the button + the note at the top of the song session's
next turn. Also fixed on the way: tool rounds through the bridge reused
the job id and replayed round one's tool call. Open: nothing pushes to
the iPad while the app is closed (ntfy app on the iPad would; ask Josh).

## IMPORT TESTS AGAINST REAL RIPS — QUEUED 2026-09-27 (Josh, tired: "too tired to really think about that right now")

The Game Boy import shipped green on synthetic files and was wrong three
ways on the first real rip (Latin-1 playlists, 0-based tracks, an SM83
JR bug). Josh: "We need to somehow have unit tests for all these imports
… we might need to support various different ways of importing … one
M3U with all the songs in it instead of one M3U per song … We should
really be downloading more of these and making more unit tests."
Plan (not built):
- A fixture corpus of REAL playlist files (.m3u is metadata, fine to
  commit) from several rips per console: per-track m3us (FFL1), one
  m3u for the album (most NSF rips), Latin-1 and UTF-8, 0- and 1-based,
  titles with dashes/commas. Tests: parseM3u + the picker's merge on
  each, row count, names, order, track numbers.
- The ROMs stay out of the repo; a `tools/import-check.mjs` that takes a
  local zip and reports what Import would show (rows, first-track
  capture summary) so a new rip can be tried in one command, and the
  browser only after that.
- Each new console (VGM/PS1/SPC/N64) gets the same treatment before its
  app hook: download two or three real rips, dump them, look, then wire.
- Already true: one m3u listing all songs works (parseM3u is per line;
  the merge is over picked files).

### VGM / Genesis — DONE for the pipeline 2026-09-27 (branch worktree-agent-a08d6775b74a6211e)

Josh: "go out and download all those other games from the web and try
to import them and try to write unit tests for them." Sonic the Hedgehog
(19) and Sonic 2 (31) from Zophar, command line only; bytes never in the
repo. Full account: tools/vgm/INTEGRATION.md §4 "Real rips". Two real
bugs, both fixed with synthetic regressions (tests/vgm.test.mjs) and the
rips' text pinned in tests/vgm-real.test.mjs (in `npm test`):
- FM pitch ignored the operators' MUL — Sonic's chord voice printed two
  octaves low, its bass an octave high (the roll inverted).
- DAC hits merged whenever drum samples overlapped (Sonic 2 Final Boss:
  one hit in 58 s; now 337).
Queued from what remains approximate:
- Slide-aware merge: SMPS chromatic slide-ins split into 16 ms legato
  grace notes; the text drops them and starts the target up to 50 ms late.
  Fold grace notes shorter than a 32nd into the target and give it their
  onset.
- DAC kit without naming: in these files the 0xE0 seek offset IS the drum
  (3–4 distinct offsets per song). Bin hits by seek offset onto 35/38/42
  in order of first appearance — a kit map from a hardware fact.
- Tempo seed: SMPS ticks at 60 Hz with integer frames per note; Green
  Hill is exactly 150 (6 frames a 16th) and the fitter seeded at 120 said
  121.66. The import should try the chip-native family (150 / 112.5 /
  100 / 75) and show the one with the fewest off-grid onsets; Josh picks.
- File → Import hook per INTEGRATION.md §4 "What File → Import needs";
  index.html untouched by that session.

### SNES (SPC) — real rips done 2026-09-27, merged 9729ffc; IN THE APP the same night (NIGHT-ROLL.md "Super Nintendo import")

Josh: "can he just get the Super Nintendo stuff merged so I can test it
here. Why wait until the rest of them are done." File → Import takes a
whole .spc set now (synth voices; no SNES renderer yet). Still open from
the list below: the roots panel, unrar, multi-part tracks as sections.

S-DSP renderer built 2026-09-27 on branch worktree-agent-a1701ba9dfec9596e
(`tools/spc/apu-render.mjs`, contract identical to the NES/GB renderers:
`renderApu(capture, {sampleRate, onProgress, keepSamples})` →
`voice0..voice7`). Gaussian interpolation, BRR loop/END, ADSR/GAIN, PMON,
noise LFSR, VOL/MVOL — measured on CT "Frog's Theme" and FF6 "Terra"
(tools/spc/INTEGRATION.md §2). Queued: the **echo path** (EDL/EFB/FIR +
EVOL — the audible gap; hook marked in the voice loop), a listening pass
against a reference emulator, the app wiring (another session, against
the contract above).

FF4, FF5, FF6, Chrono Trigger, A Link to the Past: 342 .spc, all run
clean after three fixes (long-loop root estimation, dumped-KON start,
text-format tag byte + xid6). Import-side items the app must handle
when SNES gets its File → Import hook:
- many files = one album (a flat zip of .spc, no m3u): the picker
  takes N files; rows ordered by `parseTrackName` (disc+track, parts
  a/b/c of one OST slot together, 99/999 "not on the OST" tracks last);
  titles from ID666/xid6, never the mangled file names (`?`/`"` → `_`).
- a roots panel: per-instrument root pitch with confidence, editable
  (`--root` today); events flagged `unpitched` go to the drum channel.
- zip, not rar (.rsn sets are rar — refuse with a message, or unrar).
- multi-part tracks (101a/b/c) as one song with sections, or three songs.
Approximate: root octave on bright looped samples; portamento as chromatic
runs (slide-aware merge queued); voices mid-note at dump time without a
KON bit stay silent.

### PS1 (PSF/AKAO) — real rips done 2026-09-27 (tools/psx/INTEGRATION.md §6)

Final Fantasy VII: 90 minipsf + one 700 KB psflib; no SEQ/VAB anywhere —
Square's AKAO driver. New reader tools/psx/akao.mjs (opcodes per VGMTrans
+ Qhimm, tempo constant 0x43D1 confirmed from the driver bytes): all 90
songs, 0 crashes; Prelude, Tifa, Main Theme (11 tempo points), One-Winged
Angel (7/8 + 3/8 bars) dump full length. Import-side items:
- the lib: one minipsf alone is useless; Import must take the .psflib
  with the minis (ask for it by its `_lib` name if missing).
- inflate via DecompressionStream, assemble the 2 MiB RAM, scan, drop it.
- parseMidi's 32-bar tacet guard truncates FF7 tracks (Main Theme voice 2
  rests 41 bars → 118 notes dropped): imports need the guard off.
- show `seq.warnings` (conditional jumps, tempo after an opening rest).
Approximate: pitch = written key (INSTR.DAT articulations not read yet);
no per-note velocity in AKAO; bends counted, not applied.

### AUDIO ON THE iPAD — WORKING AGAIN ON 5fc6e79 (2026-09-27 01:03), FALL PARKED

Josh: "Everything is working now — even the Chrono Trigger stuff, and I
can go back and forth to Final Fantasy." Zero ⚠ lines. KNOWN-GOOD =
f733b42's engine exactly (resumeAudio: resume twice; with a dead clock
inside a tap, rebuild the context and CONTINUE into play in that same
tap, so the first sources start in the birth gesture) + 8e1c72d's guard
(the synth is muted only while chip sources actually sound) + 8441c2c
(render off the engine, PCM at 32 kHz, stale renders abort) + 9421bf9
(0.6 s lookahead, Fall culls by tick) + Fall parked (76250d7). The
breaker was the engine rewrites ea63c95 → 69da39f: create-and-return at
the top of the tap instead of rebuild-then-play in the same tap.
UNMEASURED, do not treat as fact: "a context created outside a gesture
is mute forever" (inferred from two heavy-load incidents); the
dictation → interrupted → mute theory (never shown to matter on this
engine; the working build has no dictation handling). Branch
audio-dictation stays unmerged; if ever proposed, it is ONE change with
a specific A/B for Josh, after a stretch of normal use on 5fc6e79.
Still open, low priority: Fall (parked), the boot pointerdown warm
creating an engine before activation (harmless on the known-good), the
render in a Worker, SNES echo.

Earlier that night:

Timeline (all the same night): CT played on f733b42 (rebuild inside a
tap + the SNES renderer). Then Josh: Fall on CT → silence that stayed.
I shipped three more engine rewrites on theories (no context after an
await; rebuild at the top of the tap; measure the output + dictation
releases) — each made a plain relaunch worse, and Josh: "I don't know
why you won't revert — it was working right up until the point where I
asked about the piano Fall". A bridge session reverted the three
(62194b2, afc203f, da44c1b, ea63c95 → 653eae0); what survives: the
f733b42 engine (rebuild only inside a tap, gated by
navigator.userActivation), 8441c2c (render off the engine, PCM at
32 kHz, stale renders abort, buffers built in the Play tap), 9421bf9
(0.6 s scheduler lookahead; Fall culls by tick), 008056e (Fall redraws
per frame). Then, on that engine, opening Fall STILL killed sound even
on a small FF1 song with no ⚠ line → Fall parked (76250d7: button
hidden, never turns on). FF1 plays.
Known, not explained: Fall's per-frame full redraw stops sound on the
iPad and it does not return; in Chrome (simulated clock) nothing
changes — no exception, chip sources alive, master up. The state string
lies ("running" while mute). Needs an ON-DEVICE output measurement
(an AnalyserNode on master read from the ⚠ log), not another theory.
Unverified but likely real: dictation (SpeechRecognition) holds the
iPad's audio session; micStop uses stop() and micPrev lingers until the
next dictation.
Found by an independent read-only review the same night (real, in my
code, guarded by a bridge session): play() gives up on a render after
25 s and plays synth; when the render then lands MID-playback,
chipRender sets chip.key, scheduleNote starts dropping notes on
chip-covered tracks, but chipStart never ran → cursor moves, silence;
the next song can hit the same. The guard requires chip.srcs.length.
The reviewer also notes the "context created after a gesture = mute
forever" rule was inferred from two heavy-load incidents and never
measured; standard WebKit starts such a context suspended and resumes
it on a later gesture. Measure before believing it.
From Josh's first real ⚠ log (69da39f): "engine #1 created (NO
gesture; suspended)" → "interrupted (system)" the same second, 3 s
before his Play; then "#2 created (in a gesture) → running" and STILL
silent. #1's creator is the first-touch warm handler
(`pointerdown` → ensureAudio): on a touch screen pointerdown grants no
user activation (pointerup/touchend/click do), so WebKit parks that
context "interrupted". Handed to the owning session as the next single
change (warm on pointerup, or drop the warm). #2 silent inside a
gesture means birth is not the whole story; the output meter (log only)
is the measurement that comes next.
8e1c72d, fresh launch, NO dictation: #1 NO gesture → interrupted, #2
created in the Play tap → running → silent; the first tap "did nothing",
the second moved the cursor. So a context born inside a tap can still be
mute. Reverted to f733b42's engine + the chipStart guard (5fc6e79).
Hypothesis to test next (from the bridge session's diff of the two
builds): f733b42 rebuilt the context and CONTINUED into play in the same
tap (resume + first sources started inside the gesture); 69da39f created
it and returned, so the second tap played on a context that never had a
source start in its birth gesture. If 5fc6e79 plays, keep that variable:
whatever creates the engine must also start sound in the same gesture
(warmContext's silent buffer alone may not count). Branch audio-dictation
(eee6011) is built on the reverted replace path — rebase before any use.
Coordination failure the same night: three bridge sessions pushed
audio changes within minutes of each other after the revert — the
one-at-a-time rule applies to them too; one owner per report.
Rule from Josh, applied from here: when it works, stop; when it breaks
right after my change, revert first; then one change at a time with his
ear as the test. Order when he's ready: (1) micRelease() (abort both
recognizers) at the top of play(); (2) the output meter as a DIAGNOSTIC
only (log, never act); (3) Fall, after the meter says what it does.

### The import-silence bug — FIXED 2026-09-27 (NIGHT-ROLL.md "Audio context rebuild only inside a tap")

Game Boy, then Chrono Trigger: imported song silent with a moving cursor,
every song after it silent until relaunch. Cause: Import's file picker
interrupts the AudioContext; the visibility handler rebuilt it outside a
tap, and iOS runs such a context mute. Rebuild now only inside a tap
(f733b42). Josh confirmed CT plays (with the new SNES chip audio). Follow
-up shipped the same night: Play waits for a chip render in flight, with
progress (b31ff7e). Chip renders moved to a Worker 2026-09-27 afternoon (NIGHT-ROLL.md "Chip
render in a Worker"); iPad verification pending. Open: SNES echo path.

### Big imports and device storage — FIXED 2026-09-27 (NIGHT-ROLL.md "Big drafts")

Josh's Chrono Trigger import (92 .spc) hit "quota has been exceeded" on
the iPad and the album seemed to vanish (it was under Open → drafts →
the folder). 92 captured SNES songs = 6 MB of notes; localStorage holds
~5 MB. Import and local-MIDI drafts now keep their notes in IndexedDB
behind a small stub; his compositions unchanged; saveDraft never throws
out of an edit when storage is full (⚠ line + info strip instead).
Open: a storage meter in Settings; drafts that were already truncated
by the quota need re-capturing (the rows that failed said so).

### N64 (USF) — real rips done 2026-09-27, merged e8ca4bb (tools/n64/INTEGRATION.md §8)

Super Mario 64, Ocarina of Time (1.0 + 1.2), Majora's Mask: the USF
sets' shared library carries the whole sparse ROM, and the sequence
tables ARE reachable (SM64 in ROM; OoT/MM in the saved RDRAM), so the
EAD interpreter reads real music: SM64 38/38, OoT 108/109, MM 103/118
(the misses are ocarina songs and cutscene effects, not sequences). New
tools/n64/usf.mjs + ead-usf.mjs; three interpreter bugs fixed (SM64
note priority opcode, OoT/MM channel B0–BE, s8 sequence register → a
"mm" ABI). Import-side: the picker takes the minis WITH the .usflib
(like PS1's lib); per-game manifest keyed on the lib's NUS code; bank
tuning not applied yet (+21 convention), drums unnamed.

### Nintendo 64 (USF) — IN THE APP 2026-09-27 (NIGHT-ROLL.md "Nintendo 64 import")

File → Import takes the .miniusf files WITH their .usflib (multi-select
all). Verified on the real Super Mario 64 set (38 rows; Title, Main
Theme, Dire Dire Docks full length with loops). Synth voices; the N64
voice (VADPCM banks) is Phase C in tools/n64/INTEGRATION.md. Bank
tuning not applied (+21 convention): pitches may sit an octave off on
some instruments — Josh's ear decides. All six consoles now import.

### PlayStation (PSF) — IN THE APP 2026-09-27 (NIGHT-ROLL.md "PlayStation import")

File → Import takes the .minipsf files WITH their .psflib (multi-select
all). Verified on the real FF7 set (90 rows; Prelude, Tifa, Main Theme
full length with their loops and tempo changes). Synth voices; the PS1
SPU renderer (VAB/AKAO instruments) later. Next: N64.

### Genesis (VGM) — IN THE APP 2026-09-27 (NIGHT-ROLL.md "Genesis import")

Josh: "is it gonna download games to test it with?" File → Import takes a
.vgm/.vgz set (multi-select), synth voices, the header's loop point as
the loop: annotation. Verified on the real Sonic 1 set. Next: PS1 (minis
+ psflib together), then N64 (miniusf + usflib); Genesis sound chip
(YM2612 + SN76489 renderer) later.

## FOR THE TERMINAL — 2026-09-27 evening (from the Ask session; Josh's ruling: Ask never implements)

1. **Bridge prompt**: add the rule to BRIDGE_SYS_FULL in tools/claude-bridge.mjs —
   the Ask session answers, diagnoses, relays, queues; it never edits code,
   commits or pushes. (CLAUDE.md "Hard rules" now says it; the prompt should too.)
2. **Capture jobs**: Josh wants YOU to bring a design advisor (Plan agent) and
   then implement, scope = captures + their publishes first, "maybe more". A
   read-only design run was started from the Ask session and cut off when its
   process ended; nothing landed. Advisor brief to reuse: job model (kind, id,
   title, items with status/progress, persisted mirror, survive panel close /
   reload / tab suspend); UI (a ⏳ indicator + jobs sheet; the capture panel
   becomes a VIEW onto a job; cancel/retry/dismiss); which operations become
   jobs first (captureChipTrack loops, commitImports) and later (Publish all,
   chip renders on the Worker, audio export); concurrency + cancellation rules;
   4–6 shippable commits each with its help entry + FEATURES keyword +
   NIGHT-ROLL.md section.

## N64 + PS1 IMPORTS — BROKEN ON THE iPAD (Josh, 2026-09-27 17:46, from the Ask chat)

Ear reports, his words (the failing tests; verify against the real
rips on the Mac before touching the app):

- N64 (Mario 64 set, build 8b83162 or later): "every song imported
  almost instantaneously and I think they all said like one note. Then
  I opened one of the songs and it was all messed up — I can recognize
  some of the notes in there but they're definitely in the wrong
  timing. There are remnants of the real song in there." Later: "the one-note thing might be a red herring — maybe it was
  one note in the loop — when I opened the song there were tons and
  tons of notes, including some of the right notes but not in the right
  timing. But it definitely said that." (So the row status says 1 note
  while the draft holds many on a scrambled timeline.) So: the app
  capture yields ~1 note per row and a scrambled timeline, while the
  command-line dump of the same set was verified full length. Suspects:
  the app hook feeding the sequence parser a different sequence/bank
  than dump.mjs (the .miniusf ↔ .usflib pairing, sequence id from RAM),
  or the 10 ms rebin/loop stages on the N64 tick rate.
- PS1 (FF7 set): "Bombing Mission was just a disaster — all the correct
  notes are there in the right timing but there's some other noise going
  on that I can't explain. Tifa's Theme, a quieter one, is better, not
  so much noise, maybe still a little noisy. Maybe it has to do with the
  drums." Suspect: percussion/noise voices landing as pitched notes on
  melodic tracks (the Game Boy had the same bug: noise must ride ch 9 /
  a drums track), or one-shot samples with no root mapped to pitches. Josh's own read (17:53): "I remember the N64 and PlayStation
  imports are notes only — no instrument information. I opened Those
  Chosen by the Planet, which starts with really spooky drums, and it
  just sounds like noise." Fits: percussion voices (VAB drum programs)
  are being played as pitched synth notes instead of a drums track. His track chips on that song read "ch1 prog1 … ch9 prog44": the
  program number IS carried per track (in the name), no "drums" track
  exists — so the fix is a program → drums mapping (which AKAO programs
  are percussion for FF7; the VAB knows) routing those tracks to ch 9.

Owner: the terminal session. The Ask session never implements.

TERMINAL, 2026-09-27 evening: N64 — the app's own capture code replayed
on the real Mario 64 set on the Mac (scratch/usf-app-path.mjs, the vm
harness driving CHIPS.usf with the real tools/n64 modules) gives exactly
the CLI's result (7 tracks, 1419 notes, drums on ch 10, 72 s, loop 3.1);
the scramble is iPad-only and needs the device's ⚠ log (Copy all) and
the row's status text — asked Josh. PS1 — FIXED: `kitify` in
tools/psx/notes.mjs (NIGHT-ROLL.md "PlayStation captures: percussion by
rhythm"); the 90-song FF7 program survey (scratch/ff7-programs.mjs)
showed drum-mode degrees 24–35 (all kicks in the app) and one-pitch
programs (36 = hat) as the noise. Bombing Mission now: prog 26 → kick,
37 → snare, 41 → closed hat, 66 → open hat; Those Chosen by the Planet:
17 → hat, 40 → open hat, 50 → kick. Josh's ear decides; the row's
warning names the guess. Re-import FF7 to get the new mapping.
Later the same evening: envelopes now come from the driver's
instrument table (NIGHT-ROLL.md "PlayStation captures: envelopes from
the instrument table") — bells fall, pads hold, per instrument; the
generic 12% decay is only the no-table fallback. Pad tracks (a few very
long notes) also get a `track: trN voice=sine` hint at capture. Still
open: the drum heuristic (rhythm) — the table has no percussion flag;
Genesis/N64 instrument envelopes; the N64 iPad scramble (diagnostic
line ships in the capture row's ⚠ log — awaiting Josh's Copy all).
Then, still the same evening — PS1 CHIP AUDIO shipped: the driver's
own samples rendered in the app (NIGHT-ROLL.md "PlayStation chip audio").
Open: pitch per instrument unverified by ear (VGMTrans's rule); no
pan/reverb; SEQ/VAB games not rendered. (PS1 chip audio now persists: minis
per track + the lib once, on the device and in the archive at Publish
— one re-import + Publish of FF7 populates it for every device.) N64: Josh's ⚠ log shows the iPad's captures equal
the Mac's (notes, ticks, tempo, loop) — the "scramble" is after the
capture or in the listening; asked for a published Peach's Message to
diff. The "1 note" was the warnings count (now "1 warning").
Later (Josh: "everything has reverted to not using the correct
instruments"): every unpublished PS1 song lost chip audio after the
app relaunched (my iPad rebuild). Cause: chipSource named the device's
chip record only by the legacy albums/imports/ prefix or a published
album.json — captures in the console folders have neither until
Publish. Fixed 6d4d40e: a capture's folder is its record's slug.
Reproduced and verified in Brave against a real FF7 minipsf; vm test
added. Publishing FF7 was never required for chip audio; it still
matters for other devices.
Josh's edge case (same hour, "not that worried"): re-import the set
while one of its songs is open, re-capture that row, tap open — the
song kept synth voices until he left and came back. Reproduced the
steps in Brave: the re-capture re-kicks the render, open lands while
it runs, the render then publishes for the open song — so the state
machine is not stuck here. What is left: ▶ waits at most 25 s for a
render (play(), "console render still running after 25 s" in ⚠) and
a PS1 render on the iPad can run longer; a render that lands
mid-playback does not switch over until the next ▶ (by design since
the mute review). Next time it happens: Messages → Copy all — the
⚠ lines say whether the 25 s cap fired and whether a later ▶ still
played synth.
N64 — Josh published Mario 64's Title Theme ("that one is a disaster").
Diffed against the Mac's capture of the same set through the app's own
code: identical, every note. The disaster is in the listening: the
drum channel (1459 hits) sat at GM keys 35 + drum index, an arbitrary
offset, so toms and cymbals played for every hit, and instrument 13
(128 hits of one pitch) played as a synth note. Fixed: the PS1 kit
guess is now tools/kit-guess.mjs and the N64 writer uses it (Title
Theme: D15 kick, D17 snare, D33 closed hat, I13 open hat, the rest
toms/ride); drums always on MIDI channel 9, a melodic N64 channel 9
moves off it. NIGHT-ROLL.md "Nintendo 64 import" → Percussion.
Re-import Mario 64 to hear it. Still open: channels 10 and 12 (415 and
934 hits in a 4–7 semitone range) stay melodic under the one-pitch
rule — if they are percussion too, the rule needs Josh's ear on them.
Josh, same hour: "we're definitely not using the right instruments on
Mario 64 … a drum instrument where you play notes on … we definitely
don't have that." Right: N64 has NO renderer — every song plays synth
voices by program number. The game's samples (ADPCM in the bank, in
the .usflib's ROM/RDRAM) are there to decode; an N64 sample renderer is
the PS1 renderer's job again (bank table → samples → per-instrument
envelope → renderSpu-style mix). SHIPPED the same evening (an agent
built tools/n64/{vadpcm,bank,render}.mjs against the real set; the
terminal wired CHIPS.usf + the worker; NIGHT-ROLL.md "Nintendo 64
import" → Chip audio). RE-IMPORT Mario 64 once: the mini per track is
stored at capture now. Open, for Josh's ear: nobody has heard the
render yet (tests hold pitch + loudness); Title Theme inst 3 renders an
octave below its written key and inst 4 an octave above — the console
does that, the roll shows the written key; inst 5/7's pitch reading was
inconclusive. Not rendered: vibrato, portamento, pitch bends (N64 bends
still ignored in the roll too), reverb, pan, synth waveforms, volume
changes inside a note. Zelda (OoT/MM) banks: another layout, not
started.
Josh's first listen (same evening): Lethal Lava Land "sounds great",
Dire Dire Docks "right instruments … notes cutting off a little bit
early", Cave Dungeon (his list's first song) "sounds weird … sorts
itself out after a little bit" vs YouTube. Measured: Cave Dungeon's
intro instruments (bank 21 inst 0/6/7) render exactly an OCTAVE LOW
(written E4 → E3; the chord likewise) until the other instruments
enter at 3.8 s and mask it — so the Title Theme's "inst 3 an octave
below, the console does that" was our bug, not the console's. Both
(pitch rule, note release) handed back to the renderer agent with the
numbers; fix pending. "Bob-omb Battlefield" is in the list as the
rip's tag title, "Main Theme".
Main Theme (Josh): "a tiny bit off … a background rhythm instrument
… up strokes … a little too loud compared to the original"; "the
original is in stereo … are we getting volume information and stereo
information?" Answer given: volume yes (velocity + channel volume;
NOT fades inside a held note, NOT reverb), stereo no (pan is read per
note, not applied; the render is mono). QUEUED after the octave/cut-off
fixes: pan → a stereo render (the app's chip buffers are mono
Float32Arrays per track; chipBuffers/chipStart would carry two
channels), per-note volume fades (DA), reverb as a wet send. The
too-loud up-strokes may be reverb/fade related; re-listen after pan.
STEREO SHIPPED app-side 2026-09-28 morning (NIGHT-ROLL.md "Stereo —
pan per track"): CC10 → midiPan, `pan=` on the track directive with a
fader in the voice menu, a StereoPanner per track, stereo chip pairs
end to end. The renderers' pan (N64 EAD + Rare, PS1) and the CC10
writes are with the two agents; until they land, tracks sit centred
and the fader is the only pan. Re-import needed afterwards to get the
game's pan values into the .mid.
SHIPPED the same morning, all on the iPad: renderers' pan (N64 both
drivers + PS1) with CC10 in the MIDI; GoldenEye bends through the
note + one note per landed pitch in the roll; GoldenEye's own reverb
block (found in RAM, six all-pass sections) with cc91 sends; cc7 under
held notes (Rare) and DF/E0/DB/DA level steps under held notes (EAD;
DA was a signed step — parser bug fixed); EAD vibrato from the decomp's
state machine (Cave Dungeon's D8 1 is ±3 cents — nearly inaudible, as
the game); Open re-reads the published list; tap-to-hear the game's
instrument (PS1/N64). GoldenEye: no modulation in the set (no
vibrato to add); level still 10–13 dB hot vs the real player, not one
factor. DONE: EAD portamento (C7) from the decomp — no SM64 song uses
it; the Cave Dungeon "swings" were the pitch estimator reading other
voices between phrases. Every EAD sound-shaping op in SM64 is a fact
now (`res.stubbed` empty). IN PROGRESS (two agents): the Zeldas' bank
layout for the EAD renderer (OoT/MM, verified against the real
player); the Rare driver on Banjo-Kazooie / Donkey Kong 64 / Perfect
Dark — the no-hacks rule's test.
RESOLVED by the agent against the decomp (same night): (1) the
"octave low" IS the console — that sample's recording sounds C3 when
the note says C4 (gNoteFrequencies[39] = 1.0 plays it at its native
rate); no transposition in the script; render = console. (2) Dire Dire
Docks' notes end by their own envelope, as in the game (no D2 sustain
in that song). What both songs lacked was REVERB: D4 sends were
stubbed. Now rendered as SM64's comb (window + gain per level preset
from the decomp's level scripts — the rip carries no preset, so a USF
player's render differs from the game here). Vibrato (D7/D8/E3) still
stubbed. OPEN FOR JOSH: the roll shows the WRITTEN key while the
sound is an octave lower for such instruments (Cave Dungeon inst 0/6,
Title inst 3, and inst 4 the other way). Should the capture shift
each instrument's notes to the SOUNDING octave (root detected from
the sample, as the PS1 path reports "sample root")? Recommendation:
yes, for study the sounding pitch is the fact; the written key would
go in the .notes.txt header per instrument.

QUEUED (Josh, same night): tapping a note on a chip song sounds the
synth voice, not the game's instrument ("when I press notes on Dire
Dire Docks … it sounds them in our MIDI instrument sounds"). Chip
audio is one pre-rendered stream per track, so a tap has nothing else
to play. Design: the render worker keeps the set/bank loaded after a
render; previewNote asks it for ONE note through that track's
instrument (N64: renderN64 on a one-note result; PS1: renderSpu the
same way) and plays the returned PCM — latency tens of ms. After the
envelope fix and pan. SHIPPED 2026-09-28 (NIGHT-ROLL.md "Tap a note:
the game's instrument").
Josh's later ear report on Dire Dire Docks (after reverb): "the notes
on YouTube definitely have more sustain … dramatically … as if the
notes fade over a long period and ours cut off." Handed to the agent:
verify the envelope delay unit and the gate-end decay verbatim from
the decomp. RESULT (INTEGRATION.md §9.6, verbatim quotes): JP/US uses
the envelope delay unscaled, one adsr_update per audio update, 240/s
(the ×updatesPerFrame/4 scaling is EU/SH/CN only); the gate-end decay
is releaseRate×24 per update; the instrument's envelope is
[6→32700, 298→0, 1→0, hang] for every instrument that plays this
recording, so the game itself ends each note 1.24 s after onset — the
recording loops and would sustain, the envelope never lets it. Render
= the US game's arithmetic; nothing changed. UNRESOLVED against
Josh's ear ("dramatically more sustain" on YouTube): either that
video is not the US engine's output (OST/arranged/extended, an
emulator audio plugin), or something neither side sees. Next: Josh
names the video; A/B in a real USF player.
GROUND TRUTH (same night): a real USF player built on the Mac —
lazyusf2 (derselbst fork; kode54's repos are gone), arm64 build
without the recompiler, `scratch/usf2wav <mini> out.wav [secs]`
(recipe: scratch/lazyusf2/build-mac.sh; HLE ≡ LLE to −70 dB). Truth
WAVs in scratch/truth/. Findings: (1) note length — the engine's
notes are −40 dB by ~1 s and gone by 2 s, same as ours: Josh's
"Soundtrack" upload is not the engine (OST mix?). (2) REAL: ours
decays too fast in the first half second (truth −3…−8 dB at +0.3 s,
ours −18…−25; onset→peak 0.17 s vs 0.11) — the "cut off" he hears.
(3) REAL: our clock runs 4.7% fast vs the engine (onset fit 1.047 on
DDD and Title). (4) Cave's octave-low intro: the engine does it too.
(5) Title inst 3/4: silent/quiet in the truth where ours is loud —
volume/mute handling to check. Items 2, 3, 5 handed to the renderer
agent with the numbers.
RESOLVED (INTEGRATION.md §9.7): (2) early decay — no bug, the
per-note band reading was other voices; aggregate decay within 1–2 dB
of the truth on four songs. (3) clock — the decomp gives ×1.0028; the
4.7% is the emulator pulled faster than real time. (5) REAL BUG, and
the answer to "dramatically more sustain": the sequence VARIATION
flag defaulted wrong, so Dire Dire Docks captured 2 of its 8 channels
(390 of 1963 notes) — the missing six are the sustained pads — and
Title Theme played its ritardando-intro table with two extra
channels. Fixed in the parser + sequenceOfSet; captures of those two
change, so Mario 64 needs a RE-IMPORT. Policy: all channels captured
(the game's per-area ducking is state, not composition).

## FIRST LISTEN OF THE BATCH — 2026-09-27 night (Josh, before bed)

- Contra (published NES, terminal importer): "the very first note from
  each of Pulse 1, Pulse 2, and Triangle are not being played … a high
  hit there … could possibly be a problem game-wide … it is"; Game
  Over: "the very first three notes of Pulse 2 don't play, all in bar
  1". RULED OUT here: the headless capture has those notes (reconstruct
  from frame 1/8); the headless render's pulse audio starts at 0.1 s;
  the LIVE site in Brave renders chip audio for Game Over (all four
  buffers, lead 0.133 s = the first onset, pulse2 energy from 0.1 s)
  and the roll's first notes sit at 0.00/0.17/0.41 s; the square voices
  are oscillators, not samples (so no decode gap). NOT ruled out: the
  iPad — chip render failing there (archive fetch/token, 25 s cap) and
  the synth scheduler dropping notes at tick 0 on the first pass, or an
  iPad audio-start quirk. NEXT: Josh's Messages → Copy all on a Contra
  song, and a Mac listen of the same song (does it happen in Brave?).
- Tetris (NES): "some C2 notes on pulse 2 that are very, very long …
  sounds horrible … all the Tetris songs sound bad … some I feel I'm
  missing". FOUND + FIXED: pulse 2 wrote period $6B3 with the sweep
  register 0 — the sweep unit mutes any pulse whose target period
  passes $7FF, sweep enabled or not (shift 0 doubles: every period from
  $400 up is silent unless negate) — the console plays nothing, our roll
  drew 1.6 s C2 drones and the render played them. Fixed in
  reconstruct + renderApu (tests/nsf.test.mjs "sweep mute"); all NES
  albums re-captured and republished. "Songs missing": the NSF has 7
  slots — that is the rip. Unverified by ear.
- SNES/Game Boy batches: not listened to yet.
BATCH OUTCOME (2026-09-28 ~03:40): 29 games via tools/import-set.mjs +
Shadow of the Ninja and Ninja Gaiden by hand = 31 new albums on the
site, chip files in the archive. NES 14, SNES 8, Game Boy 9. Pipeline
fixes found by the batch: NES player writes $4015 before INIT
(Castlevania was silent), Zophar NES playlists are H:MM:SS (every
track was a 12 s "jingle" before), Game Boy player powers the APU
(NR52/NR50/NR51) before INIT (six sets were silent), NSF expansion
chips refused by name (VRC7/5B/MMC5 sets captured 2A03-only
fragments), the sweep-unit mute (Tetris). All NES albums re-captured
after the sweep fix (e8a5da1). FF6 and A Link to the Past skipped —
Josh had published them in-app. iPad NOT rebuilt (unplugged): the
web has the render fixes; the iPad's packaged render lacks the sweep
mute until the next build. GoldenEye: agent running overnight.

## NO ONE-TIME HACKS — AUDIT 2026-09-27 (Josh: "we should have no one-time hacks in any of our capture engines")

Rule now in CLAUDE.md. Audit of tools/ (grep for game names, codes,
addresses): (1) HACK: `SM64_PRESET_OF_SEQUENCE` in tools/n64/render.mjs —
reverb preset per Mario 64 sequence id, copied from the level scripts.
Assigned to the renderer agent: read the engine's reverb state from
the mini's save state; no table. (2) SOFT: `TIMER_DIV_FF7` default in
tools/psx/akao.mjs — the AKAO tempo divisor is a driver-version
constant defaulting to FF7's; should be chosen from the AKAO header
(version/timestamp) with a warning when unknown. QUEUED. (3) OK:
`USF_GAMES` in tools/n64/ead-usf.mjs — a where-to-look manifest
(engine dialect, song-id convention) consulted after generic table
detection; `abi` sm64/oot/mm are engine dialects, not games. (4) OK:
tools/package.mjs FORBIDDEN is a licensing filter. The ducking fix in
progress reads the engine's channel state from the save state (generic
for every EAD-engine game), not a Dire Dire Docks list.

## GOLDENEYE 007 (N64, Rare) — QUEUED 2026-09-27 (Josh: "one of my favorite games of all time")

Probed the USF set (/tmp/claude-501/rips/n64-ge, NUS-NGEE-USA.usflib,
60 minis, `_enablecompare: true`): `locateEAD` finds no EAD tables
(expected — Rare did not use Nintendo's sequence player), so the app
says "a driver Night Roll cannot read yet". The ROM image (513 KB in
the rip) holds 10 candidate libultra ALBankFile headers ('B1'), no
MTrk, no '1172' magic where I looked. Known shape (community tools:
SubDrag's N64 Midi/Sound Tools): Rare's music table → 1172-compressed
ALCSeq (the SDK's compressed MIDI) + standard ALBank ctl/tbl with
ALEnvelope times in microseconds. Work: locate GE's music table in the
rip, decompress, parse ALCSeq → notes (a second N64 driver beside
seq-libultra), read ALBank, render (the N64 renderer's sample/ADPCM
code is reusable; the envelope model differs). The ground-truth player
(scratch/usf2wav) renders GE for reference. Next N64 job after the
sustain fix and the batch import review.
SHIPPED overnight (2026-09-28 ~04:10): tools/n64/rare.mjs — the song
table found in RAM, 1172 = raw DEFLATE, the SDK's compressed MIDI,
the SDK bank, renderRare (NIGHT-ROLL.md "Nintendo 64 import" → Rare's
driver; INTEGRATION.md §10). All 58 songs published as
albums/n64/goldeneye-007 with minis + lib in the archive. Unheard by
anyone. OPEN for Josh's ear: written vs sounding octave on programs 24
and 44; program 58 is a drum kit by ear but shows as C2/E2 melody
(ranged key maps defeat the single-pitch rule — the bank's percussion
flag is absent from the rip); no pan/reverb/vibrato; level offset.
iPad build still pending (unplugged).
~04:40 Josh (awake, in the browser, via Ask): "why is the chip audio
unavailable for GoldenEye songs?" — his ⚠: "token can't see
joshcough/nsf-archive (HTTP 404)". The FILE was missing: the terminal
importer never uploaded a set's shared library (only rec.bytes and the
per-track files), and my two "already in the archive" checks were
wrong (`gh api --jq .sha` prints "null" on a 404 — mega-man-2.nsf was
missing too). Fixed: both files uploaded and verified by size; the
importer now uploads rec.libs named as commitImports does; vaultFetch
follows the sha to the blobs API for files over 1 MB (Mario 64's lib
is 1.2 MB — the published SM64 album has no nsf block at all, it was a
one-song in-app publish; a full publish of Mario 64 from the iPad
would fix that). Verified: Dam renders on the live site with Josh's
own token, 15 chip tracks.

## GITHUB ORG FOR NIGHT ROLL — QUEUED 2026-09-27 (Josh)

"We need to get a Night Roll organization or user on GitHub so that
when people share their songs, it comes up as Night Roll instead of my
name." Today every published song and shared link lives under
joshcough/night-roll (and the archive under joshcough/nsf-archive), so
a shared song shows Josh's handle. Plan: create a GitHub organization
(e.g. nightroll), move night-roll + nsf-archive into it (GitHub
redirects old URLs; Pages moves to nightroll.github.io/night-roll or
a custom domain), update the app's default repos (cfg defaults in
index.html: songsRepo, nsfRepo/nsfBase, the raw/Pages bases, the
Capacitor shell's remote), the bridge/CI settings, and the share-link
base. Decide before the App Store listing (the listing's URLs point
at whichever it is). Josh creates the org (it needs his account); the
terminal does the moves.
DONE by Josh the same night: org https://github.com/Night-Roll-App
(joshcough is admin) and nightrollapp@gmail.com. TRANSFER RUN 2026-09-29
at Josh's go: both repos under Night-Roll-App, Pages at
night-roll-app.github.io/night-roll (legacy build, .nojekyll), local remotes
switched, saved device settings translated in cfg(). The old
joshcough.github.io/night-roll address is gone (Pages does not redirect).
MOVE CHECKLIST, as run (run
when Josh is not importing/publishing): 1. `gh api -X POST
repos/joshcough/night-roll/transfer -f new_owner=Night-Roll-App` and
the same for nsf-archive (GitHub redirects the old URLs). 2. Enable
Pages on the org repo (Actions workflow already deploys) → new base
https://night-roll-app.github.io/night-roll/. 3. index.html: cfg
defaults (songsRepo joshcough/night-roll → Night-Roll-App/night-roll,
nsfRepo joshcough/nsf-archive → Night-Roll-App/nsf-archive, nsfBase,
raw bases in readBase, APP_BASE/share-link base, any "joshcough"
string), tools/claude-bridge.mjs, the CI workflow, privacy.html and
docs/app-store-listing.md URLs, README, the Capacitor shell's remote
+ build. 4. Local remotes: `git remote set-url origin
git@github.com:Night-Roll-App/night-roll.git` here and in
night-roll-app. 5. Josh: a GitHub token that covers org repos on the
iPad (a fine-grained token scoped to his own repos will not), then
Settings → GitHub on the iPad shows the new repo. 6. iPad build;
old Pages link redirects for a while, tell the son.

## TRACK NAMES FOR m3u-LESS RIPS — OPEN 2026-09-28

Zelda (NES), Super Mario Bros. 3 and the Bullet-Proof Tetris came from
Zophar rips with no .m3u; their MP3 companions are named "Track N" too,
and the VGMPF track order does not match these rips' slot numbers (Zelda
slot 1 is an 80 s loop, the wiki's #1 a 2:49 title). No source with
slot numbers found; not guessing. SHIPPED the same day: a playlist
picked on its own (no import running) names the open song's album by
chip slot — local drafts renamed in place, a published album in one
album.json write (NIGHT-ROLL.md → File; HELP "names the open song's
album after the fact"). So the day a real .m3u appears, one pick names
them; until then Josh renames by ear (File → Rename) or leaves them.

## PLAYSTATION BEYOND FF7 — SHIPPED 2026-09-28

The AKAO driver version comes from the file (header layout 1/2/3 by
shape, the tick clock read from the driver code — `li a1, DIV` + `jal`),
so FF8, FF9, Chrono Cross, Parasite Eve and SaGa Frontier parse and
render with their own samples (tools/psx/INTEGRATION.md §7 has the
per-game table: tag lengths match two passes to 0.998–0.999 on FF7/FF8/
FF9/SaGa; PE and CC tags run ~10% long, the fade). SaGa Frontier's
4-byte minis name the song by index (pickAKAO). Sony SEQ/VAB renders
(Symphony of the Night's two sequences). One resolver for capture,
render and worker: tools/psx/capture.mjs `psfSong`. NOT SUPPORTED, with
the app's words: FF Tactics ("smds" sequences), Suikoden II (Konami
KDT), Wild Arms ("pQES" v ebf00101) → "no SEQ or AKAO music data in this
file — a driver Night Roll cannot read yet"; Mega Man X4 and most of
SotN are XA audio streams, not sequences. None of the new sets are
imported yet.

## GAME INSTRUMENT LIBRARIES — STARTED 2026-09-28 (Josh: "a killer feature — use instruments from any game ever")

Goal: any track in Josh's own songs can use an instrument from any
imported game. Not shipped in the app (copyrighted audio); lives in the
archive repo beside the chip files; tutorials may show importing but
never where to download. Plan: (1) extract every PS1/N64 album's
instruments — samples deduplicated, key regions, tuning, envelope, pan
— and NAME them by measurement (a best guess, editable), into
`<slug>/instruments/` in the archive (instruments.json + WAVs with
loop points); (2) an instrument browser: pick a game, play each across
the keyboard; (3) a track's voice can be a game instrument, recorded
in the song's track: directive so it plays on any device; (4) SNES
next (samples from the SPC's DSP memory), NES/GB/Genesis as synth
presets later. (1) DONE 2026-09-28: tools/instruments/ (NIGHT-ROLL.md
"Game instrument libraries"); all 14 PS1/N64 libraries published to the
archive at <vault folder>/instruments/ (one commit per album, checked
by size; ~270 MB — FF8/FF9/Chrono Cross carry a sample set per song).
(2) DONE 2026-09-28: File → 🎛 Instruments… (NIGHT-ROLL.md "Game
instrument libraries" step 2/3) — games, alphabetical A–Z (natural
sort, not most-used-first — Josh: FF7's list "is just a giant list"),
or by song, plus an "Instruments in this song" shortcut for a game song
you have open; tap plays one. (3) DONE 2026-09-28: the voice & color
menu's "Game instruments ›" family (same games/songs navigation) — any
track in your own song can borrow one as its voice, recorded as the
track: directive's voice= (game:<vault folder>:<instrument id>) so it
syncs/publishes like any voice; playback renders through
tools/instruments/play.mjs and caches, falling back to the track's own
synth voice (never silent) if a library/sample can't be reached.
NEXT: SNES instruments (from the SPC's DSP memory), then NES/GB/Genesis
as synth presets.
Josh's SF2 idea (same day): also WRITE each library as a standard .sf2
(usable in any DAW), and let the app LOAD any .sf2 as voices (fan game
fonts, a better piano than FluidR3) — ordering vs the browser is his
call, asked.

THE ARCHIVE, for the record: joshcough/nsf-archive, PUBLIC (that is
how other devices and Josh's son get chip audio without a token),
~76 MB, one folder per game holding the files Publish uploads. Set in
File → Settings → GitHub (defaulted, so it never needs touching).
Josh accepts the take-down risk (2026-09-28: "someone can ask you to
take it down, and you might have to … I'm willing to live with that").

## CONSOLE ORDER + GENESIS PARKED — 2026-09-28 (Josh)

Instruments next: SNES (samples from each SPC's DSP memory, merged per
album) → NES/Game Boy presets (pulse width + volume-fade shapes, named).
Genesis: PARKED — existing capture work stays; no new Genesis work now;
when a console is next added, Genesis goes first, following
docs/adding-a-console.md (the whole checklist: rips, ground truth,
capture, chip audio, publish, instruments, terminal import, listening
pass, docs).

## SAVE / PUBLISH / STORAGE — ADVISOR DECISIONS 2026-09-29 (Josh: "if the decision is to do something, put it in open-items and DON'T do it now")

1. CLOSE GUARD — DO (narrow). Today nothing guards a switch: loadSong()
   runs straight from the picker. Build: when switching to another song
   via Open/the picker while the ● shows (songUnsaved() and auto-save
   off), an in-app sheet "SAVE CHANGES TO <song>?" with Save (then
   switch) and Don't Save (switch), dismiss = stay. Skip it for a
   never-saved Untitled song and when there is no ●. Never on album
   auto-advance (a running album cannot stop for a sheet), never on
   backgrounding (iOS gives no chance to ask). No "Keep working copy"
   button: the working copy is kept regardless. Needs a two-action sheet
   (appConfirm is OK/Cancel only).
2. AUTO-PUBLISH ON SAVE — DO NOTHING. It reverses Josh's own ruling that
   Publish stays separate from Save; the songs repo is public; every save
   would be commits; it would hit the newer-save-from-another-device path
   far more often, unattended. If ever built: default off.
3. RECORDING STORAGE — DO (cleanup). No duplication: clip bytes live once
   in IndexedDB (store "audio", key songKey|file); the working copy, Save
   checkpoint and stash hold only the text naming the file. The gap:
   idbAudioDelete is never called. So deleting a song, or Revert to repo
   copy, leaves its recordings on the device forever, and Rename/Save
   As/Move (renameLocalKeys) does not move them — a renamed song with an
   unpublished recording can lose its clip. Build: idbAudioMove beside
   idbDraftMove in renameLocalKeys; idbAudioDelete for each clip when a
   song is deleted and on Revert to repo copy; optionally a one-time sweep
   of audio entries whose song no longer exists. The rename case is a
   real data-loss bug: do it before the rest.

## SCREENSHOTS FROM THE APP TO CLAUDE — QUEUED 2026-09-29 (Josh: "I wish there would be a way for me to send you screenshots from the app itself")

A 📷 in the ✦ AI panel: pick an image (an iPad screenshot from Photos —
works in Safari and the app) or, in the iPad app, capture the app's own
view (a small native plugin: WKWebView takeSnapshot). The image rides the
bridge with the message (the bridge saves it under its jobs dir and puts
the path in the prompt so Claude Code reads it). Also useful: attach
automatically to "this looks wrong" reports.

## INSTRUMENT PICKS NEED YOUR OWN COPY — ASKED 2026-09-29

Josh: changing a track's instrument is a write to the song, so only on
songs he can edit (his compositions / local copies); game captures stay
read-only except annotations (already true: captures open read-only and
Save As forks). Today a voice pick is stored as a track: annotation and so
works on any song. Plan: the voice menu's instrument picks (and, pending
his answer, volume and pan) only on editable songs, with a line pointing
to Edit locally / Save As; colours stay free. PARKED by Josh ("I wouldn't want to think about it right now"): two
options — lock instrument/volume/pan on songs he can't edit (his first
answer: lock volume and pan too), or allow changes and have Save offer to
make his own copy. Nothing changes until he picks.

## ARCHIVE BY CONSOLE — DONE 2026-09-29 (Josh: "why is the NSF repository not following the same directory structure")

Night-Roll-App/nsf-archive is flat (each album's vault at the root, named
by its slug; tetris.nsf vs tetris.gbs collided). Plan: git mv into nes/,
snes/, game-boy/, n64/, ps1/, ps2/ matching albums/; update every
album.json nsf.vault (instrument folders follow the vault); cfg-style
read translation for game-instrument voice ids that embed the old vault
("game:goldeneye-007:…" in Josh's songs), so no song breaks; devices
re-fetch each game file once under its new path (the IDB cache is keyed
by path). After the current Zelda fixes.

**Read translation actually landed 2026-09-29** (the plan above named it,
but it wasn't shipped when the archive moved — Josh's Ambush song surfaced
it: he picked a Final Fantasy VII instrument, and the pick fell back to
synth because `gameVoiceVault("final-fantasy-7")` still resolved to the
pre-move path). `resolveGameVault(idVault)` (index.html) resolves an old,
prefix-less vault to its album's current one via `instAlbums()`, matching
by stripping the console prefix; every game-voice reader goes through it
(`gamePreloadForSong`, `gameVoiceLabel`) or its sync counterpart
`resolvedGameVaultSync` (the voice menu's own current-voice marking/drill —
kept synchronous on purpose, see NIGHT-ROLL.md "Render races on the SAME
popup"). `gameLibSync`/`gamePreloadTokens` stay keyed by the ORIGINAL vault
throughout, so nothing about the in-memory caches changed shape. Test:
"game instrument voice: an OLD-form vault …" in tests/night-roll.test.mjs.

## TWO PRODUCTS? — IDEA 2026-09-28 (Josh: "not sure that we should take action on it")

"It's almost like we have two different products here. One is like Retro
DAW and the other one is the Learning DAW or the Annotations DAW. Maybe
later we rename them and ship them like that." Notes: one engine (roll,
annotations, playback, importers) — a split is packaging, and the
EDITION switch (web / app) already builds variants. The learning side
needs no rips (annotations, theory tools, own songs, starters): no
take-down exposure, easiest App Store story. The retro side carries the
rips, game instruments and the archive — the killer feature and all the
risk. Cost of splitting: the combination (a game song's notes read AND
heard with its own instruments) is part of the magic. Decide at store
time, with the org move.

## SUBSCRIBE TO OTHER LIBRARIES — IDEA 2026-09-28 (Josh: "not saying we should do anything about this right now")

"You should also be able to specify other repos that you want to pull
songs and instruments from … someone else does a bunch of work to import
a bunch of other games, and they want to use both sets." Shape: your own
songs + game-files repos are where you WRITE; any number of other
people's pairs are read-only SOURCES; the Open sheet's catalog is already
a union (initCatalog merges the site manifest with the bundle), so more
sources are the same merge, labelled by owner. The one change worth doing
EARLY: album.json's `nsf` block should record which archive holds its
files (e.g. `nsf.repo: "joshcough/nsf-archive"`) at publish time — today
`vault` is a path the reader resolves against ITS OWN cfg().nsfBase, so a
subscribed album would look in the wrong archive; albums published
before the field would need a fallback (the owner's default). Instrument
libraries ride along (they are files in the same archive). Open question:
two sources with the same album slug — show whose copy.

## RELEASE GATE — QUEUED 2026-09-27 (Josh, evening)

AUTOMATIC HALF DONE 2026-09-29: docs/release-sweep-2026-09-29.md (56
real sets through the app's own import path). Fixed from it: same-title
songs dropped "name taken" (49 N64 songs; now numbered, OoT/Banjo/DK64
re-captured). Still open from it, not investigated: 4 Chrono Cross
tracks 22-63 min long ("Cave Ambience" 3769 s — an ambience loop with no
end marker?); Majora's Mask #116 "New Wave Bossa Nova with Lulu" is 0
notes (its sequence uses the unimplemented `runseq` op); the 15 FFX
"Hymn/Hum of the Fayth" tracks capture as one note — CHECKED: each is
one note playing a stereo pair of samples (two regions), a sung
recording, the same class as The Prelude; correct. SNES captures never
report a loop (by
design: the loop scan is skipped for tagged SPC sets). The listening
half is still Josh's.

"Before we release this for real … imports of several more games on
all the systems and listen to basically every song … iron out every
possible bug … find games with obscure hardware and test those … if
they don't work, say we don't support this kind of game." The plan:
- A matrix, per console: 3+ games each, every song listened to once,
  a line per song (ok / report). NES: expansion audio (VRC6, VRC7,
  N163, MMC5, FDS, Sunsoft 5B) — what tools/nsf does with each, and
  a clear "this cartridge's extra sound chip isn't supported" if not.
  SNES: uniform (SPC700) — stress with big sample sets. Game Boy:
  uniform. Genesis: VGM with extra chips (YM2612+PSG only?). PS1:
  AKAO (Square) renders; SEQ/VAB (libsnd) games capture notes but do
  NOT render ("SEQ/VAB playback is not rendered yet") — either render
  them or say so at import; other drivers unsupported. N64: EAD only
  (SM64; OoT/MM bank layout not started); Rare/Factor 5/other drivers
  unsupported — say so.
- Every unsupported case must fail with a sentence that names the
  chip/driver, never a silent synth fallback.
- Josh's ear is the test; the terminal keeps the matrix here.
PS1 — Anxious Heart (Josh: bar 1 great, bar 2 "way louder", "every
other bar", fine from bar 10): the pad's expression fades swell inside
held notes; the render froze each note at its note-on volume. Fixed:
per-note gain breakpoints, followed sample by sample (NIGHT-ROLL.md
"PlayStation chip audio" → Volume inside a note). Measured: per-bar RMS
went from 4 / 29 / 15 / 29 to a steady 36 (swell up, swell down).
Re-render happens on open; no re-import needed (the render reads the
stored files).
PS1 — Cry of the Planet (Josh: "just missing a bunch of notes … the
repeating motif melody … the most important part"): the motif is one
held D slid through +7 +5 −4 −3 +2 −7 every eighth (293 slides on each
of three voices); pitch bends were counted and never applied, anywhere.
Fixed for PS1: slides ride the note, the MIDI/.notes.txt split it into
one note per landed pitch, the render bends the voice (NIGHT-ROLL.md
"PlayStation chip audio" → Pitch slides inside a note). The roll needs
a RE-IMPORT (the split happens at capture); the render bends on open
either way. STILL IGNORED: N64 pitch bends (the capture warns "channel
pitch bend"); Genesis/SNES/GB paths capture the chip's actual pitch, so
they are not affected.

## FFX "THE PRELUDE" CAPTURES AS ONE NOTE — CLOSED 2026-09-29: CORRECT

Final Fantasy X imported (92 songs, BGM/WD). "The Prelude" came out as a
single note over 48 s, and is the only song that did. Answer: the song IS
one note. Its bank (/wave/wave0048.wd) holds a ~895 KB sample, about 35 s
of PS-ADPCM, and the BGM (music048.bgm) plays it with one note held 96
quarters. The harp arpeggio is a recording inside the sample, not
sequence data, so no reader could turn it into notes. The console-audio
render plays the recording. Josh's ear, same day: it is only the 8-bar
opening of the 3:45 OST "Prelude"; the classic arpeggio (from ~0:46 on
the OST) is missing. Checked: the WD is a stereo pair (two regions, pan
0 and 127, ~17 s each), the rip's own comment tag says "Zanarkand City
(Intro)", its length tag is 1:36 (the 48 s note twice), and no other of
the 92 tracks' titles or comments is a Prelude. So the rip holds only
the intro; the arpeggio section is not in this set (likely the OST's
own arrangement — not verified).

## SOMEDAY / MAYBE — ideas Josh likes, none of them urgent (2026-09-28)

Josh: "these are just ideas we might want to do someday, they're not
really that important." Do not start these unprompted.

- **Picture-in-picture** (a floating roll window when the app is left).
  Verdict from the terminal's advisor: HARD — web-only freezes off
  screen and needs a tap; the real route is a small native iPad add-on,
  about 15-25 commits for the roll alone, behind a switch away from the
  audio engine; the score view costs more. Cheap first probe on offer:
  a five-minute throwaway page to see whether the iPad shows a floating
  window at all. Details in the PICTURE-IN-PICTURE section below.
- **Album links** (Josh, 2026-09-29, from the iPad): while an album plays,
  the address bar should hold the ALBUM's link, so he can share it and
  the recipient gets the whole album playing — "or maybe they have to
  press play, but then it plays the whole album". Notes from the Ask
  session: song links already exist (the address bar carries the song's
  path with no extension, reflectSongURL); an album link would be the
  album's path (or ?album=…) and open in album-run mode on the first
  song with ▶ ready. iOS and Chrome refuse autoplay without a tap, so a
  visible "Play album" tap is the honest behavior. Link-mode
  (read-only songs from another repo) needs the same handling. Small to
  medium.
- **The dev loop as a reusable kit** (Josh, 2026-09-29, after the 📷 screenshots
  worked: "this AI thing should be a plug-in for all iPad apps… someone
  could sit there working on the app, sending screenshots back to the AI
  and telling it what's wrong — an amazingly cool feature"). What is
  already generic: the native Screenshot plugin (WKWebView snapshot →
  JPEG), the bridge (per-app Claude Code session, inbox notes, jobs, the
  shots folder, --say/--status), the in-app panel (docked chat, 📷
  thumbnail chip, dictation, "Now:" status strip), and the wireless
  install step (devicectl over Wi-Fi). What it needs to be a kit: split
  the panel + plugin out of index.html into a package for Capacitor /
  WKWebView apps; a Swift package version for native apps; a config for
  the bridge (which repo, which session); developer builds ONLY (never in
  a store edition: the bridge gives an agent the repo and a token — the
  EDITION flag already keeps it out of Night Roll's store build). Needs a
  Mac running the bridge + Claude Code (+ Tailscale for remote). Not now.
- **Automatic analysis for people who want the answers** (Josh, 2026-09-29, on
  Learning vs Normal mode: "most people just want everything handed to
  them… most people go to sites to have the analysis done for them
  automatically, and then they just read the analysis — maybe something
  we could build eventually"). A Normal-mode tool: key, chords per bar,
  sections/form, cadences, shown on demand (a button, never ambient; in
  Learning mode it stays off and the AI keeps not revealing). Josh feels
  strongly about the Learning-mode split itself; this is the follow-on.
- **Learning mode, grown into a curriculum** (Josh, 2026-09-29: "we can build
  in music theory quizzes, rhythm games where you learn to read rhythm,
  all sorts of stuff — this could really help you learn music and theory
  if we go slow and develop the right features"). Seeds already in the
  project: the tutor rules (derive, don't be told), glossary.md's
  "encountered vs demonstrated" ledger, the session-start quiz habit, the
  score renderer, the Ask tutor. Candidate features, each a small
  on-demand tool: quizzes drawn from the learner's OWN annotated songs
  (name this interval / chord / cadence in bars 9-12), rhythm-reading
  drills on the score view, ear training against the app's own synth,
  a progress ledger that promotes a concept only on demonstration. Not
  now; needs the Learning/Normal mode split first.
- **Themes** (the look is dark; other people may want another). Size
  from the Ask session: easy-to-medium. The whole look is nine CSS
  variables at the top of index.html and the canvas views read them
  through one cached helper, css(); a theme = a second set of values +
  a Settings switch (device-local pref) + cssCache reset and a redraw.
  Work: about a dozen hard-coded colors move into variables (the error
  red, white note text, shadows, overlays), the VexFlow score view
  needs checking per theme, a light theme needs a taste pass on the
  iPad (track/note colors were tuned on dark), the browser top-bar
  color (theme-color meta). Start with two themes, dark + one light,
  prove the switch, then add more.

## TERMINAL NOTES AS iPAD NOTIFICATIONS — DECIDED 2026-09-28: WAIT FOR THE APP STORE WORK

Josh asked whether the bridge's terminal notes could become iPad
notifications. Options weighed in the Ask chat: (1) local notification
from the shell while the app polls the inbox (only while running or
playing); (2) a push service (ntfy/Pushover) fed by the bridge — an
hour of work, no Apple setup, but note text transits a third party;
(3) real APNs push, which the App Store build gets anyway (developer
account + a small server piece). Ruling: no interim hack; do (3) with
the App Store work. Until then the email-per-finished-item habit stands.

## PICTURE-IN-PICTURE — ASKED 2026-09-28 (Josh, right after background playback worked on the shell)

Josh: "when I go to the home screen with a YouTube video playing it has
a small window I can swipe to the side or make smaller — can we do
that?" PiP is a video feature. Candidates, UNVERIFIED on the iPad:
(1) canvas.captureStream() into a hidden <video>, then
webkitSetPresentationMode("picture-in-picture") from a tap — shows the
roll/cursor in the floating window; (2) native AVPictureInPictureController
from the shell with a sample-buffer layer fed from the web view — big.
Risk to weigh first: a <video> element beside the audio engine we just
stabilized (the engine rewrites on 2026-09-27 all went mute); try only
after background playback has had real use, one step, by ear. Josh's ruling (2026-09-28, "none of this is actually necessary, but
add it to the open items and if it isn't too difficult maybe we can
try"): the window shows the piano ROLL and nothing else. Later, if that
is easy: whatever view is open (score / tracks / roll). Optional and
low priority; try only if cheap and only after background playback has
had real use.

SIZED 2026-09-28 (advisor, read-only): HARD. The roll redraws on
requestAnimationFrame, which stops when the app leaves the screen, so a
web-only PiP window would freeze on its last frame; only the 60 ms
scheduler interval keeps running. A web PiP also needs a tap to start
(no auto-PiP on leaving). The advisor says canvas.captureStream() is
broken on iOS (WebKit bug 181663); UNVERIFIED, since that bug may be old.
Real route: a small Swift Capacitor plugin (AVPictureInPictureController +
AVSampleBufferDisplayLayer) fed canvas frames from a timer, behind a flag,
estimated 15-25 commits for roll only; the score view costs more (many
canvases). First probe if wanted: a throwaway page, not index.html, that
checks whether any PiP window appears from a canvas in the iPad app.

## BACKGROUND PLAYBACK — DONE 2026-09-28 (step 2: navigator.audioSession "playback"; Josh: "basically good enough") (Josh, iPad: "when I background Night Roll can we keep playing music? YouTube does")

Facts from the repo: YouTube plays because it drives a real media
element; Night Roll plays through a bare AudioContext, which iOS
suspends when the app leaves the screen. The August silent <audio>
keep-alive was a 2 s LOOP whose wrap seeked and stalled the iPad
(removed c704c43); lock-screen controls were left out of album play v1
for the same reason (NIGHT-ROLL.md "Album play"). Candidates, all
UNVERIFIED on the device and to be tried ONE AT A TIME by ear (see the
audio-night lessons: known-good engine, no rewrites): (1)
navigator.audioSession.type = "playback" where WebKit supports it;
(2) route master to a MediaStreamAudioDestinationNode feeding a real
<audio> element that plays the live stream (no loop, no seek), plus
Media Session metadata for lock-screen play/pause; (3) the Capacitor
shell declares the Audio background mode, the reliable App Store route.
Owner: the terminal session.
STEP 1 (2026-09-28, night-roll-app 29a6cb6, awaiting a plugged-in build
and his ear): the shell ALREADY set AVAudioSession .playback in
AppDelegate; the missing piece was Info.plist UIBackgroundModes = audio,
now added. Nothing in index.html changed. Expected: console-audio songs
(chip buffers are scheduled whole) keep playing off-screen; synth-voiced
songs and album advance ride the page's timers, which iOS may throttle —
if those stop, step 2 is keeping the scheduler alive, not the engine.

## CAPTURES AS BACKGROUND JOBS — QUEUED 2026-09-27 (Josh, from the iPad)

Josh: "we ought to have some sort of a job system where the captures go
off into long-running jobs and you can reopen them to look at what
they're doing later — you should not feel worried about minimizing or
even closing that capture window as it goes." Shape: a job list (footer
or File menu) with per-job progress; the capture panel is a VIEW onto a
job, so closing it never cancels; chip renders already run in a Worker
and captures should follow. Same day, shipped alongside: sheets drag by
their title line (71af6ef) so Ask can sit beside the capture panel.
BUILT the same evening (branch `jobs`, merged): the general job core
(NIGHT-ROLL.md "Jobs (footer ⏳)"), captures and publishes as its first
two kinds, cancel / retry / interrupted-at-boot. Not yet: Publish all as
a job, captures in the worker (the design's later steps).
Design done the same day by an advisor: capture-jobs-design.md (job
model, ⏳ footer chip + jobs sheet, the import panel as a view, five
commits in order). Implementation not started; the terminal session or
the Ask session takes it on Josh's word.
BUILT 2026-09-29 (Josh's four asks): finished jobs (done/cancelled) clear
themselves ~10s after they end (failed/interrupted still stay for ↻/✕);
real progress bars on each job row (`jobFraction`) and in the new
publish dialog; a real publish dialog `#pubjobsheet` — one job, an
overall bar, a row per song with its own state, Cancel while running,
Close always never cancelling — opened by the folder Publish button in
Open → LOCAL, by Publish all, and by the jobs list's Open on any publish
job (replacing the old jump to File → Open → that folder); **Publish all
is now a job** (`publishAllJobStart`, kind `publishall`), one item per
pending song including the general chat, same publishing flow as
before, cancellable between songs, one at a time. Still not done:
captures in the worker (the design's last later-step).

## CONSOLE IMPORTS — ON MAIN 2026-09-27; GAME BOY IN THE APP

The five overnight branches (gbs, vgm, psx, spc, n64) merged to main at
33b185d on Josh's "no reason these couldn't be pushed to master". Each is
`tools/<console>/` with RESEARCH.md + INTEGRATION.md + a dump CLI +
tests in `npm test`. **GBS is wired into File → Import…** (same day, via
the bridge relay: Josh had the Final Fantasy Legend zip on the iPad) —
see NIGHT-ROLL.md "Game Boy import". Awaiting his test on a real rip
(FFL1: DMG-SAJ.gbs + 17 per-track m3us). VGM/PS1/SPC/N64 remain command
line only; next step per console: a real file from Josh's collection
(never committed), then the app hook per its INTEGRATION.md.

## GENERAL ASK (not per song) — SHIPPED 2026-09-27 (NIGHT-ROLL.md → The AI bridge → General chat)

Josh via the bridge: "we need to have some sort of main ask section
that's not per song … I'm talking to you on the death song from Final
Fantasy but nothing we're talking about has anything to do with that."
Shipped as the ♪ this song / ✦ general toggle at the top of ✦ Ask: own
store + bridge session ("general"), no song context, no annotation
tool, log at `ask/general.ask.md` published from the PUBLISH sheet
(own block + Publish all). Open: a way in with no song loaded at all
(today a song is always open, so the toggle suffices).

**GBS .m3u discovery (Josh, 2026-09-26) — two known app fixes before GBS
import works.** Zophar's rips of the two Uematsu Game Boy scores (The
Final Fantasy Legend, Final Fantasy Legend II —
<https://www.zophar.net/music/gameboy-gbs/final-fantasy-legend-the> and
`.../final-fantasy-legend-ii`) each ship a small zip holding ONE .gbs
(`DMG-SAJ.gbs` / `DMG-S2J.gbs`) plus one .m3u PER TRACK (17 and 19 files,
named `02 Main Theme.m3u`), not a single playlist. Sample line:
`DMG-SAJ.gbs::GBS,1,Main Theme - Nobuo Uematsu - Final Fantasy Legend -
©1989-12-15 Square,01:28,,10`. So: (1) `parseM3u` (index.html ~10058)
matches `::NSF,` only → needs `::(?:NSF|GBS),`; (2) the Import handler
(~10097) reads `m3us[0]` only → must parse every picked m3u and merge.
Recorded in tools/gbs/INTEGRATION.md, which previously claimed the m3u
handling needed no change. Josh has the FFL1 zip on his iPad already;
GBS is still command-line only, so the m3u fix lands with the app hook.

## THE AI BRIDGE, FOR EVERYONE — 2026-09-26 (NIGHT-ROLL.md "✦ Ask / ✦ Fill" → The AI bridge)

Josh: "I want to make sure everybody can run this with LM Studio or
Claude Code or both, or Ollama … that's what I am planning to roll out."
Rebuilt the bridge as one configurable server: upstreams by flag (LM
Studio and Ollama auto-found), Claude Code if installed (read-only by
default, `--claude full` opt-in), one model list, jobs for every model,
kept on disk until fetched + 24 h, `--token`, `--host`; tests in
tests/bridge.test.mjs against a fake upstream; README section; `npm run
bridge`. His box runs `--claude full --upstream lmstudio=…`; the iPad
now needs only the /claude URL for both models. Not done: a launchd
plist / `brew services`-style always-on; a per-song `--resume` session
to cut Claude's per-turn latency; a "Models" refresh button in Settings
(Test already re-lists).

## ASK TOOLS + CLAUDE CODE BRIDGE — SHIPPED 2026-09-26 (NIGHT-ROLL.md "✦ Ask / ✦ Fill" → Tools, Claude Code as a backend)

From the first .ask.md (graveyard-2). Josh's rulings, applied: the AI
writes any annotation he dictates (chord, section, key, tempo, loop,
note) — never on its own initiative; it can read other songs in the
repo; and Claude Code is his backing LLM. Built: OpenAI tool calling in
✦ Ask with app-run tools; `tools/claude-bridge.mjs` (OpenAI protocol →
`claude -p`, read-only repo tools + web) mounted at
`https://<mac>.<tailnet>.ts.net/claude`. Both verified in the browser:
Qwen and Claude each wrote the asked-for annotation; Claude also read
tools/song-diff.mjs and described it. The ntfy dev channel stays as is
(async requests to a live session — a different job).

For Josh's iPad: File → Settings → server URL
`https://joshuas-macbook-pro.tail136602.ts.net/claude`, Test, model
`claude-code`, context 100000. The bridge must be running on the Mac
(`node tools/claude-bridge.mjs &`; not persistent across reboots — a
launchd plist is the obvious next step if he wants it always on).

**What happened next (2026-09-26, from threnody-2.ask.md):** through
the bridge, Claude Code edited and pushed twice on Josh's "go"
(c2f0bcf: dictation refill + growing Ask box; 9cc232a: a tapped Stop
keeps the last sentence — fixing its own regression), because his
global permission mode is "auto". In other turns it told him it was
read-only, which is what confused him ("I was able to get you to
implement some things … but not everything"). The bridge prompt now
tells the truth about capabilities and binds CLAUDE.md. His other three
reports — the question vanishing when the sheet closes, answers lost
when he switches to YouTube, "very old messages" after coming back —
were one design gap: the reply was only stored when it finished and
the run died with the connection. Shipped: the job model (bridge keeps
the run; the app saves the question at send and fetches the reply on
return). Not yet seen on his iPad. Then (same day, through the bridge):
"scroll away from the dialogue after I send a message, maybe work on a
song, and when a message comes in get a notification … like the one in
the bottom right for error messages" → shipped: the ✦ reply footer
badge (⚠ pattern), polling continues with the sheet closed, and the
reply is keyed to the asking song. Not yet seen on his iPad either.

Open: replies through the bridge take 10–30 s (a Claude Code run per
turn); a persistent session per song (`--resume`) would cut that and
the cost; Claude's own tool use shows only as the thinking counter;
LM Studio's Qwen sometimes answers a first request with thinking only
(one silent retry is in); a launchd plist so the bridge survives
reboots. Dictation and prompt fixes from the same log shipped earlier
(3c280b5).

## COMPARE WITH REPO — SHIPPED 2026-09-25 (NIGHT-ROLL.md "Compare with repo")

Josh picked the roll overlay ("by far the best one") over a what-changed
list and an undoable Revert; those two stay available if he wants them:
- What-changed list on the ♪ line in Save & Commit (~80 LOC, reuse
  `cmpDiff`, rows in the annotation-row style).
- Undoable Revert: stash the draft, "Restore local copy" in File until
  the next edit/save (~25 LOC). Revert today is NOT undoable.
Open: he has not seen compare on the iPad; the swap button's wording;
whether the dashed/solid convention reads at a glance.

## SETTINGS SHEET — rebuilt 2026-09-25 (NIGHT-ROLL.md "✦ Ask / ✦ Fill" → Settings sheet)

Josh's "go" on all four: no Save button (every field saves on change;
Close/✕/backdrop/Esc always safe); Test has its own gold/red result
line, disables its button while running, aborts at 8 s with its own
diagnosis; Test picks + saves a model (his last pick if the server still
has it, else the first non-embedding id) and the model field is a
dropdown; AI section first, data locations folded into a `<details>`,
text inputs styled like the rest. Browser-verified on the Mac against
LM Studio (✓ line, dropdown of 4, saved) and against a black-hole IP
(⚠ no answer in 8 s). Not yet seen: the sheet on his iPad.

## SAVE & COMMIT SHEET — rebuilt 2026-09-25 (NIGHT-ROLL.md "Sync / Save & Commit sheet")

Follow-ups the same day, all applied: titles sit on the ✕ row (all
sheets); "open it to commit" became an Open button on each non-open
song; the redundant Close buttons are gone from every sheet (his ruling:
every dialog closes with the ✕ top right). Not yet seen on his iPad.

Josh's rulings, applied: song sections, open song first; a line when
music is edited, one row per unsynced annotation (with its ✕), one line
per song for unsaved chat (his correction: NOT one per message); the
token how-to gone unless there is no token; the button says "⇪ Commit
song"; whole sheet scrolls. Fixed on the way: "Commit all" marked an
edited composition clean without pushing its .mid (advisor's find).

Deferred (his call when wanted): "Commit all" shipping other songs'
MUSIC and CHAT too (~70 LOC: build a song from the draft doc, put the
.mid, per-key ask log). Until then the include-line says music and chat
commit from the open song, and a non-open song's ♪ line says "open it
to commit".

## ✦ ASK LOG — SHIPPED 2026-09-25 (NIGHT-ROLL.md "✦ Ask / ✦ Fill" → History / The log file)

Josh's rulings, all applied: no message cap, chat kept whole until he
saves; Save appends to one `<song>.ask.md` per song (no button, no nag);
Save doesn't clear; Clear chat = new session (asks only if unsaved);
the ● lights for unsaved chat; when local storage runs long, only
messages already in the file are shed and the window shows them from
the file. Deferred by him: explicit sessions ("not yet"). Open: browser
check of the earlier-messages bubble on a real trimmed log.

## P4 iPad → Mac AI route — DONE 2026-09-25 (recipe in NIGHT-ROLL.md "✦ Ask / ✦ Fill")

Works end to end from his iPad. Still open from the same list: the
in-browser backend's Test on the iPad (WebGPU), the Safari-on-Mac
https→localhost probe (P0). Ask input bug found tonight and fixed
(ca2ed02): a live 🎤 re-filled the box after Send.

## Pages builds are Jekyll: a bad byte in ANY .md kills the whole deploy (found 2026-09-23)

Three deploys failed today on `handoffs/handoff-2026-09-22-night-black.md`
("invalid byte sequence in UTF-8") — the site silently stayed on last
night's build while tests were green and I read the first failure as a
deploy collision. Fixed by re-encoding the file. Standing rule from now
on: after moving a handoff in, run `iconv -f UTF-8 -t UTF-8 file >
/dev/null` before committing. Recommendation for Josh's call: add a
`.nojekyll` file at the repo root — Pages then serves files as-is (no
Jekyll pass, faster builds, no Markdown parsing failures). Cost: none
found — the app never links to Jekyll-rendered pages; the path-form URLs
rely on 404.html, which Pages serves either way. Not done unasked.

## HANDOFF 2026-09-22 — Night Black / Carnival composition session (handoffs/handoff-2026-09-22-night-black.md)

Web-session record of Josh's 2026-09-19→22 composing. Applied
2026-09-23 without needing him: quiz marks logged (quizzes.md), session
concepts logged (supplemental-learning.md), `tools/query-lib.mjs` now
resolves a path without `.mid` and says what it looked for.

**Josh's rulings, 2026-09-23 — all applied:**
1. Rename **done** (he ruled "definitely"): `town-theme.*` → `carnival.*`
   (git mv, the album.json title override dropped, manifest rebuilt, a
   third boot-time path remap carries every device's per-song keys —
   draft, notes, edits, ts, tombs, lastsync, lastsong). Two more
   cleanups the same breath: `KeyChangeTest-07-26.*` moved from My
   Compositions to Night Roll Sketches (override moved with it); the
   Sketches copy of the FF1 battle theme (`ff1-battle.*`) removed.
2. Glossary **added**: encountered — mordent, Phrygian cadence, augmented
   sixth, line cliché, tritone substitution; demonstrated with his Night
   Black anchors — chromatic mediant, hocket, Lydian ♯4 / C(♯11), 13th
   chord, accented passing tone; neighbor tone gained the bar-20 anchor.
   His caveat stands: demonstrated ≠ retained ("sometimes I demonstrate
   them and don't know until after"); retention is what the quiz streak
   measures.
3. `albums/compositions/nightroll/night-black.md` **written** in his
   words (he confirmed every fact and that all of it was intentional).

**Glossary status ladder — RULED 2026-09-23, written into glossary.md:**
encountered → demonstrated (did it on purpose, word or no word) → owned
(chose it BY NAME before writing, then it worked — "the intentionality
of it"). Quiz streaks and repeat use do not promote; the streak rule
stays as a retention measure. The 2026-08-23 two-axis scale (PARKED
BACKLOG below) is superseded by this. Practical: when he says what he
is going for before writing a section, note it in the song's journal —
that note is the owned-evidence if the passage lands. No `owned` terms
yet. (He tabled further thought on this the same day.)

## LOCAL FOLDER MODE — SHIPPED 2026-09-15 to main (local-folder-design.md)

Josh's ruling: saving without GitHub is its own project and comes
before audio tracks. Two reasons: his son has no GitHub (Chrome on a
MacBook Pro), and GitHub removes content on DMCA notice, so a
recording that is not yours needs a durable home that is not GitHub.
Shipped on main (Josh: "that can go right into the master branch and
get deployed immediately"): Settings → Choose folder… (Chrome/Edge
desktop), reads folder-first with site fallback, every write to the
folder, catalog = site ∪ folder scan, 📁 Reconnect folder in the File
menu when Chrome wants a fresh grant. Details in NIGHT-ROLL.md "Local
folder mode". AWAITING Josh's field test on his Mac. Open: iPad/Safari
bundle fallback (v1.5); autosave-on-edit in folder mode (explicit Save
kept); copying the FF1 corpus into a folder for a folder-only user.

## AUDIO ("wave") TRACKS — SHIPPED to main 2026-09-17 (Josh: "all the wave stuff is ready to go")

Josh's son: "I wouldn't use it unless it supported waves." Design in
`wave-tracks-design.md` (revised after an advisor review, appended
there verbatim; verdict: ship with changes, §2 re-anchored). Shape:
an empty named track in the .mid + an `audio:` annotation (file,
bar.beat anchor, offset) derived onto the track at finalizeNotes like
voice/color; bytes on device until Save, then the folder or a
dedicated public audio repo; playback = one buffer source per pass
through the existing scheduler; waveform in the tracks view, a span
strip in the roll, nothing in the score. Hard rule added (doc §14):
other people's recordings never go to GitHub — a per-clip "someone
else's recording" toggle blocks upload. BUILT on `audio-tracks` per the
post-review design (NIGHT-ROLL.md "Audio tracks"): import (＋∿ + File →
Import), decode via OfflineAudioContext, per-pass scheduler events with
pass-end/album clamps and cycle chase, tracks-view waveform + drag,
∿ strip in every view, recording sheet (nudges, align first sound,
replace, local-only toggle), Save uploads beside the .mid. Merged to main
2026-09-17 after two days on the preview (pieces: trim/split/remove/move;
import auto-trim; 16th nudges; ♩ Tempo from this take, level 1). Also
shipped 2026-09-17: pitch-preserving slowdown (plan B: WSOLA in a
worker, cached per speed; tape-style is a device toggle in the sheet).
Beat mapping (tempo level 2) shipped the same day: automatic —
onset curve → DP beat tracker → downbeats by meter/accent → one tempo:
per bar; the sheet shows the map first, ◀/▶ downbeat corrects, Apply
writes. Still open: Save As / Move carrying `.audio/`, mic record,
per-piece loop, fades, transposing a take.
Also on main the same day: "show only this folder's songs" (his son's own
list). The preview repo stays as the branch-preview mechanism; it was
DEPLOYED for testing at
https://joshcough.github.io/night-roll-preview/ (repo
`joshcough/night-roll-preview`, Pages from its main; separate origin =
separate browser storage). Redeploy = `git push preview
audio-tracks:main`; rebase on main first so it carries the latest
songs. CI runs the full suite on the branch too (tests.yml).
Known gaps: Save As / Move to… don't carry `.audio/` bytes yet; no mic
record; no per-clip loop. Pre-existing quirk surfaced by this work:
`parseMidi` drops note-less tracks, so a composition's EMPTY voice
tracks vanish when it reloads from its saved .mid (the local draft
hides this on the device that saved it). Audio tracks recreate
themselves from their annotation; plain empty voices do not.

**Josh's rulings still needed (doc §11):** (1) does his son want a
record button; (2) dedicated audio repo as Josh's default; (3) Save
migrates to one batchCommit (today three Contents-API commits per
Save); (4) the "real state" rule reframed (doc §10); (5) mono downmix
at decode; (6) roll strip yes/no.

**Branch rule (Josh, 2026-09-15):** feature work on its own branch,
never merged to main until proven, deployed to a second repo
`night-roll-preview` with its own Pages site (separate origin =
separate storage = bug isolation). Audio doc §12.

## Album play — SHIPPED 2026-09-14, redesigned the same day

Round 1 (transport button behind a View toggle) confused Josh within an
hour: the button changed meaning, ⏮ changed meaning, the run ended
silently. Round 2 advisor ruling, shipped: the album is a STRIP under
the track row that exists only during a run (3/19 · next, ⏮ Prev, ⏭
Next, ✕); the only entry is File → Open → 💿 Play album; the transport
never changes meaning (■ pauses, ▶ resumes); the list wraps forever; no
repeat control. Two passes per looping song; screen-on OK. Details in
NIGHT-ROLL.md "Album play". Open: lock-screen controls (needs a media
element — reproduce the August stall on his iPad first), a passes pref
if 2 turns out wrong for a song, shuffle.

## HANDOFF 2026-09-12 — note length editing (handoffs/handoff-2026-09-12-note-length-editing.md)

Cloud-session proposal, Josh signs off before the model changes. Landed
the same day, no sign-off needed (its own "first fix regardless"): the
▦N chip in the duration row whenever a custom grid rules, and the grid
turning off when another song opens. Also landed earlier the same day:
duration chips visible in Select, gridFollowNote (the grid follows the
note you touch), pencil = one cell under a custom grid everywhere.

**Awaiting Josh's word (the handoff's §4):**
1. One chip row `32 · 16 · 8 · 4 · T · ▦N` = THE snap for move, resize,
   pencil length, pencil drag, paste, record — and kill the "32nds only
   when the song contains them" rule (32 is a chip).
2. Pencil = insert one cell, then the note is ordinary; value × modifier
   picker goes away (dotted = drag one more cell, or a long-press).
3. Resize = drag the edge in Select: finger-sized edge zones
   (max(14px, 30% of width); narrow notes: right 40% resizes, left 60%
   moves), a visible handle, "resize" in the arm message, NO dwell for
   edge grabs, live length readout.
4. gridFollowNote: keep, make opt-in, or drop? (It flips the chip to a
   quarter-triplet snap when you touch Ambush's lead — the handoff names
   it as a candidate for "everything moves in quarters".)
Acceptance list is in the handoff §5 (Playwright, iPad viewport).

## THE MENU — everything on deck (consolidated 2026-08-19)

**Music (the point of all of this):**
1. ~~B-part study → write the B~~ **JOSH WROTE THE B FIRST**
   (2026-08-19: cool-b-maj-with-b-part — key change to ♭VII, formal
   deceptive resolution across two Breaks, parallel-minor exit, a
   labeled Turn, prepared bass-alone dropouts, harmonic-rhythm shift
   as the "Deceptive A part"'s contrast device). The STUDY now runs in
   reverse: analyze the corpus's B parts to name what he already did
   and find what he hasn't tried. Protocol below still applies.
2. Bass variation in Cool Bmaj — the lead voice's two verbatim bars.
3. Rename his tracks in-app (top/chords/bass/counter — feature shipped
   2026-08-19, names settled in the 08-18 handoff). Josh's two minutes.
4. The `top` voice question — back to square (matched pair with bass)
   or keep sawtooth separation? Josh's ear call, parked.
5. FF1 analysis thread: prologue F#–C tritone (THE NEXT MOVE), 6.1
   Gm-vs-C7 open, prologue key untested; older per-song queue below.

**App — built, awaiting Josh:**
6. ✅ MERGED 2026-08-19 — Web MIDI → ● Record is on main. Awaiting
   Josh's Jamstik field test (desktop Chrome; Safari has no Web MIDI).

**App — design work wanted before code:**
7. Context-aware drum generation (Drummer-style; full requirements
   below — seeds, one-tap reroll, constrained randomness).
8. ✅ Drums in the score view — SHIPPED v1 2026-08-19 (percussion
   clef, role positions, x-heads, hands-up/feet-down voices, kit staff
   at the bottom). Read-only: score-side kit ENTRY still open; open-hat
   "o" marks and flams someday.
9. iPhone top-row treatment (chips unreachable on phones).

**App — implementation-ready, medium:** ALL SHIPPED 2026-08-19 —
10. ✅ Chord bands ride rigid moves (label transposes) + ⚠ stale marker.
11. ✅ Tombstones: deleted synced annotations stay deleted across
    reloads; cleared on Sync.
12. ✅ Adaptive 32nd grid (Josh's spec: only when the song HAS 32nds or
    you pick the 32nd duration). REMAINING pipeline half: fitBpm could
    label TMNT2-style 32nd-run captures 150 instead of 300 now that
    the editor grid can hold them — capture-side change, re-capture
    required, treat separately.

**Someday:**
13. music21 private answer key (guardrails below; useful at ~10
    annotated songs).
14. Instrument-panel piano zoom (parked until fat-fingers bite).
15. Guitar audio input (monophonic pitch tracking) — superseded for
    now by the Jamstik/MIDI path, kept as the amp-and-cable dream.

## RESTART CONTEXT — 2026-08-25, mid perf-hunt (Josh rebooting his Mac)

**The hunt:** severe perf degradation, iPad worst (120fps→6, worst
375ms), now his MAC also crawled (nothing in Activity Monitor, 84% RAM
free — below-process-stats gremlin). THREE advisor rounds done:
- R1 found + PROVED the zero-sample silent-wav loop (fixed: 2s real
  silence, pauses with transport).
- R2: onended cleanup — but it MISSED the default oscillator paths
  (the exact voices his compositions play); fixed all 8 paths.
- R3: verified deploy byte-identical, traced every per-frame path
  clean; verdict "time is outside app JS or edit-triggered."
**Josh's decisive live repro:** Airship (chip song) = clean 60fps;
graveyard-2 healthy after RELOAD through several passes; stutter
starts AFTER THE FIRST EDIT and persists until reload. Not the drums.
**Probe build d8a6fb4 is live:** HUD (?perf=1) has hot:-line (wraps
incl. saveDraft/saveLocalNotes/saveEdits/annoSnapshot/finalizeNotes/
computeSongEnd), lag probe (blocked-main-thread vs throttled-rAF),
build stamp (File menu bottom). AWAITING: his hot/lag/fps reading at
stutter after one edit. Also fixed in-flight: kick-click buffer cache,
keyset per-frame DOM write guard.
**Next session:** get the three numbers; the edit-path wrap names the
offender. If hot≈0 and lag≈worst → GC/audio-IPC; if lag small → rAF
throttle (environment). He REMOVED the in-app dev-channel/feature-
request feature (this commit) as both a suspect and a risk — the
ntfy-app channel still works for him; code lives in git history. (The in-app dev channel itself was removed for good on 2026-09-26 — the AI bridge replaced it.)
Perf fixes this arc (all deployed): silent-wav, scene-cache blit,
28px strip repaint, noise-buffer caches, all-path onended, scene
realloc guard, keepalive pause-on-stop.

## Song open hangs on a CDN blip (found 2026-08-25, NOT fixed — Josh: "naah")

Josh's iPad: two files tapped, neither opened, stayed on graveyard;
play button flipped straight back to play; reload took ~20s; airship
opened fine afterward. Not perf — a hung fetch.

`index.html` `loadSongInner`, the cross-device freshness check:

    const r = await fetch(analysisURL(...rollnotes.json) + "?t=" + Date.now(), {cache: "no-cache"});

No timeout, no AbortController. It runs FIRST for any song with a
local draft (graveyard has one). The `catch` under it only fires on
rejection — a CDN that hangs never rejects, so the await never
settles. Consequences, all observed:

- `loadSong` sets `songLoading = true` and its `finally` never runs,
  so every later tap starts its own hang → "stayed on graveyard".
- `play()` sees `songLoading`, sets `pendingPlay`, returns without
  starting the transport → the button reverts. (That guard is correct;
  it is defending against a load that will never finish.)
- Airship is an FF1 song with no draft, skips the check entirely,
  goes straight to `songsURL(path)` — which is why it worked.

No service worker, and every fetch is `cache: "no-cache"` with
`?t=Date.now()` busting, so nothing is cached and a blip takes out
every load with no offline fallback.

Fix when wanted: AbortController + ~4s timeout on the freshness check
(abort → treated as offline, which the existing catch already handles
correctly: draft wins), same for the metadata fetches around 2267/2357,
plus a `setInfo` so a stalled open says so instead of failing mute.
The silence is what cost the debugging time, not the blip.

## PARKED BACKLOG — the 2026-08-23 curriculum session (filed 2026-08-26)

Two documents, both archived, nothing built. Josh: "a lot of ideas in
here that don't necessarily need to be implemented immediately."

- `handoffs/handoff-2026-08-23.md` — the compound-melody derivation and
  the grading-scale proposal.
- `ANALYSIS_CURRICULUM.md` (repo root) — 12 units, sources, and four
  tooling proposals. Stamped PROPOSED/PARKED at the top.

**Applied already:** the two glossary terms (compound melody, textural
density) are in `glossary.md` at `encountered`, Josh's call — he found
the structure in his own bass line but did not write it deliberately,
and he holds that `demonstrated` implies intent.

### Awaiting Josh's ruling

**Replace ENCOUNTERED/DEMONSTRATED with a two-axis scale.** His idea,
this session, because the binary has nowhere to put "found it in my own
music but wrote it by accident" — exactly where compound melody landed.
Recognition axis R1 HEARD / R2 RECOGNIZED / R3 DERIVED / R4 FLUENT;
production axis P0 none / P1 FOUND / P2 DEMONSTRATED / P3 MASTERY. The
axes are independent, not a ladder — high-P-low-R is probably his whole
existing guitar vocabulary. Terms with no production sense get `R2/—`
rather than `R2/P0`. Migration would be lazy: convert entries as they
come up, not a retrofit. **Not applied** — it changes how every glossary
entry is written, so it is his call, not mine.

### Blocking dependency for the entire curriculum

**MIDI import.** The existing importer is NSF-oriented; every curriculum
target is MIDI or Humdrum kern (kernScores has the 371 chorales, with a
GitHub mirror whose Makefile generates MIDI). Nothing else on this list
can start without it.

### Tooling proposals, unscoped

- **Reveal policy system** — per-song/album/collection declaration of
  which axes (key, spelling, phrase, chords, meter, sections) are
  revealed vs withheld. Josh's idea, unprompted: constraints should be
  per-corpus, because different constraint sets train different skills.
  Would require `WEB-SESSION.md` rule 1 to read the policy instead of
  being absolute; default all-withheld preserves today's FF1 behaviour.
- **New annotation types `spelling` and `phrase`** — nothing today
  carries per-note enharmonic spelling or fermata/phrase boundaries.
- **Transformation tools** — mode flip, bass reharmonization, voice
  swap, voice removal, squarify, non-chord-tone strip, rhythm flatten.
  Stated design principle, and the good part of the idea: *surface the
  failures rather than smoothing them over* — a naive minor↔major flip
  destroys leading tones, collapses secondary dominants and mangles
  Picardy thirds, and the flag list IS the output. Architecture question
  unsettled: does any of this belong in Night Roll at all?
- **Quiz generation from annotation data** — cadence classification,
  hidden-voice identification, Roman numerals drawn from songs he has
  already analyzed (spaced repetition over his own findings, which also
  makes it a consistency check against his prior self).
- **Generated textbook** — a page per glossary term listing every place
  in the corpus where he derived or encountered it. Depends on analysis
  docs tagging which terms they exercise: cheap as a convention going
  forward, expensive as a retrofit.

### Process note worth keeping

The tutor initially told Josh he could analyze Dancing Mad directly.
He pushed back and was right: FF1 is three diatonic voices, Dancing
Mad's organ section is dense chromatic writing across many voices, and
the comparison half of the question needs classical repertoire he would
have to build from scratch. The curriculum exists because of that
pushback.

## Airship handoff 2026-08-25 — applied in part, ANALYSIS ITEMS OPEN

Handoff archived at `handoffs/handoff-2026-08-25.md`. Code and tooling
items are done (f52b997 + follow-up); the analysis items are Josh's and
he chose "walk me through them" — go item by item NEXT SESSION, showing
evidence, no pre-filled conclusions:

ALL DONE except item 6. Closed 2026-08-26 on Josh's "do it all without
me" — he needed to move on from this song.

1. ✅ `analysis/airship.md` key section rewritten: F mixolydian (A),
   B♭ mixolydian (B), his scope argument, with the per-section census
   as evidence. Also records that the tutor flagged his reading as an
   error on the strength of the stale line in that very file, and that
   he pushed back and the data backed him.
2. ✅ The "Cheap verification available" chord-track-4 paragraph is
   gone. Replaced with the fact: three channels, because the 2A03 has
   three.
3. ✅ The E♭ question is now recorded as partly answered (♭7 as a modal
   degree of the declared mode in both sections) with the FUNCTION
   question still explicitly open, and the sourcing-vs-function
   reasoning kept because it will recur.
4. ✅ Bar 15 is one C7 band — Josh did it; the leftover Cm7 was deleted
   on his say-so 2026-08-26.
5. ✅ Tritone note now at 15.3 only. Verified against the capture: 14.3
   sounds D♯5/G♯4/C♯4 (no B♭, no E); 15.3 has triangle E4 sustaining
   against pulse2 A♯4 on the second half of the beat. **SECOND logged
   instance of annotation anchor drift costing session time — the
   standing drift-check request now has its second piece of evidence.**
6. ⬜ **STILL OPEN — his to write.** rollnotes: record both readings on
   the 13.1 F♮ per his own duration-vs-position convention. Fourth
   instance of that named pattern (Ship's pulse2 E, graveyard 7.3,
   graveyard bar 6). Left undone because it is an analysis call, not
   clerical.
7. ✅ `glossary.md` has the two-kinds-of-movement principle, anchored at
   airship 15–16, with both of his stated exceptions — including his own
   correction that contrary motion is the prized case and the real
   failure is voices implying different chords at the same moment.

Also fixed the bug class behind items 4 and 5 while closing them: chord
bands now replace on an identical span, keys dedupe at the exact anchor,
and identical text at one anchor drops. Different text at one anchor
still stacks, which is what he wants.

Still open on the song: D♭ vs C♯ at 14.3 and what D♭→G root motion is
doing; whether bar 14's third-dyads are substitution or omission; the
function of ♭VII in both sections; whether the prologue F♯–C tritone
thread and this one are the same device.

Owed: quiz ×4 (none taken 08-25). **Why none were taken (Josh,
2026-09-07): every quiz was hard end to end and long, so he stopped
asking.** New streak rule in quizzes.md: all terms quizzable, retire at
five sessions in a row, miss resets; ~3 easy + 2 stretch per session,
minutes not hours. Next session: run one under the new rule.

### Done from that handoff (2026-08-26)

- **Duplicate key annotations FIXED.** `dropLocalKeyAt` tested `n.added`
  — a flag only this session's annotations carry, never serialized — so
  it could not replace a key that had ever been synced, which is exactly
  what Josh hit. It also missed the tonic-only `keypartial` form.
- **Josh's ruling: key anchors are ANCHOR-level, not bar-level.** A key
  at 3.1 and a key at 3.3 are two keys and both stand; a modulation gets
  its true beat. Only an exact anchor collision replaces. The keyset
  button still writes q1:1, so it replaces the bar's downbeat key.
  Locked by a vm test, mutation-checked against the old predicate.
- **notes.txt header** now states duration is GATE TIME, not a notated
  value, and that rhythm comes from onset spacing. Both writers
  (tools/dump_notes.mjs and the in-app dump). The web session read 0.33
  gates as triplets and asserted it twice.
- **Scanned all 48 rollnotes files for duplicate key anchors.** Airship
  1.1 (`F` + `F mixolydian`) is the only one in the repo. Left in place:
  it is Josh's annotation, and with the fix in, re-setting the key in
  the app now collapses it in one tap.

## PERF HUNT — SOLVED 2026-08-25: the iOS silent-switch keepalive

Cause: the silent mute-switch bypass (fca2d7f, 2026-08-22) looped a
2.0s silent `<audio>` forever. On WebKit each loop wrap is a seek —
makeSilentWav's own comment said so. Removed in c704c43 on Josh's
call ("what if we just remove that?"). He was right; I had killed the
edit theory too early and gone hunting canvas memory.

Same protocol, before and after, graveyard-2, edit at ~70s:

               stalls  worst frame  worst lag  avg fps
  with wav        55       120ms       71ms      58.9
  without          0        37ms        9ms      60.0

7200 of 7320 frames under 17ms. The edit at 69s changed nothing after.

How it hid: app JS was never above ~1.7% of wall clock, nothing in the
heap grew, the audio graph was clean, and the cost never appeared in
any wrapper — it was a media-element seek, outside all of it. What
found it was the PERIOD: stalls alternated on a 2.0s beat, and the wav
is 32000 bytes at 8kHz 16-bit mono = exactly 2.0s.

Why an EDIT tripped it (still unexplained, and now academic): before
the edit the same wav looped harmlessly for 70s. Something an edit
changes makes the seek expensive. Not worth chasing with the wav gone.

Guard: tests/night-roll.test.mjs fails if any `new Audio(` returns.
AudioBufferSourceNode loops stay legal — chip playback uses them.

If the mute switch bites a friend again: say so in the UI, or hold the
classification with a MUCH longer buffer. Never a 2-second loop.

Tooling that came out of this arc (all shipped, documented in
NIGHT-ROLL.md): the ?perf=1 session recorder with per-function
attribution, stall census, loop-wrap and edit-boundary correlation,
growth probe, per-song A/B segmentation, and the ?dpr / ?scene=0
experiment flags.

## Superseded — the hunt while it was still open (kept for the method)

### The edit theory is BACK (Safari recording, 2026-08-25)

I killed the edit theory too early. Josh's Safari recording revived it
with the cleanest evidence yet, and the per-song A/B did the work:

- ff1-battle: 131s, avg 60.3 fps, worst 49ms, **zero stalls in every
  single second**.
- graveyard-2: mildly worse from the start (blk 0-2, worst 60-76),
  then his edits land at 203-216s — `drawFull` hot in exactly those
  seconds, 4x saveEdits/saveDraft in the totals — and from ~218s it
  never recovers: worst 252ms, lag 223ms, the familiar alternating
  perfect-second / 5-7-stall-second pattern to the end.

So the song matters a little and the EDIT is what tips it over. This
matches Josh's original report from the previous restart context
("stutter starts AFTER THE FIRST EDIT and persists until reload")
which the Brave rounds had appeared to contradict.

What makes it hard: **the per-frame JS is identical either side of
that line.** Attribution is 1.7% of wall clock before and after,
drawFull runs 272 times in 278s (the scene cache is working), nothing
in the heap grows, there is no pixel readback anywhere in the file
(so no canvas de-acceleration), and resumeAudio closes before it
rebuilds (so no second AudioContext). The 199 stalls cost 17.3s —
3.7x the app's entire JS bill — and no wrapper can see them.

Conclusion: the edit changes the DATA, and the cost lands browser-side
where our instrumentation cannot reach. Probe shipped for it: every
saveEdits/selEditApply/insertTime now marks the timeline with the
second it landed plus a snapshot of notes (total/gone/added), roll,
sched, undo depth, sceneValid and songEndTick — so the next report
says what an edit actually mutated.

Also shipped: `?keepalive=0`. The stalls arrive on a 2-2.5s beat and
the looping silent mute-switch wav is the only ~2s-periodic thing in
the app; R1 already found one real bug in that exact mechanism.

Ruled out and not worth revisiting without new evidence: the song
alone, the transport loop re-schedule (2 of 963 stalls near a wrap),
retention/leak (DOM, live nodes, undo all flat), app JS, sample rate
(48kHz), and audio-graph leakage (6383 created, 6384 ended).

Still open: Brave-vs-Safari. Brave was bad from second one on a fresh
load; Safari ran 131 clean seconds. Same device. Untested whether that
is the WKWebView memory ceiling or just a different edit history.

## Perf hunt — earlier state, 2026-08-25 (superseded above)

Josh's numbers, iPad, **without editing**: fps down to ~20, worst
frame ~200ms, lag spikes to 168ms. Same session on his Mac running the
same song through several loops: 165fps, worst 7ms. So the edit-path
theory from the previous restart context is dead — degradation happens
on plain playback, and the Mac/iPad split is a cliff, not a diff.

**Shipped this session: the perf session recorder** (`?perf=1` → `⏺
rec` → reproduce → `⏹` → Copy). Documented in NIGHT-ROLL.md. Built
because Josh asked for exactly this: "start performance analysis, end
performance analysis, give a report, hand the report to you."

**Next step is attribution, not bisect.** Get one recording from the
iPad at stutter. If a subsystem owns a large share of frame time, the
answer is in the report and no bisect happens.

Standing suspects the report will confirm or kill:
- `playbackFrame` and `drawFull` BOTH call `drawInst()` when the
  instrument panel is open — two panel repaints per frame on the
  scene-invalid path. Panel arrived in f83ec45 ("fretboard echoes on
  playback").
- `updateEditButtons()` runs every frame from `drawFull`.
- Audio sample rate: this Chrome negotiated **96kHz**. Doubles WebAudio
  render cost vs a 48kHz device on identical code. Report captures it.
- Leaked audio graph — realtime render thread outranks the UI thread,
  and is invisible to Activity Monitor's CPU view. Census now measures
  created vs ended/stopped.

**Bisect is the FALLBACK, only if attribution comes back flat.** Josh's
objection (older builds lack drums, so how do you even test) is handled
by not needing feature parity: deploy historical `index.html` builds
side by side at their own paths, each with `?perf=1`, and binary-search
by tapping through them — ~6 measurements, no editing, no feature use.
No perf bisect over git history has ever been run; advisor rounds R1-R3
were live-path tracing and deploy-byte verification only.

**Josh's Mac also crawled machine-wide** (2026-08-25, needed a reboot,
nothing visible in Activity Monitor, 84% RAM free). A renderer cannot
do that. Candidates outside the renderer: the WebAudio realtime render
thread, the GPU/WindowServer process, or kernel_task thermal throttle.
Activity Monitor also defaults to "My Processes" and Chrome fans out
into helpers, so all three are off-screen by default. Untested — next
time it happens, close the Night Roll tab first: recovery within ~10s
means it is us.

## Graveyard-2: possible B rewrite (Josh, 2026-08-24)

Bars 14-20 may be rewritten — his ear: "just not that strong." BAR 21
IS FIXED ("bet your butt"): the wedge (bass C#-B-A-G# quarters down vs
pulse2's 16-note chromatic 16th run D4→F5 up), held C#6 on top, bar-9
fill restated, F→F# resolution through the wrap to 6.1, Conquer or
Die callout in the last four bass notes. Entry conditions any new B
must meet: bass path to C#3 at 21.1, pulse2 register reaching D4,
melody handing off to C#6. His labels stop at 14.1 — B harmony still
unnamed (his to name). His diagnosis: the B progression is "cool to
play over" but melody-resistant; B1's melody-alone drop (14.2-17) was
a Dancing Mad-inspired gesture he wants to re-audit. Research queue:
relisten to Dancing Mad + other boss themes + Megadeth instrumentals.
Structural freedom he noted: bar 21 is movable — B can LENGTHEN (to
~30 if needed; shrinking unlikely, "a B part should be longer than
that"). Possible pre-rewrite step (my suggestion, his call): name the
B chords first — melody-over-named-chords beats melody-over-mystery.

## Test-suite migration to vm (advisor plan, started 2026-08-23)

Step 1 SHIPPED (5e3fee8): harness event injection — vm tests drive the
real pointer handlers with plain objects; fake clock makes the 230ms
dwell deterministic; five proof ports in tests/gestures.test.mjs, all
mutation-checked. App code untouched (the advisor's ranked-1 path; the
gesture-reducer rewrite was REJECTED as the risky option).
Remaining, shippable independently:
- Batch A (~1 session): demote the class-A dialog/command e2e specs
  (delete/undo, copy-paste, gray states, insert dialog, drum fill,
  Edit menu, fader, velocity, LCD taps, ruler-tap+➗, Drummer sheet).
- Batch B (~1 session): demote the gesture-decode halves (chord drag,
  pan default, cycle park/re-arm, left edge, band edge, double-tap
  band, pen pencil, tracks view vm half), then trim editor.spec.mjs
  to the irreducible ~9 (boot/viewport, one real drag/dwell/pinch,
  sheet visibility, button-wiring sweep — chromium AND webkit).
Port discipline (documented in NIGHT-ROLL.md): vm twin coexists with
its e2e spec for ≥1 commit; every port must fail a knocked-out-gesture
mutation check before the e2e copy retires.

## RESTART CONTEXT — updated 2026-08-15 late night (the seven-hour app marathon)

**Analysis thread unchanged:** prologue F#–C tritone is still THE NEXT
MOVE (see the 08-14 block below — nothing analytical happened tonight).

**App, all shipped and pushed tonight (2026-08-15 evening session):**
NSF import (File → Import…, byte-sniffed picker; captures = local
drafts; audition → rename in the panel row → ✕ duds → Commit import
publishes the album), local MIDI imports persist as `local/` drafts
(reopenable from Open → drafts, never synced), 36 sampled FluidR3
instruments in a family-grouped voice menu (~85MB in vendor/soundfonts/,
lazy per track per pitch; the 08-15 synth patches left the menu),
full-width color picker (swatches removed), track-row layout fixes
(▾ hugs chips, transport pinned top), voice menu holds position + ✕.
Tests 45/45. Details in NIGHT-ROLL.md.

**DATA-LOCATION CONFIG SHIPPED (2026-08-17 afternoon; physical split
DEFERRED):** Night Roll is now configured with where songs, analysis,
and NSFs live (Sync → Data locations; cfg()/songsURL/analysisURL/
nsfURL/repoApi in index.html; spec in NIGHT-ROLL.md). nsf-archive is
PUBLIC (Josh's considered reversal of never-publish; chip audio is
tokenless everywhere; archive default branch renamed master→main).
Advisor-reviewed plan incl. the deferred ost-songs/ost-analysis
physical split lives at
~/.claude/plans/velvety-shimmying-quail.md — execute it when a second
analyst is real, with its baked-in ordering fixes: git filter-repo for
history, extend the token BEFORE verification, DROP night-roll from
the token at prune time (stale cached tabs must fail loudly, not sync
into a pruned repo). Leftover for Josh: delete the empty duplicate
repo joshcough/nsf-vault (needs delete_repo scope I don't have).

**MM2 STATUS AFTER THE ALL-NIGHTER (2026-08-17 ~3am):** Flash Man (t3)
"sounds really good"; Wily 1 (t11) "pretty great"; title (t1) "really
really close" after the snap-residual raw-timing gate. Shipped in the
final hour: per-note duty timbres (chip instrument choice, CC70),
chip software envelopes (per-note decay targets as aftertouch —
targets the "tremolo" flat-sustain beating; Josh had NOT yet auditioned
this build), linear velocity map (the ^1.6 experiment pumped gallop
accents — reverted), auto raw-timing for tracks one grid can't hold
(t1 mid-song tempo change, t2 triplet gallops).

**OPEN: title theme (t2) bars 17-25 "train wreck — band not together"**
(fresh capture, rest of song good). Autopsy data: that section is
32nd-note arpeggio runs — IOIs alternate 2/3 frames (33ms notes) vs
the clean 5-frame 16ths elsewhere; channels perfectly synced (p2 lag 0
for 61/67 notes), so data is chip-true — the wreck is RENDERING walls
of 33ms notes (osc-per-note attack/release blur, possibly also the
snap-residual gate keeping raw timing so the roll grid misleads).
Ideas: envelope build may already help (unheard); if not, consider
arp-aware rendering (merge rapid same-channel runs into one osc with
frequency steps — the chip IS one osc changing pitch, not N osc
attacks). Also unheard-yet: whether bars 17-25 improve under the decay
envelopes. FIRST MORNING STEP: re-capture t2 on latest build, listen.

**MM2 "notes cut off" (Josh's earlier report before bed 2026-08-17
~2am) — analysis + one fix shipped, LISTENING VERDICT NEEDED:**
import now works end-to-end (the tab-killer was a negative backported
time running the MIDI varint writer unbounded — found by the
independent advisor, fixed + regression-tested). On the remaining
"songs still fucked up / notes cut off": overnight data says the
CAPTURE data is largely right — median durations legato (duty ~1,
matching chip behavior), timing frame-exact, wily1 triangle matches
its transcription 72% on a 50ms lattice (the pulse "mismatch" is
mostly tempo drift: chip 150.01/180.01 vs transcribers' rounded
148/175, plus echo/vibrato simplifications in the transcriptions).
Prime suspect for the EAR: the app's fixed note envelope — 8ms attack
+ 30ms release ate 76% of a 50ms note, and MM2's 300bpm tracks are
FULL of 50ms notes → "cut off" percept. Fix shipped: envelope now
scales with duration (short notes keep ~75% body). Morning protocol:
re-listen to a 300bpm track (Quick Man t9, Flash Man t3); if still
wrong, Josh should name ONE track + ONE spot (bar/second) and whether
it's the roll (data wrong) or only the sound (synthesis wrong) — that
one datum decides capture-vs-playback. Also possible next lever:
chip volume envelopes (MM2 fades notes; our render holds full level —
sounds LONGER than game, not shorter).

**MM2 bug #2 ALSO FIXED overnight (autonomous session with Josh's
reference MIDIs + mm2.nsf):** after the fitBpm fix he reported "much
better but still broken." Raw APU write dumps showed the real remainder:
MM2's driver renders GLISSANDI as per-frame period steps (Flash Man's
falling bass: A G F Eb D, one frame each) — reconstruct() turned each
step into its own note: hundreds of 1-frame notes ("confetti"), which
is the mess he heard in dense passages. Fixes in reconstruct():
(1) ±70-cent vibrato guard vs the note's start frequency (same-frame
setup writes exempt — the pitch-sweep tests catch that), (2) slide
collapse: chains of abutting ≤2-frame moving-pitch notes merge — into
the held target note (portamento) or the first pitch (fall-off).
Verified: MM2 t3 confetti 335→8, fits land 150/180 (t9's 300 = real
32nd runs); FF1 event counts byte-identical (507/432/703/333) so repo
regeneration is untouched; 45/45. Track↔reference matching (interval
5-grams): t1/2/23=title, t3=flash, t5=crash, t8=metal, t9=quick,
t11=wily1, t22=end(1.00). MORNING STEP: hard reload → re-import mm2 →
Re-capture all → listen. Reference MIDIs live on Josh's Desktop
(Megaman_2/); transcription bpms (140/148/175) vs chip-true fits
(150/150/180) — chip wins, transcribers rounded.
Josh supplied mm2.nsf; IOI histograms showed MM2's driver is
frame-integer (16th = exactly 5 or 6 frames → 180/150bpm) while fitBpm
only searched ±15% around the cold seed of 120 — it fit ~134bpm and
snapBeat quantized every note onto a grid that doesn't exist. Fix in
tools/nsf/notes.mjs (shared by app + offline dumper): fitBpm now also
tests the chip-native family (integer frames per 16th, half-steps
included), and among near-tied fits (double/half grids —
timing-identical, different labels) picks the bpm closest to the seed.
Verified: MM2 tracks land exact (180/150/300 — 300 = real 32nd-note
arps needing the fine grid); FF1 overworld cold-fits its true 150.
Josh must RE-CAPTURE MM2 once more (needs Pages deploy + reload).
Known remaining softness: FF1-style accumulator drivers (fractional
frames per 16th, e.g. battle) still fit imperfectly cold — repo FF1
is loop-calibrated so unaffected; snap-residual raw-timing fallback
remains future work if a cold accumulator-driver NSF sounds rough.
mm2.nsf lives in Josh's scratchpad copy only — NOT committed (he may
want it in reference/ later). Reference MIDIs: Josh finding tomorrow.

**AWAITING JOSH:** Mega Man 2 NSF field test on the iPad — mm2.nsf is
downloaded there; the picker bug that blocked .nsf selection (iOS
accept-filter) is fixed. First cold-NSF run: expect grid-fitted 4/4
guesses, per-row capture-seconds bumps for long intros, track naming
during audition. Also: does he want more GM instruments pulled
(~90 remain — sitar, koto, timpani, ocarina, steel drums…)?

Older context below still applies where not superseded.

## RESTART CONTEXT — updated 2026-08-15 (after the 08-14 web session)

**Prologue is the live thread.** 6.3 determined: F#(♭5), root position,
A as passing motion — full derivation path in Josh's
handoff-2026-08-14.md (not yet transcribed to analysis/prologue.md;
needs his go). Pulse-2 independence hypothesis tested bars 1–5 and
FAILED — it's a harmonic voice and testifies at 6.3. Rollnotes already
fixed by Josh himself: 5.3 = chord: D/A, 2.3 = Am7/C. **THE NEXT MOVE,
untouched by his choice: the F#–C tritone thread** (one tritone → two
dominant sevenths; likely bears on 6.1 Gm-vs-C7, which is still open —
new evidence since he wrote Gm: 5.3 is D/A). Key of prologue: F
suspected, untested. He ended the session frustrated the tritone wasn't
resolved — it's fully recorded, nothing lost by having stopped.

Older context below still applies where not superseded.

## RESTART CONTEXT — state as of 2026-08-05, late night

Read this first in a fresh session. Also read the memory files —
especially the interface discovery: **mid-turn text is swallowed by
Josh's client; only each turn's FINAL message reaches him.** Announce
nothing before tool calls; put the whole story in the final message, and
END THE TURN to get his sign-off before touching his analysis files or
rollnotes.

**App (Night Roll, all deployed):** meter is user-declared (neutral 4/4
grid until a timesig: directive; two-tap re-bar warning converts
anchors); spelling is all-sharps until a key is declared; seven-mode key
picker (key: D dorian); fast section flow (drag → +Note → type → Enter);
sync review pane with per-note discard; notehead lasso; aligned score
columns; chip-volume velocities now drive real dynamics. AWAITING JOSH'S
iPAD TEST: the clock-verified audio fix (app-switch-and-return — third
attempt at this bug; resumeAudio now proves audio.currentTime advances
and rebuilds the context if frozen).

**Pipeline:** chip volume preserved end-to-end (velocity + vN column in
notes.txt; pulses/noise only). Shop re-barred to 28 bars of 3/4 per
Josh's determination (first fossil error confirmed; METER_OVERRIDE in
dump-all). Meter audit v1 (tools/nsf/meter_audit.mjs) mechanizes his
barline test; findings quarantined in reference/meter-audit.md — only
epilogue fails (expected: rubato). The fossil design problem (meterOf
reads the pipeline's own output) is documented in open-items below;
detector v2 (grouping/accent second pass, cutting the circular
dependency, full audit sign-off flow) is future work.

**Analysis state:** sweep 11 songs opened (see key-sweep.md). In flight,
awaiting Josh's handoffs: prologue (chords, two open: 6.1 Gm-vs-C7, 6.3
span; key suspected F, undetermined), menu (chords bars 1-3, E7 tritone
thread, meter + key undetermined), matoyas-cave rollnotes synced
2026-08-05 but NO handoff yet — do not process. Floating Castle parked
as Josh's no-help song. Big open rulings HIS to make: the
fifths-in-the-bass script results (key-sweep.md "Script v1"), the
Gurgu seam pivots, victory/gameover bass exercises.

**Conventions that keep biting:** every push must be hash-verified
(iPad syncs race constantly); pure-git commit commands only (the
auto-allow hook); name every file before batch edits; park-before-
pointers when Josh is tired; never pre-declare meters/keys/anything on
his behalf.

## Questions awaiting Josh

0. **Key sweep in progress — see [key-sweep.md](albums/final-fantasy-i/analysis/key-sweep.md).** 10 songs
   opened (gurgu: opening key resisted the quick read — D→F Dorian; other
   songs' interiors remain unexamined), 9 to go. New thread: loop seam
   typology (prepared retransition vs hard splice) — see the sweep doc.
   Hypothesis revised 2026-08-02 to the loop-target form; the naive script
   scoring disagrees with the by-eye sweep (fifths in the bass) and THAT
   ruling is Josh's — see the sweep doc's "Script v1 results".
   **Convention change (Josh, 2026-08-01): per-song open questions now live
   in each song's own doc** (battle.md, airship.md, cave.md,
   chaos-temple.md, overworld.md, cornelia-castle.md all have Open
   Questions sections) — this global list keeps only cross-song and
   tooling items.

1. **Baseball/Beach song:** where did the B–D–F–Ab voicing come from — ear,
   hands, or something you read? Did you know it forms a diminished 7th?
2. **Baseball/Beach song:** the bass never sits on G under the "G7♭9" — it
   creeps chromatically around it. Did you notice you'd done that?
3. **The owed quiz** (from the 2026-07-22 concepts — 5 questions):
   modulation recipe; C-major pivot chord's Roman numeral in G and in F;
   why C7 signals F harder than a C triad; V7 resolving to major vs minor
   tonic; key-distance → melodic difficulty. Never taken; still on deck.
4. **Title decision:** Baseball Song or Beach Song (dropdown says
   "Baseball / Beach Song" until you pick).
5. **"Seventh-side resolution"** is a working name, yours to rename.

## Composition exercises owed

- **F-minor (or Bb-minor) half of the key-change exercise.** KeyChangeTest's
  two halves are identical; the dark version was the original assignment.
  Bb-minor route: one Db does the darkening (the bare-octave bar 9 socket).
- **E♮ hypothesis test:** same chords, but feed F its leading tone (E♮ in
  the melody leaning into F) — does F hold the throne this time?
- **Melody revision pass** on KeyChangeTest after studying how Uematsu's
  Overworld melody sustains phrases (bars 1–3 are riff; make them sing).

## Analysis queue

- **Overworld melody (tr1) + counter (tr2)** — bass done, upper tracks never
  opened. Pending verifications listed in overworld.md: bar 10 D major or
  minor; bar 12's predicted G#; tr2's C-natural in bar 4 (D7?); Josh's
  "melody sounds like E minor" instinct.
- **Baseball/Beach song** — Josh annotates his own hearing first (rollnotes
  from bed), then joint session.
- **Retrospective progression pass across analyzed songs (Josh,
  2026-08-06):** the key sweep scoped opening keys only, so nobody ever
  read the progressions across songs — cadence habits, V7 vs modal
  motion, recurring progressions, where rare triads (menu's iii) appear.
  Data exists in analysis/*.md + chord-charts.md; this is a reading pass,
  not new capture. Not now — Josh flagged it to circle back to.
- **Whole-tone exercise — floating castle (deferred 2026-08-07):** Josh
  identified the song as whole-tone material (melody D5–A#5 = five
  consecutive whole steps; static tritone field in the bass; every
  standard test fails because the scale is symmetric — no privileged
  root, three tritones, no leading tone). Stopped deliberately while
  tired. The exercise, fresh: classify every pitch by collection (there
  are exactly two, complements); decide whether the D#/C# material is
  second-collection structure or decoration; whole-tone notation done
  properly (Debussy reference); and whether "opening key" even applies —
  may need its own sweep category. The sweep's recorded Bb tonic has NO
  derivation anywhere — treat as unsupported until re-derived.
- **From the 08-07 sweep session, still open per song:** undersea-shrine
  past chord 2 + why the offbeat D# pedal; ship's Pulse-2 E question
  (position says chord tone/Fmaj7, duration says neighbor — logged
  unresolved) + the withheld-third open fifths; prologue bars 5+ (Gm...
  C7 back to F?); victory's thin two-Db evidence rides on metrical
  placement.
- **Data issues flagged 2026-08-07 (awaiting Josh's go to fix):**
  key-sweep.md Tally shows ? for songs whose rollnotes have keys
  (matoyas-cave B minor, menu Bb) and 8 songs total are recorded but not
  swept; gurgu-volcano carries two key lines (D dorian, F dorian) and
  the sweep only records the first — should it capture section-level
  changes at all?; floating-castle has a sweep entry but no .rollnotes
  (partial key: A#/Bb? added 2026-08-12). RESOLVED 2026-08-14: the
  prologue chord-in-a-section-field entry ("section: F#m or Gbm") was
  both mis-fielded AND stale — Josh fixed it himself via Sync (now
  chord: D/A). It cost session time exactly as the drift-check tooling
  request predicted; that request stands, evidenced.

## Composition in progress — Cool Bmaj Progression (Josh, 2026-08-17 night)

Josh's first real multi-voice composition; came out in a flow state
("I'm not consciously thinking but the thought is there"). State:
melody alone on pulse1 (fanfare, E–D♯–B triplet turn, long B5 pedal),
chords on pulse2 (vi ↔ I⁶ sway, Badd9 close — his hearing, correct),
NEW bass on triangle (root-root-root-fifth ostinato; F♯–E–D♯ walkdowns
at seams = the melody's turn augmented). Cross-rhythm (triplet melody
over straight bass) discussed and blessed — steady-layer principle.
NEXT THREAD (his call, agreed): bass is two bars copy-pasted; vary it
the way pulse2's chords vary — walkdowns at seams are the model; maybe
a passing note in bar 3/4 before the payoff. He may also re-voice
pulse1's instrument. Quiz material: cross-rhythm/steady-layer, pedal
tone, motivic augmentation, add9 naming from a pedal context.

## Composition — NEXT THREAD (Josh, 2026-08-18): B-part study, then write one

Cool Bmaj has intro + A (with variation) and Josh loves it ("the bass
is the real melody" — inverted texture, his diagnosis). He wants a B
part but names A/B contrast as his songwriting weak spot. Agreed plan:
FF1 analysis sessions with a standing question — what makes B parts
work against their A parts — THEN write the B.

**Josh's pre-analysis hypothesis (2026-08-18, to be tested not
assumed):** harmonic departure isn't enough — B contrast lives at
least as much in RHYTHM changes, especially bass and accompaniment.
Evidence from his own song: the A part's identity IS its gallop bass;
new chords over the same gallop would still read as A.

**Listening protocol for each B section:**
1. Score every contrast dimension separately: harmony/key, bass
   rhythm, accompaniment texture, melody register/density.
2. Then the discriminating question: which SINGLE change, if
   reverted, would break the contrast? That separates "things that
   happen to differ" from "the thing doing the work."
3. Expect the answer to vary by song — the rhythm-carried Bs are the
   ones that teach Cool Bmaj's B part.
4. Same treatment for the TURNS (often the C part — his Overworld "C:
   borrowed + turnaround"): what a turn changes, and what it does
   that a B doesn't — setting up the return home vs departing from it.

Starting material: his own Overworld labels (A "G home" / B "Am
visit" / C "borrowed + turnaround") assert the harmonic mechanism;
verify with the now-ear. Also still queued: bass variation in Cool
Bmaj (the lead voice deserves development).

## Glossary (new doc, 2026-08-18)

glossary.md: terms Josh has ENCOUNTERED vs DEMONSTRATED (his
distinction — "I've just encountered them... I don't want to say I've
learned them"). Encountered terms are quiz fodder; passing + deliberate
use promotes to demonstrated, evidence noted inline. Anchors point at
bars/beats; FF anchors are deliberately blank "(find one)" slots —
locating them is analysis homework. Keep it updated when new terms come
up in sessions; promote honestly.

## Design-stage / future (from the 2026-08-18 web-session handoff)

- **Context-aware drum generation — BUILT ON BRANCH `drummer`
  (2026-08-20, Josh green-lit overnight; advisor-reviewed design).**
  v1 shipped to the branch: idempotent replace-in-range as one group
  undo (hand drums back in one ⟲), per-bar PRNG substreams (range
  changes can't scramble liked bars), take chips snapshotting the full
  (seed, energy, range) tuple, fixed skeleton + meter table, velocity
  table with the hats-under-snare ceiling, follow-the-bass kicks,
  chord-downbeat accents, agogic snare on bass long notes, 5-entry
  fill vocabulary incl. the negative fill (75% per boundary, crash on
  arrival), sustain-aware break silence with label override, meter-
  change refusal. AWAITING JOSH'S FIELD TEST before merge.
  **v2 queue (advisor):** layering mode ("keep my kicks, regenerate
  hats"); fill length via per-section annotation; bass-track picker;
  swing/humanize; ride-vs-hat per section; per-instrument density;
  seed provenance as an annotation; tom-groove styles; half-time feel.
  Fill vocabulary to be curated empirically by what Josh keeps.
- **Drums in the score view**: percussion clef, fixed staff ROLES not
  pitches (kick bottom space, snare 3rd space, hats above top line),
  x-heads for cymbals/hats, stems up = hands / down = feet. RULED: kit
  staff always at the BOTTOM. DRUM_SLOTS/DRUM_LABELS exist; needs a
  GM→staff-position/notehead table. VexFlow supports both natively.
- **music21 as Claude's private answer key** (Josh approved): output to
  Claude only, never Josh; hypothesis not ground truth (chip corpus is
  its weak case); hints must still route through the derivation.
  Becomes useful at ~10 annotated songs; Humdrum/kern for corpus-wide
  pattern queries.
- **Tombstone architecture for deleted synced annotations**: the
  general fix behind the duplicate-directive bug (deletions of synced
  notes only exist in memory; localStorage persists added notes only).
  The load-time last-wins dedupe (shipped 2026-08-19) covers track:
  directives; deleting OTHER synced annotation types before a Sync
  still resurrects on reload. Design: tombstone list in localStorage
  the loader subtracts, cleared on Sync.
- **MIDI input branch (`midi-input`, built+parked)**: Web MIDI →
  ● Record with real velocities (Jamstik). Josh testing before merge.

## From the 2026-08-19 web handoff

- **Lasso is the core composition gesture** (Josh: "I used the lasso a
  lot") — pencil is for the first idea, lasso+transpose for everything
  after. Composition-ergonomics priority signal: invest there, not in
  note entry. iPad pencil chord entry is slow; the untested unblock is
  ● Record + the Jamstik (merged, awaiting his field test).
- **Loop annotations corpus gap — JOSH IS DOING IT BY HAND (2026-08-19):**
  he wants them verified-correct and it's a good pass over the corpus
  anyway ("it's only 19 songs"). No script. When done, loop-targets
  --all becomes a full corpus view of every voice at every loop target.
- Song threads (Josh's corrections, 2026-08-19): trumpet (voice5) is
  NOT deliberately held out of the B section — he hasn't tried it yet.
  Plan: not in the B part's first two bars, but it "could very well
  belong" in the remaining bars; probably drops out for the Turn like
  everything else does. Drums stop before the B part. Drums overall
  "could use some work" — accents, fills, variation (feeds the parked
  drummer design, still do-not-implement).
- **Intro replacement (Josh, 2026-08-19):** he no longer likes the
  intro — "I liked it... maybe it could be good for another song. I
  don't think it quite fits anymore." Wants to cut it and slide the
  song back. The enabler shipped same day: a move that carries EVERY
  note now carries the whole annotation layer too (sections, chords,
  loop anchor+target; labels transpose on vertical moves). Workflow:
  delete intro notes → select all → drag left. The old intro is a
  candidate seed for a new song.
- Query tools verdict from the field: zero factual errors in a full
  session (a first); ✱ inline notes and duration-weighted census called
  out as better than spec. Equal-span anomaly retired (false positive
  since the lane redesign).

## Annoyance log (Josh, from writing the B part — no proposals yet)

- **Selection dies on scroll.** Copying bar 3 to bar 16: lasso at 3,
  scroll to 16, selection gone — so he zooms way out until both bars
  fit, and then the notes are too small to lasso. He explicitly did
  NOT propose a fix yet; logged as a real cost of the core gesture.
  (Candidate directions when this comes up: selection survives
  pan/zoom; or paste-at-cursor so the clipboard, not the selection,
  travels. ⧉ Duplicate + drag already survives some of this.)

Shipped same session (2026-08-19): draggable Logic-sized cursor
handle; ⏮ returns to an armed cycle's start; ruler highlight parks/
re-arms instead of dying (his bar-7-to-9 case); ruler drags snap to
16ths (32nd snapping made his B-part section edge land a 16th off —
worth re-dragging that edge, Josh); full-song moves carry annotations.
SUPERSEDED 2026-08-22: ruler snapping is now bar-magnetic (14 screen
px) with 16ths elsewhere, and ruler taps no longer clear the lasso —
both from his 08-21 "reported with real heat" items.

## Composition thread — graveyard (2026-08-20 → 08-22, web sessions)

- 21 bars, F♯ minor (transposed whole from Gm), journal at
  albums/compositions/nightroll/graveyard.md. Intro complete and
  liked; seam built (eighth-rest gap, F♯ hang solved rhythmically,
  hard splice); riff + lead written — lead is "the absolutely most
  beautiful thing I have ever written." Bar 13 DECIDED: harmony, not
  unison (unison washed out the middle voice).
- OPEN, all his: fast-section tempo (at 160; ratio-vs-subdivision
  framing on the table); bar-8 run regrouping now that ➗ exists
  (sextuplet vs two eighth-triplets — his call); which thread carries
  across the seam; real bass arrangement (sketch-pad bass — he's
  studying Ellefson/Rust in Peace); whether the never-sounds-the-tonic
  melody is deliberate (asked, unanswered).
- Housekeeping he may want: duplicate tempo 80 at [1,1] in
  graveyard.rollnotes.json (harmless; HIS file, not touched).
- B-part study now has a second live specimen: graveyard's A→B is a
  rhythm-carried contrast BY DESIGN — the category his 08-18
  hypothesis predicted would be instructive.
- **Quiz owed ×3** (2026-07-22 concepts + leading tone + the 08-21/22
  material: borrowed chord, timbral fusion, pedal vs chord, duration
  vs position, interval inversion); declined three times; draw from
  all banks at once when he's willing.
- **Named recurring pattern — duration vs. metrical position** (was
  two separate open questions, now three instances): Ship's pulse2 E;
  graveyard 7.3's C♯ (short but lands WITH the bass change); graveyard
  bar 6's E (short but recurrent in a fixed metric slot — if it
  counts, bar 6 is an incomplete 7th chord and bar 10 RESOLVES it, not
  just thickens it). Both kinds of evidence are honest; when they
  disagree, record both readings. Suggested annotation form for bar 6:
  F#m7(no5) with the note saying the seventh is rhythmic.
- **graveyard experiments queued, his**: bar-8 voicing audition (bare
  F5 vs full triad — does the third settle it and kill the pull?);
  intro-subdivision lever (thin the constant eighths instead of
  raising the fast tempo — untried); second thematic idea when the
  piece outgrows 6–13 (a scale note, not a criticism); bar-12 note
  (vii°7 reading is the least self-evident label — pending HIS
  wording). Tempo now 96/192 (raised both ends, ratio kept).

## Awaiting Josh's field verdicts (2026-08-19 marathon session)

- **Hold-to-grab friction is REAL but undiagnosed (his 08-20/21 field
  report):** scroll-misfires solved, but moving existing notes up/down
  is now "a pain in the ass." The 230ms dwell is ONE suspect, not the
  diagnosis. DO NOT implement a fix until he reproduces it live and
  narrates (which pointer, note selected or not, grab never starts vs
  starts-then-loses, roll vs score). Candidate shapes logged in the
  handoff: lower dwell / axis-based grab (vertical=grab, horizontal=
  pan) / instant grab on already-selected notes / slop threshold.
  AUDIT 2026-08-22 found the PRIME SUSPECT: with a selection active,
  pressing an UNSELECTED note pans instead of grabbing — a stale
  off-screen lasso silently turns note-presses into pans. FIX SHIPPED
  2026-08-24 (58bb23a): his drum-notes report ("moving one note moved
  several") was the call — press-on-unselected now replaces the
  selection and grabs just that note; press-on-selected still drags
  the group. Arm cue (✊ + note sounds) had shipped earlier. Watch for
  his next field verdict on the remaining dwell feel.
- Logic-style always-from-top cycle play — he suspects he may want
  mid-span audition back ("i can ask to change it later").
- New since his last load: real copy/paste (⧉ must be tapped before 📋
  works — old lasso→paste habit now grays paste), button graying,
  hold-to-grab, band edge drag, left-edge resize, double-tap bands,
  LCD taps, chord extension chips, on-demand Check labels.

## Bassist v2 queue (advisor, 2026-08-23 — v1 SHIPPED, awaiting field test)

Shipped: 5 styles, chord-driven with slash-bass anchors, melody-only
internal inference (never displayed — doctrine boundary), plays
through Breaks, mixed per-bar tiering, riff-defaults-with-drums, take
chips + one-undo replace, strictly monophonic. Queue: hard knob
(zero-draw); bass fills/turnarounds into drBoundaries; scoped reroll
(rhythm-only/pitch-only); kick-align toggle for non-riff styles;
register from target track; approach-density knob; half-time.

## Drummer v2 seeds from Logic's control surface (Josh shared it, 2026-08-22)

- **Unison-mode bass follow — BUILT, then REVERTED on Josh's caution**
  (2026-08-22): sparse on-beat bass bars (his bar-13 brake) would get a
  kick on every hit, no dice. His worry, probably right: "that could
  extend everywhere" — note-count can't tell a dramatic brake from any
  quiet bar with on-beat bass. Candidates if it returns: only in bars
  where MELODY doubles the bass rhythm (true unison texture), or as an
  explicit per-section annotation, or just leave it manual (3 kicks by
  hand). His current answer: manual. The curation datum (2026-08-22):
  the generator gave kicks on 1, 2, 4 of his four-quarter brake; his
  ear added beat 3 — full unison, no syncopation, when the band hits
  together. First entry in the keep/change trail.

Shipped from it same night: the fills knob (amount+size, decoupled from
energy). v2 SHIPPED overnight 2026-08-22 (advisor-designed): busy/hard split,
follow bass|chords|off, feel normal|half|double. Advisor's v2+ queue:
- Nameable pattern variants (variant index REPLACES the per-group seed
  substream, joins the take tuple) — only if chips prove insufficient
- Per-piece density row (hats/kick/snare less/normal/more)
- Skeleton personas (chip/rock/metal tables) — after fill vocabulary
  matures empirically
- Swing — explicit request only (advisor: mush on chip/metal material)
- Ghost knob — only if busy/hard proves too coarse
- REJECTED: per-section feel annotations (knobs are generation inputs,
  not song state); a Manual tab (the whole app IS the manual tab)
Round 2 (2026-08-22, his "bring in an adviser" ask): same-label
sections now share grooves — TO ACTIVATE ON GRAVEYARD Josh renames
"A repeat" to "A1" (exact match by design; the rename also merges
their ruler colors, visible confirmation). Metal-tier fills shipped
(tomrun/kitfall/doublekick, weighted at fills 4-5). NOT changed, per
advisor: groove logic, fill trigger sites, probability curve, the
five original fill bodies. Pre-update take chips no longer replay
fills identically (pool grew 3->6 at the top band) — session-only,
nothing persisted. Advisor's watch items: hard=1 may re-trigger quiet hats (floor 40 is
the mitigation — Josh's ear rules); chords-follow may machine-gun
under harmonic-rhythm compression (cap 4/bar is a guess — if it
stiffens, bring him the tradeoff, never quietly go probabilistic);
"double" skank vocabulary is unvalidated.

## Product thread ($5 DAW — Josh, 2026-08-22: "a special little product")

Positioning: not Logic-but-cheaper — "the chiptune DAW that teaches
you composition." Differentiators: annotation layer living with the
notes, declared-structure Drummer, authentic 2A03 chip audio, score
view, iPad-first. Precedent: Koala Sampler ($5, one-person, beloved).
Path = the local-first ladder below (PWA -> Capacitor -> local files
-> App Store, $99/yr dev account accepted). Prerequisites: separate
the ENGINE from Josh's corpus (compositions/journals/FF1 stay out —
the data-locations config plan was built for this split); license
check on bundled soundfonts (VexFlow is MIT, fine); support burden is
the real cost, cheap pricing mitigates. YouTube demos = marketing +
the learning story is the description.
LEARNING-SUITE framing (Josh, 2026-08-22): Synthesia-style practice is
the existing ▼ Fall view + a practice layer (wait-for-input via MIDI/
on-screen piano, scoring, per-track practice); score view seeds
notation; glossary + quiz platform close the loop. The full cycle —
compose (roll) -> read (score) -> drill (fall) -> name (glossary) ->
retain (quiz) — is the differentiator no competitor has; may justify
more than $5. "Musical Meter" (clarified): a rhythm-READING trainer — notation
scrolls in time, you tap the rhythms as written. Night Roll has the
hard parts already: engraved score view + the scoreTickToX playhead
map + measurable tap timing. Feature shape: pick track + section,
score scrolls, tap a pad, onsets scored against the notation — with
HIS OWN compositions as exercise material, which nothing else offers.

## Local-first distribution (Josh, 2026-08-22 — the YouTube question)

"People are not gonna use it if they have to set up GitHub accounts."
Design-stage: (1) File System Access API save-to-folder (Chrome/Edge:
showDirectoryPicker once, then Save writes .mid + .rollnotes.json
locally — the folder is their repo; Safari/iPad falls back to
downloads); (2) GitHub Release zip with a start.command/start.bat
one-line server, OR inline vendor/ into index.html for true
double-click-and-go; (3) hosted version stays the try-first path.
Needs advisor ruling on save-mode detection, Sync-UI behavior with no
repo configured, and the Safari story. Trigger: "build local mode."
iPad tiers (2026-08-22 follow-up): (1) PWA — manifest + offline cache;
Add to Home Screen gives an app icon, full-screen, and PROTECTED
storage (home-screen web apps are exempt from Safari's eviction);
cheap, worth doing for Josh regardless. (2) Capacitor/WKWebView
wrapper — index.html in a native shell with a filesystem bridge: Save
writes real files visible in the Files app, iCloud-backed; needs
Xcode/Mac, distribution via TestFlight/App Store ($99/yr) or direct
build to his own iPad.

## Tracks/Arrange view (Josh, 2026-08-22 — "a big project, but it would be cool")

Logic-style third view (screenshot on record): one lane per track,
note thumbnails in-lane, header strip (name, M/S, per-track fader —
already exists as vol= annotations), shared ruler/sections/cycle on
top. viewMode has a slot ("tracks" beside roll/score). The new work is
the editing model: Logic edits REGIONS; Night Roll has none — v1
likely lasso-a-timespan-in-lane, drag between lanes/time (⇄ + copy/
paste machinery underneath). Cross-track pencil-draw his explicit
mention. DESIGN STAGE: advisor pass first when he says
"build the tracks view."

## Quiz platform (Josh, 2026-08-22 — "absurd but it would be pretty cool")

His jiu-jitsu framing: a concept learned once and never drilled decays;
he wants recognition maintained, tracked over time. Design-stage shape
(not built): an in-app quiz mode backed by glossary.md + quizzes.md —
question bank generated from encountered/demonstrated entries and
their anchors ("what device is at graveyard 8-9?" both directions:
term→anchor and anchor→term); spaced-repetition scheduling (miss = see
it sooner, streak = see it later); results tracked in a synced repo
file so history follows him across devices; a passing streak becomes
promotion evidence for encountered→demonstrated. Three quizzes' worth
of owed material is the seed bank. Needs his ruling on: in-app vs
web-session-led; how scores display; whether wrong answers reveal or
park.

## Tooling to-do

- **Kit piece solo/mute in the drum track's voice menu** (Josh,
  2026-08-22): gutter-label tap cycle shipped and approved; if the
  labels prove too small to hit on the iPad, mirror the controls into
  the drum track's chip menu (tap selected chip) — "not necessary
  yet," his call after field use.

- **iPhone treatment (Josh, 2026-08-18, "eventually"):** track chips
  are unreachable on a phone — the top row shows only ⏮ + ▶ pushed
  hard left; the chip cluster gets no room. The bottom panel already
  auto-folds on phones; the top row needs its own phone answer
  (stacked layout? chips behind a single ☰ button? transport-first
  with chips in a drawer?). min-dimension <500px is the existing
  phone gate to reuse.

- **Record button — SHIPPED overnight 2026-08-18** (● beside Play,
  editable songs): key-down/key-up on the 🎹 panel = note start/end on
  the selected track, grid-snapped (triplets honored), count-in
  applies, take = one undo, multi-touch chords per-pointer. AWAITING
  JOSH'S FIRST REAL TAKE — timing feel (snap vs raw + quantize-after)
  is the thing to judge by ear. Future door: WebMIDI for a real
  keyboard.



- **Chord bands vs moving notes (Josh, 2026-08-17):** inserted/authored
  chord annotations go stale when the notes under them are edited.
  Agreed plan, two phases (build when Josh calls for it):
  1. *Bands ride along* (compositions only): when a move/transpose
     gesture's selection covers all sounding notes in a band's span,
     the band moves with it and its label transposes (Cm +2 → Dm).
     Deterministic — no chord-namer guessing.
  2. *Stale marker*: after any edit, a band whose label no longer
     matches what sounds in its span gets a subtle ⚠ tint; tapping it
     offers "notes here now make G7 — rename?" One tap to accept.
     Never silently rewrite — on analysis songs bands are Josh's
     discoveries and must never auto-edit.
- **Playwright e2e suite — SHIPPED overnight 2026-08-18** (Josh's
  green light "work on playwright tests tonight"): `npm run test:e2e`,
  10 gesture specs × chromium + webkit (≈ iPad Safari) in ~10s —
  lasso-drag move, edge resize, tool-off panning, pencil tap+drag,
  🗑/⧉/📋, help tabs, chord insert, drum fill + lane dock, velocity
  slider. Key discovery: headless chromium stalls ~20s constructing an
  AudioContext (no device) — e2e stubs the WebAudio surface (fake ctx
  in tests/e2e/helpers.mjs). Tests store no token: repo-write paths
  provably inert. Extend per feature alongside the vm suite.
- **32nd-note snap grid (2026-08-16):** TMNT2 scene-2a shows tempo 300 —
  real 32nd runs on a 16th-only grid; fitBpm halves to 150 once the grid
  supports 32nds.
- **Full Synthesia-style piano view — SHIPPED 2026-08-07** (▼ Fall in the
  instrument panel): notes fall down the main canvas into the panel's
  keys, chord symbols and bar numbers ride their lines. Possible later
  polish: pinch to change the 4.5 s drop window; scrub-by-drag while
  stopped (gestures currently disabled in Fall).
- **Instrument-panel piano zoom (Josh, 2026-08-07):** wide-range songs
  stretch the auto-fit keyboard thin on the iPad — keys may get too
  narrow to tap. Wanted: a way to zoom the piano in, maybe just a button
  that enables zoom. Parked at Josh's call — leave until fat-finger
  trouble actually shows up in use.
- **Zoom-out clamp to song extents, roll view — SHIPPED 2026-08-07:**
  pinch-out (and ctrl+wheel) stops once the whole song fits; per-axis
  floors, so time stops while pitch keeps revealing; bounded to the
  chop-trimmed extents. The no-padding experiment concluded 2026-08-07:
  flush felt cramped — right/bottom now keep a ruler-width/-height of
  air, mirroring the left/top bars. fitView lands exactly on the floor, so the
  load view = the zoom-out limit. Revises the "unlimited roll zoom-out"
  note under the parked two-regime score item.

### Tooling requests — 08-07 sweep handoff (proposed; Josh signs off)

- **Key picker: tonic-only first dropdown + stored-vs-applied keys —
  SHIPPED 2026-08-07** exactly per the handoff design: 12 tonic pitch
  classes (enharmonics labeled "G♯/A♭", spelling auto-picked to land on
  a real signature), mode entirely in the second dropdown incl. "mode?".
  Partials write `key: G#/Ab?` — stored, listed, round-tripped, and
  clearly labeled NOT applied; no signature or respelling until the mode
  lands. Existing annotations needed no changes (format unchanged for
  full keys — all 14 distinct key lines verified parsing identically).
  Bonus same day: **◯5 circle-of-fifths modal** (Josh's request) — live
  chart with the rotatable degree window, tap-to-recenter, ⟲ ⟳, opens
  on the song's governing key.
- **Lasso: beyond one rectangle — SHIPPED 2026-08-07** (CC's touch-first
  design, per Josh's "build whatever you think appropriate"): boxes
  union into the selection, tapping a note toggles it in/out (works in
  roll, score, and fall), tapping empty space clears. No modifier keys —
  iPad has none. Solves the interleaved-pedal case: box the region, tap
  the pedal notes out.
- **Pitch-class highlight — SHIPPED 2026-08-07** ("find:" dropdown in
  the footer): pick a pitch class, every occurrence lights in all views
  while everything else dims — zero hits reads as a confident zero.
  Matches by pitch class (Bb catches A#), respells per governing key,
  shows scale degree + count + channels in the strip.
- **Asserted spelling should beat the auto-pick once a mode lands
  (2026-08-12 spec's follow-on, not yet built):** when a partial like
  `key: Bb?` gets its mode, keyNameFor currently re-picks the spelling
  by smallest signature; Josh's asserted spelling should win unless it
  exceeds six accidentals. Separate review from the shipped three-option
  picker.
- **Bare-key audit (2026-08-12 spec's cleanup rider):** six songs store
  `key: F/D/G/C/Bb/Eb` with no mode — shorthand for major, or the old
  picker's symptom? Now that the picker states what it writes, Josh can
  settle them. Also key-sweep.md regeneration from rollnotes — awaiting
  his go (his analysis doc).
- **Sweep-vs-rollnotes drift check.** A check that flags any song whose
  rollnotes `key:` disagrees with or is missing from the key-sweep
  Tally — the drift is real (see data issues in the analysis queue).

### Composition mode + File menu — v1 SHIPPED 2026-08-15

**Promotion must carry a provenance note (2026-09-07).** Threnody was
promoted to compositions/ by git rename (d3bc466) and came up LOCKED
for Josh: isComposition recognized promoted songs only by a local draft
or a "forked from" note, and a git mv leaves neither. Fix shipped: Move
now writes "moved from <old path>" when leaving nightroll/, and the
gate accepts it — so promotion holds on every device, not just the one
that did the Move. Hand promotions (Claude Code, git mv) MUST add that
note to the rollnotes. Threnody's own note awaits Josh's approval
(his file).

Josh's design rulings: setup dialog for New; roll entry v1 with
**score-side note entry as the PROMISED immediate next project** (he
accepted roll-first reluctantly); scratch home albums/compositions/
nightroll/ (flat .mid+.rollnotes pairs; promotion to compositions/
proper happens via Claude Code on his word — no in-app move). Shipped:
File sheet (New/Save/Save As/Load/Download .mid), in-page MIDI writer,
Save locked outside nightroll/, Save As forks any song with rollnotes
inherited + origin note, localStorage drafts (picker group, reload
restore), dotted durations, p/mf/f velocity, ⟲ undo, ＋ track chip.
Still open from the original spec: score entry (NEXT), tempo changes
after creation, rests/ties as first-class, multi-level undo, manifest
auto-pickup for synced compositions (currently needs an offline
manifest rebuild — ask Claude Code after first Save).

### Composition mode + File menu — original 08-14 spec (design open)

- **Composition mode (Josh, 2026-08-14):** flip from analysis straight
  into writing — new files, note entry on roll AND score, tempo,
  new tracks/instruments, finger entry accepted. Today: Pencil/Erase
  exist (roll only, selected track, velocity 80, four durations,
  localStorage-only persistence). Gaps: no score entry, no new-song or
  new-track creation, no MIDI export (penciled notes can't leave the
  device), no tempo control, no undo. Design questions for Josh in the
  handoff (score entry model, new-song defaults, where compositions
  live, MIDI export vs native format).
- **File menu New / Save / Save As (Josh, 2026-08-14):** all three
  wanted. RULED by Josh: Save is BLOCKED on chip-derived songs (they're
  regenerable pipeline output with provenance — a stray thumb must not
  corrupt the corpus); Save As from a locked song is WANTED (fork into
  albums/compositions/ to write e.g. a counter-line over Town — block
  overwrites, never branching); the fork inherits the source's
  .rollnotes verbatim, drift is Josh's to own, no app warnings.
  Open: record fork origin (source + commit hash)?; new track vs pencil
  into existing; what New asks up front. Proposed format: .mid +
  .rollnotes pair like everything else (tools/nsf has a pure-JS MIDI
  writer that could run in the page).

### Backlog — from the 2026-08-07 web-session sketch (recorded, not approved)

Josh hasn't read the design sketch these come from; he picks what gets
built. Phrased as open questions. Source docs live outside the repo as
his downloads: `review-handoff-2026-08-07.md` (code/tool review) and
`tool-design-sketch-2026-08-07.md` (the sketch itself).

- **Meter workbench?** Largest gap: every analytic feature works on
  pitch; meter is declared to the app, never interrogated by it. Candidate
  pieces: onset histogram folded into one bar at candidate bar lengths
  (6/8 piles onsets on 1 and 4; 3/4 on 1, 3, 5); harmonic-change points as
  downbeat evidence; duration weight; accent data (now that chip volume
  exists); an audition mode playing a click in each candidate meter.
  **Needs Josh's design input before any code.** Related but distinct:
  the parked meter-judge v2 plan in reference/meter-detection-plan.md.
- **Chord-band verification — SHIPPED v1 2026-08-07** as "Challenge?":
  tap a chord band, then ask. Reports label tones present/missing, extra
  pitches, and the namer's read of the full stack — Josh ruled the
  sketch's disagree-only restriction out ("what does the system think?"),
  so the namer's name is included, but only ever on request. The pedal
  wrinkle is handled by framing, not filtering: extras are reported as
  evidence (a pedal correctly shows as "extra"), never as a wrong-label
  verdict. Possible v2: mark a pitch as a structural layer so it drops
  out of "extra"; duration-weighting so passing tones read differently
  from held tones.
- **Horizontal / voice reading?** Channel identity survives the pipeline
  and is then used mostly for mute/solo. Nothing reads across time:
  isolate one channel's line, flag notes held across a harmonic change
  (pedal points, detectable without naming them), common tones between
  adjacent chords, voice motion/direction. Josh found menu's tonic pedal
  by eye and the E7→G semitone move by mental arithmetic; both are
  computable from data already in the files.
- **Claims as structured objects?** .rollnotes entries are strings. A
  claim could carry its justifying note range, method, date, confidence,
  dependencies. The method says record the path, not just the verdict —
  but paths live in analysis/*.md prose and verdicts in .rollnotes, with
  nothing linking them. Architectural; a format migration (round-trip
  test exists; eleven songs is nothing to convert).
- **Sealed predictions?** Lock a key prediction before derivation —
  timestamped, hidden — unsealed only when an independent derivation is
  recorded, self-scoring into the sweep tally. Non-circularity currently
  rests on Josh's honesty plus tutor vigilance, not any mechanism.
- **Key-dial caveat in the help text?** The dial minimizes visible
  accidentals, which cannot distinguish a key from its relative and
  cannot see modes — B♭ major and G minor look identical to it. It's a
  hypothesis generator, not a verifier, and nothing in the app says so.
  Small doc fix; matters because the method depends on not mistaking it
  for a verdict.
- **index.html split — flag only.** ~4,000 lines; the single-file
  constraint still pays (no build step, git push deploys, vm harness).
  Split *before* a large new view (e.g. the meter workbench) goes in,
  not after.
- **Concept delivery on demand? (speculative — recorded, not designed.)**
  What unblocked Josh in-session was general concepts arriving at the
  wall — tritone symmetry, pedal point, passing-tone tests — none
  song-specific. Possible: offer a concept keyed to the current selection
  (selected dyad six semitones apart → the tritone concept) while
  withholding every per-song conclusion. Genuinely unclear if it's a good
  idea.

- **NSF pipeline** (scoped 2026-08-01, **built 2026-08-02**): extract
  analysis-grade note data from the actual chip — see
  [reference/nsf-pipeline-plan.md](albums/final-fantasy-i/reference/nsf-pipeline-plan.md).
  Emulator + logger + reconstruction + CLI all working, tested against a
  synthetic NSF. **Blocked on Josh supplying the FF1 NSF file** (archive
  or own-cartridge dump — his call). Motivation confirmed by audit: only
  3 of 21 MIDIs (prelude, shop, victory) stay within the NES's
  3-pitched-voice ceiling; the rest are arrangements, so voice-leading
  analysis on them measures the arranger.
- **iOS audio after app-switch — REOPENED then re-fixed, awaiting test:**
  the 08-02 fix (unconditional awaited resume + visibilitychange revival)
  was confirmed BROKEN on the iPad (playhead stuck, only reload
  recovers). A stronger fix shipped 2026-08-03: resumeAudio now PROVES
  the clock advances (samples currentTime twice), rebuilds the context
  when frozen, and surfaces "audio asleep — tap ▶ again" in the UI.
  **Josh: test app-switch-and-return on the new build.**
- **Fixed from the town/menu handoff (2026-08-03):** one-beat ruler
  selections prefill To=From; display spelling is all-sharps until a key
  is declared (every view agrees with the captures; no more phantom Ab);
  time signature is now a first-class editor type (neutral 4/4 grid until
  declared; declaring re-bars with a two-tap warning + automatic anchor
  conversion — Josh's design, 2026-08-03); rollnotes/manifest fetches
  cache-bust the Pages CDN (stale reads after Sync looked like data
  loss).
- **Duplicate-song audit — RESOLVED 2026-08-02 by the chip migration:**
  the NSF is the authoritative track list (19 songs). dungeon (=cave) and
  elfland (absent from the NSF — likely not FF1 at all) were deleted with
  Josh's sign-off; no annotations existed on either.

- **"Save Music" missing (2026-08-02):** the canonical album (All Sounds
  of FF I·II) lists a Save Music track we never captured. NSF tracks
  20–23 probed: 21/23 are sub-second sfx blips, 20/22 long+sparse —
  none obviously it. Candidates could be captured for Josh to identify
  by ear if he wants the complete album.
- **Adding music — the standing workflow (Josh, 2026-08-02):** hand files
  to Claude (new Logic compositions as .mid, new soundtracks as .nsf, e.g.
  Mega Man 2 → its own albums/ dir); Claude runs the pipeline/dump tools,
  commits, and it appears in the dropdown. In-app upload UI deliberately
  skipped for now — optimize for analysis throughput, revisit if the tool
  grows beyond personal use.
- **Promise annotation (Josh's idea, 2026-08-03 — parked for design):** a
  relation annotation: "this beat aims at that beat" — secondary dominant
  at [4.1] promising delivery at 5.1. First annotation type capturing a
  relation rather than a location; syntax could mirror the loop directive
  (`[4.1] promise: 5.1 — E7 aims at Am`). Drawable as ruler arcs (the
  song's tension→resolution network at a glance); active-span subtitle
  while a promise is "open"; queryable for the concept index (promise
  density, deferral length, unpaid promises). Design questions before
  building: broken/redirected promises (deceptive cadences) as
  first-class; target-less "open" promises (heard the promise, haven't
  found the payment); arc clutter (show near cursor or behind ⊙ only).
  Matches Josh's promise/payment vocabulary from the 07-22 theory
  session — his frame, made into a data structure.
- **Counted loops (Josh's idea, 2026-08-03 — parked, not needed now):**
  extend the loop directive with a repeat count — `loop: 1.1 x5` = jump
  back four times, fifth arrival continues onward (repeat barlines + coda,
  in rollnotes form). Player already shows-but-never-plays material past
  the loop anchor, so the outro slot exists. NB re the epilogue that
  inspired it: the detector found NO exact repetition in its 270s — Josh
  hears ~5 passes + outro, so the passes must vary per pass
  (orchestration? articulation?). Stripping it would lose that variation;
  the better epilogue question someday is *what changes between passes*.
  Counted loops shine instead for Josh's own compositions (vamp ×4 then
  bridge) and future albums with true exact internal repeats.
- ~~Concept index~~ CLOSED 2026-08-22: redundant — glossary.md already
  does it (terms, anchors, statuses); Josh pointed this out when the
  web tutor proposed rebuilding it.
- **Concept index + in-app search (from Josh's 08-02 notes):** notes are
  organized per song but his questions are increasingly per concept
  ("where else have I seen a raised 7th"). Plan: (a) tag convention in
  rollnotes (#harmonic-minor, #chromatic-bass) + a script generating
  concepts.md from all rollnotes; (b) a search box in the app that greps
  all rollnotes across the album and jumps to hits. The tag index is the
  prerequisite for meaningful search. Not built yet.
- **NSF meter/tempo fossil problem + build request (Josh, 2026-08-05):**
  the pipeline reads each song's meter and seed tempo from the .mid it
  itself wrote — a closed loop tracing back to the discarded arrangement
  MIDIs, with no provenance and no error detection. Shop proved a fossil
  wrong (4/4 → Josh determined 3/4). BUILD (in progress 2026-08-05):
  (1) preserve chip volume → MIDI velocity + notes.txt column (pulse
  channels only; triangle has no volume control); (2) best-fit meter
  detector from the capture alone — figure-period barline test first
  (shop's method), then onset grouping and pulse accents; confidence +
  "ambiguous" allowed; note-value naming pinned by a 60–180ish tempo
  window and labeled as convention; (3) key detection DROPPED (Josh's
  job); (4) audit all songs, surface mismatches with evidence, never
  auto-overwrite — full report quarantined in reference/ so
  undetermined meters aren't spoiled in passing.
- **Meter judge — detector v2 researched, parked (2026-08-05/06):** full
  plan in [reference/meter-detection-plan.md](albums/final-fantasy-i/reference/meter-detection-plan.md).
  Two independent judges test Josh's by-ear meter guess (guess required —
  tool refuses to run without one): audio judge (render chip wav from our
  emulator → Beat This! downbeat tracker → beats-per-bar) + symbolic
  judge (McLeod met-detection/met-align PCFG/HMM on header-stripped
  .mid). v1 audit proven too weak (would have passed shop's wrong 4/4).
  Acceptance: shop→3/4, menu→6/8, epilogue→refuses. Open: audio-only
  first vs both; does the APU stage emit samples. Motivation: Mega Man
  and other cold NSFs with no transcription reference.
- **Channel-swap re-check (from gurgu's device find):** re-check
  already-swept songs for mid-song channel role swaps Josh may have read
  through — script idea: per song, which channel holds the lowest pitch
  per bar; report changes. Not built yet.
- **Game Over exercise owed:** bass root notes of all 8 bars as one
  sequence; name the pattern (game-over.md).
- **Browser "Load .nsf" in Night Roll** (idea 2026-08-02; **SHIPPED
  2026-08-15** as File → Import…): one byte-sniffing picker (MIDI loads
  directly; NSF opens the capture panel), captures every track through
  the dynamically-imported tools/nsf/ pipeline into LOCAL drafts under
  albums/imports/<album>/, audition → ✕ duds → Commit import pushes the
  keepers (mid + loop rollnotes + album.json + manifest) as a real
  album. Josh's ruling: nothing commits until auditioned. URL fetching
  was cut by Josh same day (downloading to the iPad turned out easy —
  Files app, then the picker browses it). Standing caveats remain true:
  cold NSFs start grid-fitted 4/4 until bars are counted by ear; tracks
  are numbers until listened to; expansion chips (VRC6/FDS) don't
  capture. First cold-NSF field test planned: Mega Man 2 on the iPad.

- **In-app AI (local models) — P1a + P2a + P3 SHIPPED 2026-09-25 (✦ Ask
  tutor chat, ✦ Fill generation under the Bassist's contract, in-browser
  WebLLM backend). Owed: P4 iPad route (Josh installs Tailscale on Mac +
  iPad, then Settings → Test says what's left), the Settings Test on the
  iPad for the in-browser path (WebGPU limits), Safari-on-Mac probe.
  Finding: no request flag disables Qwen 3.6 thinking in LM Studio —
  set it on the model there; the status line now shows thinking
  progress.** `local-llm-design.md` (advisor-reviewed to
  convergence, 4 rounds); technical reference NIGHT-ROLL.md "✦ Ask".
  Verified on the Mac against LM Studio (Qwen 3.6 35B-A3B): 39 s replies,
  34 s of it thinking — a no-think option is queued. P0 probes still owed:
  Safari→localhost, Chrome local-network prompt on Pages, iPad WebGPU
  (`probe.html`), Tailscale flags.
  Josh's brief: tutor + generator ("fill in a few chords here"),
  anyone can run a model on their own, iPad points at his MacBook.
  Backends: another computer (LM Studio/Ollama URL), this browser
  (WebLLM, if the iPad probe passes), cloud later. Generation follows
  the Bassist's contract exactly (apply immediately, one ⟲, take
  chips), editable songs only. His rulings in §10: hints-first rules
  everywhere (web-session rules; tells him when he says he gives up),
  "why" behind a tap, any host with a one-time warning, Tailscale for
  the iPad, model asks when stacked-vs-mono is unclear. Next: "run
  P0" (probes). The item below is superseded — the branch's transport
  is replaced, its sheet/prompt reused.
- **In-app Claude chat — built but parked on the `claude-chat` branch,
  superseded by the plan above** (2026-08-01): a complete chat feature (💬 button,
  per-song conversations, streaming, context injection of
  cursor/rollnotes/lasso, tutor system prompt that won't spoil
  undiscovered keys/chords) is committed on branch `claude-chat` (pushed).
  Blocker: it needs a pay-per-use Anthropic Console API key — Josh's $200
  Max subscription can't fund direct API calls, which frustrated him.
  Options discussed: downgrade Max $200→$100 and fund the API from the
  difference; use the Claude iPad app pointed at this repo (chosen for
  now — albums/final-fantasy-i/songs/*.notes.txt dumps exist so the app can read actual notes);
  or drop the feature. Revisit with Josh; merge the branch if he funds a
  key (it will need a rebase over main's later changes).

- **Two-regime score zoom** (parked 2026-08-01, low priority): pinch
  compresses time down to the engraving floor (current behavior), then
  keeps going by uniformly scaling the whole rendered page — staves,
  glyphs, everything — like stepping back from paper. Discussed and
  deemed workable: uniform scale preserves the shared linear x-axis, and
  the floor-resolution measure cache downscales crisply for free. Cost:
  plumbing a shrink factor through drawing, hit-testing, lasso bands,
  playhead mapping (~an evening). Josh's verdict: not needed now — the
  roll's unlimited zoom-out covers the overview job better anyway (lines
  stay readable where tiny notes wouldn't).

- **Synced-note edits don't survive reload before Sync** (found in 2026-07-31
  code review): editing/deleting a *synced* note then reloading the page
  resurrects the original (edits show as duplicates, deletes revert) because
  localStorage only persists added notes, not tombstones. Sync promptly and
  it's fine. Fix sketch: persist removed-synced tombstones alongside added
  notes and re-apply them in loadNotes.
- **Score cache memory at extreme zoom** (same review): per-measure canvases
  at max pinch zoom are ~9 MB each and the cache caps at 60 *entries*, not
  bytes — iOS Safari may silently blank measures at very high zoom. Fix
  sketch: cap the cache by estimated bytes instead of count.
- **Score view** — DONE, committed 2026-07-31 (see score-view-plan.md for
  known limitations).
- **Score spelling refinement** — Ab in the Baseball song spells as G#
  (static chromatic heuristic); context-aware spelling someday.
- **NES-faithful arrangements** — MOSTLY DONE 2026-08-01: padding tracks
  stripped (tools/strip_tracks.py) from shop (9→3! it was 3 parts × 3
  instrument copies), cave (6→4), airship, town, dungeon, prologue,
  chaostemple, gurgu. Chord tracks kept per Josh (useful when stuck).
  Left alone: elfland (8 tracks) and epilogue (11) — genuinely split
  orchestrations, too tangled to strip safely; battle's brass and
  floatingcastle's twin interlocking arps are real split NES parts, kept.
  If elfland/epilogue bother Josh, hunt leaner transcriptions instead.
  Palette extended to 12 colors so 11-track epilogue no longer repeats.
- **Gurgu Volcano loop "slightly off" to Josh's ear** (2026-08-01): trim
  verified mathematically clean — both passes tick-identical, exactly 42
  bars, no notes crossing the seam. So the seam feel is in the
  transcription itself. Revisit musically if it keeps bothering him.
- **Track visibility variants** — mute now fully hides a track (Josh's
  request); later maybe: dim-but-visible, and audio-mute-only toggles.
- **Lasso later ideas** — cross-staff chord naming conventions, remembering
  reveals per song, maybe a "quiz me" mode built on lasso selections.
- **Mid-song key signature changes** — DONE 2026-07-31: `key:` directives in
  .rollnotes, set from the key dial at the cursor bar; signature drawn at
  change barlines.
- **iPad app** (discussed 2026-07-31, parked — "worth exploring"):
  - Tier 1, ~an hour: web manifest + icon + standalone mode → Add to Home
    Screen gives an app icon, full-screen launch, durable storage; updates
    still flow via git push. Do this first whenever wanted.
  - Tier 2, days + $99/yr: Capacitor/WKWebView wrapper for the App Store.
    Only real feature gain: native MIDI hardware input (play a keyboard
    into the app — iPad Safari has no Web MIDI).
  - Native Swift rewrite: roll/audio/annotations portable in days, but no
    VexFlow equivalent exists — hand-rolling engraving is the months-shaped
    part — and build/sign/install kills the push-and-reload iteration loop
    that built this in six hours. Not worth it.
- **Mid-song time-signature changes** (parked 2026-07-31): a fourth
  annotation type ("Time change") in the type-first editor, like key
  changes. Real work hides underneath: the whole app assumes one meter —
  bar math (ruler numbers, measure boundaries, beat dropdowns, score
  measures, loop end) would need to become region-aware. The MIDI parser
  already sees the 0x58 events; it just keeps only the last one.
- **Enharmonic respelling** (idea, Josh undecided): tap a score note to flip
  G#↔Ab — notehead moves line↔space, choice stored in rollnotes. Maybe
  moot if direction-aware spelling (raise ascending, flatten descending)
  is built first; the static heuristic currently misspells Baseball's Ab
  as G#.
- **Loop passes:** MOSTLY DONE 2026-08-01 — 13 MIDIs with exact repeats
  trimmed to their first pass (tools/trim_loops.py), so anchors now cover
  those songs fully. Battle since rebuilt at 29 bars (3-bar intro +
  26-bar loop). Cornelia had a half-bar of leading silence (whole song
  shifted 2 beats): unshifted + trimmed to its 8-bar loop (2026-08-01) —
  Josh's existing cornelia rollnotes anchors may now sit 2 beats late;
  offer to auto-shift them if they look off.
  Dungeon trimmed to 16 by Josh's ear (2026-08-01). The old "awaiting
  cut bars" list (elfland, epilogue, floatingcastle, prelude, ship,
  victory) is STALE: elfland was deleted 2026-08-02 (not in the NSF),
  and the chip migration auto-trimmed everything with an exact repeat —
  epilogue is the real holdout (no exact repeat; varies per pass).
  Superseded anyway by the in-app `chop:` annotation (built 2026-08-06):
  Josh trims any song himself from the editor, non-destructively.
- **Victory chip loop seam — RESOLVED 2026-08-02:** the "beat 3" reading
  was a trimmer artifact (it sliced mid-way through the loop-seam overlap
  cluster). Fixed detector puts the seam at bar 2 beat 4 — Josh's by-ear
  4& was right within a quarter-beat. Directive now loop: 2.4.
- (Done recently, for orientation: Night Roll player, .rollnotes + sync,
  sections/arrangement lanes, range-select ruler drag, grouped dropdown
  with compositions/, CVD-safe track palette, rewind + Edit toggle.)

## 2026-09-30 21:40 — from Josh via Ask: Aeon Battle crash, then no console sound anywhere
Josh: "Aeon Battle just crashed the app and it reloaded, and now none of the sounds are working — so you haven't solved this generally." Context: PS2 album, aeon-battle, build 09/30 21:36. ⚠ log: "the console render failed for Aeon Battle (Error: couldn't load module tools/ps2/psf2.mjs: Importing a module script failed.) — tap ▶ to try again" x3. After the OOM crash + reload, every console song is silent, and retrying keeps failing on the psf2.mjs import. Wants: (1) the memory budget to prevent the crash for ALL big PS2 songs, not just Challenge; (2) after a crash/reload the module import must recover (looks like a failed dynamic import is cached, or the module is missing from the iPad bundle/cache). Please diagnose from the Aeon Battle numbers (held + peak) and tell him.

**RESOLVED (code) 2026-09-30, not yet confirmed on his iPad — needs a real
build + Aeon Battle re-test, not just vm tests:** (1) psf/psf2 now render
chunk-by-chunk straight into the kept buffers (`renderStreamed`/
`chipRenderStreamed`) instead of holding the whole stereo render and a mono
copy at once — peak ≈ kept + one chunk, not ~3x; `planChipRender` also
budgets honestly (3x-aware) for any OTHER chip kind that doesn't have this
yet, so a "fits" verdict never trusts kept bytes alone. (2) `loadM`/
`chipModules` each retry a failed import once, inline, with a fresh
cache-buster, before giving up — a transient post-crash failure should no
longer need a full restart to clear. Diagnosis: the crash itself (not the
import failure) is what starved later imports — Challenge-sized numbers
(1.88 GB) already pointed at the SAME mono-plan 3x-peak bug step 0 found;
Aeon Battle just also tripped it. Write-up: NIGHT-ROLL.md "Aeon Battle
crash + recovery"; tests: tests/chip-worker.test.mjs, tests/night-roll.test.mjs.
Still owed: Josh re-running Aeon Battle on a real build to confirm it no
longer crashes and that a subsequent song's import recovers on its own.

## 2026-09-30 22:35 Josh (via Ask): tapped notes must use the EXACT game sound
In FF4 "Cry in Sorrow (part 1)" (SNES), touching notes plays the generic synth ("midi sounds"), not the game sound. He wants every console tap preview (SNES first, then Genesis/N64/NES/GB/PS) to play the real chip/sample voice for that track at that note; it breaks his analysis concentration when it differs. Earlier PS1 fix (25cab929) covered PS1 only.

## 2026-09-30 22:37 Josh (via Ask): track colors too similar in the roll
In FF4 "Cry in Sorrow (part 1)" (SNES) voice0 and voice2 (and likely neighbours among voice0-voice6) are hard to tell apart by color; he can't tell which is the melody. "I wish we could do something about that." Wants clearly distinguishable per-track colors, at least within one song (SNES/console captures with 7-8 voices first).

## 2026-09-30 23:36/23:40 Ask chat: edit_annotation, delete_annotation, publish_song — DONE 2026-10-01
Shipped all three (ASK_TOOLS/askRunTool, index.html): `edit_annotation` and
`delete_annotation` target an EXISTING annotation by `id` (the `<context>`
block's annotations listing now tags each entry with its index into
`rollnotes` — `askAnnotationsText`/`dedupedNotesWithIndex`, good for the one
turn that read it) or by `bar`+`beat`(+`match_text` to disambiguate);
ambiguous or missing → an error asking which, never a guess
(`askFindAnnotation`). Edit rebuilds the line through the same grammar
add_annotation uses (kind/comment default to the existing note's own), then
tombstones the original and pushes the fresh one — the annotation count is
unchanged, so it's an in-place text change, never a duplicate. Delete uses
the same tombstone path the note editor's own Delete button uses, so
Publish drops a synced one for good. Both refuse a structural directive
(meter/chop/track/audio/lane) — out of scope, has re-barring side effects;
use the app's own editor for those. `publish_song` runs the exact per-song
sequence the footer Publish button runs for the open song, refuses with a
reason when not connected or no song is open. All three: explicit-ask-only
(same rule as add_annotation), not offered in the general chat (no open
song — `ASK_SONG_ONLY_TOOLS`). No ⟲ undo entry — the note editor's own
Save/Delete don't push one either today, so this adds no new asymmetry.
Docs: NIGHT-ROLL.md "Tools" section (new sub-bullets) + "General chat";
help sheet ✦ AI entry + FEATURES drift keyword "add, edit, delete, or
publish"; HELP.md rebuilt. Tests: tests/night-roll.test.mjs — id/bar+beat
targeting, ambiguous-target error, in-place edit (no new annotation),
tombstone-on-delete (synced) vs no-tombstone (never-synced), structural
directives refused, general-chat filtering, publish_song calls the
(stubbed) publish path and refuses when not connected. Full suite green.
Still owed, NOT done here (needs a live session with the song open — I only
shipped the tool, I didn't run it against his real file): the
cry-in-sorrow-part-1 cleanup itself (4 Ask-added numeral/summary notes to
fold into their chord note fields and remove) — his 23:47 ruling still
applies when that happens (keep his own words, APPEND the numeral+
explanation after them; Bbm has no note yet, so it just gets the numeral).

## Albums in GAME order — DONE 2026-09-30
Two-part item, both parts shipped. Part 1 (commit 2bfffc95):
`tools/album-order.mjs` reads each capture's original rip and writes the
soundtrack position into album.json as `nsf.tracks[slug].track` (+`.disc`
for multi-disc), 51 albums covered; no playlist to order by for a few NES
sets (Zelda, Mega Man 2, Shadow of the Ninja, SMB3, Tetris, TMNT 2); no
rip yet for Final Fantasy Legend. Part 2 (this session): the app's
**Game order / A–Z** switch — a segmented control at the top of an
album's song list (Open… and File ▸ Open), shown only when the album has
track data. ONE function, `albumOrder(album, songs, mode)`, decides the
order for both the list AND album play (💿 Play album, ⏮ Prev/⏭ Next) —
Josh's WYSIWYG ruling: whatever order is shown is what plays. Device-local
pref (`ff1roll-albumorder`, game|az, default game). No manifest.json
change was needed — the app already warms every album's full album.json
at boot (`albumMetaFor`/`albumMetaCache`), which already carries `.track`.
Docs: NIGHT-ROLL.md "Album play" (new "Game order / A–Z" subsection), help
sheet entry + HELP.md regenerated, FEATURES drift keyword "Game order".
Tests: tests/night-roll.test.mjs — albumOrder game vs az, untracked songs
last, multi-disc (disc then track), switch hidden with no track data,
switch present + tap flips the pref and redraws, Next/Prev follow whichever
order is shown. Full npm test green (night-roll.test.mjs 329/329,
album-order.test.mjs 10/10, whole chain exit 0).

(2026-09-30 23:40 "publish this song" as an Ask tool, and its 23:47 cleanup
ruling, are folded into the 23:36/23:40 DONE entry above.)

## 2026-10-01 21:30 — Ask context: send only what changed (Josh, via Ask)

Josh: every Ask message currently carries ALL of the song's annotations
(chord notes included) plus the visible bars' notes. On a long song with
many chord changes that adds up in tokens. He wants the terminal to design
a more efficient scheme — e.g. send annotations/notes only when they
changed since the last message of that song's session (the resumed Ask
session already remembers earlier turns), or a compact diff. Constraints
he has set elsewhere: Learning mode rules still bind (key state, no
pre-filled answers); the edit/delete tools need the current annotation
"id"s, so ids must stay available when a tool call is possible. Not urgent
("not the biggest deal"), but wanted before long-song analysis sessions.

**Correction 2026-10-01 21:35 (Josh, via Ask) — the real ask is broader.**
Josh's goal is the most token-efficient way to communicate about songs in
Ask, full stop. "Send only what changed" is ONE idea he finds reasonable,
not the requirement; he did not want to lead with it. Design the whole
scheme: how annotations, visible notes, status lines, the format preamble
and the key/mode lines are sent, and what a long, chord-heavy song costs
per turn. Compact encodings, on-demand reads (the model already has
read_song / read_notes tools), and caching are all fair game. Keep the
Learning-mode constraints and the annotation ids the edit/delete tools need.

**Advisor plan: docs/ask-token-plan.md** (full build order, steps 0–7;
NOT all done — see it for what's still open: step 0 measurement ring,
step 1 tool-round de-dup, step 3 smaller read-mode base, steps 5–7 compact
encoding / skip-already-sent-bars / warm auto-Compact).

**DONE 2026-10-01 (terminal, steps 2 + 4) — change-only gate + mode
separation.** `askCachedBlock` (index.html, NIGHT-ROLL.md "Bridge-session
caching") hashes the annotations block and the visible "notes in bars a–b"
window per chat; unchanged since the last CONFIRMED send (and the backend
is the bridge) → a one-line stand-in ("annotations: unchanged since your
last message (N entries)") instead of the full text. Confirmed only on
`askFinish` (never `askFail` — a failed send never claims the bridge holds
content it may not have gotten); full again after Clear chat / Compact
(the bridge's own session controls), a song-key change, or on any
non-bridge backend. The existing "New since your last message:" seen-
cursor got the same success-only fix (`askSeenStage`/`askSeenCommit`/
`askSeenDrop` — it used to advance right when the context was BUILT, before
the send was known to succeed). SAFETY fix bundled in (step 2):
`askSessionName()` now appends `#normal` in Normal mode, so a Normal/
Learning mode flip on the same song never resumes the same bridge session
— closes a real leak path (a resumed session remembers Normal-mode content
verbatim; CLAUDE.md: nothing from Normal may reach Learning's AI context).
Measured on a small sample (2 tracks, 5 annotations): context block 1847 →
437 chars once cached (−76%). Tests: the "P8 bridge-session caching" block
in tests/night-roll.test.mjs (8 cases). `npm test`: full chain green
(night-roll.test.mjs 365/365, whole suite exit 0). Steps 0/1 (the bridge's
own measurement ring + tool-round de-dup) are tools/claude-bridge.mjs —
another builder's in progress there; not touched here.

## 2026-10-01 21:58 — Chord-note dialog: text area doesn't grow with the window (Josh, via Ask) — DONE 2026-10-01

Josh: in the chord note dialog, dragging the window's bottom-corner resize
handle makes the window bigger but the note's text area stays the same
size. The text area is the only part that should grow (it's what fills up
as he types more); everything else in the dialog should stay put.
Likely a fixed height/rows on the textarea instead of flex-filling the
space the window gains. Check the same on other windows with a text area
(annotation edit sheets). Browser-verify at iPad size before shipping.

Fixed: it's the one editor (`#noteeditor`, openEditor) — `.sheet` is
already a flex column but every child defaults to flex-grow:0, so the
grip's height increase had nowhere to go. One rule, `#noteeditor #ntext {
flex: 1 1 auto; }` — the textarea alone grows, the 84px no-resize default
is unchanged, width already tracked the sheet. See NIGHT-ROLL.md (Window
manager section) for the full writeup. Tests: markup/CSS presence only
(vm has no real flex layout) — STILL NEEDS Josh's browser-check at iPad
size before this is fully closed.

## DONE 2026-10-01 — Ebm key spells notes in SHARPS with E# (observed via Ask)
FIXED: keyNameToSf lost the typed spelling at the F#/Gb seam (pc 6) — Ebm, Gb, Cb, Abm came out as sharp signatures, C# as flats. Now computed in fifths from the letter + accidental + mode. Affected the roll's spelling in those keys too, not only Ask.


In cry-in-sorrow-part-2, after Josh added `key: Ebm` at bars 16 and 46,
the Ask context's note block (header "Pitches are spelled by the user's
declared key (Ebm)") spelled bars 28–59 in sharps — A#4, C#5, E#5, G#5 —
where Bbm bars were spelled in flats (Bb, Db, F, Ab). Ebm is a six-flat
key; sharp spelling with E# looks like the key is being read as D#m.
Check the key→spelling function for Eb minor (and other flat minors typed
with a flat tonic): the roll labels and the Ask note dump should spell
Eb minor with flats. Reported to Josh as "looks wrong, queued to check".

## 2026-10-01 — Token-efficient Ask: step 5 (compact encoding) + the epoch's app side — DONE 2026-10-01

Continuing docs/ask-token-plan.md (full plan — "Advisor plan" entry above).
Two pieces, bridge-only (`askCaps.bridge`; a local/LM Studio provider is
unaffected):

**Step 5, compact encoding.** `askSpanNotesCompact`/`askAnnotationsTextCompact`
(index.html) replace `askSpanNotes`/`askAnnotationsText` in `askContext` when
talking to the bridge: notes as `"T<n> name"` + `"<bar>|<beat><Pitch><oct>/<dur>
…"` rows (octave/duration shown only when they change from the previous note
IN THE ROW; drums keep the raw note number, `"#"`-prefixed); annotations as
`"<id> [bar.beat-bar.beat] kind: value — comment"` (the `.rollnotes` text
grammar's own span, same ids edit/delete_annotation already use), dropping
`track:`/`lane:`/`audio:` structural directives (song structure, not
analysis — the app's own editor is still how those change). A legend
(`askLegendText`) explaining both formats is sent once per session, tied to
the same sent-hash record the bridge-session caching (steps 2/4, above) uses,
so it reappears after Clear chat/Compact/a changed session epoch.
Learning-mode spelling rules unchanged (`askKeySpellComment`, factored out
of `askSpanNotes` so both paths share the exact same `estimateKey()` gate).

**Epoch, app side.** The bridge's `x-nr-session-epoch` header (already
shipped, step 7) is now read in `aiRemote().chat` the instant the fetch
response lands; a changed epoch (a compact — manual or the bridge's own
automatic one — landed, or the session restarted) calls `askSentReset`, the
same reset Clear chat/a manual Compact already trigger, so the next turn
resends in full rather than trusting a stand-in the resumed session may no
longer back verbatim.

Measured (real 7-track, 8-bar window, n64/banjo-kazooie/boggy-s-race.mid,
plus a 9-entry annotation sample): notes window 4608 → 2390 chars (−48%);
annotations 589 → 171 chars (−71%); legend costs 870 chars once. First
message in a session: 5197 → 3431 chars (−34%); every later message: 5197
→ 2561 chars (−51%) — on top of, not instead of, the bridge-session
caching's stand-ins. Tests: the "P9 compact encoding" + "epoch:" blocks in
tests/night-roll.test.mjs (a decoder pair proves the compact note rows
decode to exactly the full format's own tuples; drums; annotation ids/
dropped directives; the askCaps.bridge switch; the legend's
once-per-session lifecycle; the Learning spy; the epoch reset/no-reset
cases). `npm test`: night-roll.test.mjs 381/381, whole suite exit 0.
Docs: NIGHT-ROLL.md ("Compact encoding, step 5" + the epoch's "app side"
paragraph under step 7), docs/ask-token-plan.md (steps 4's epoch half + 5
marked done). Step 6 (skip-already-sent bars, a read_bars tool, annotation
diffs) is still open.

## 2026-10-01 23:20 — Feature idea (via Ask): a chord-progression library to look up songs by progression
Josh, in his words: "it would be cool to have a whole library of songs and their chord progressions, and then we could look them up." Context: in cry-in-sorrow-part-2 he found roots falling Bb, Ab, Gb, then a fourth down to Db (i, bVII, bVI, bIII). He knows many songs with three chords falling by step but cannot recall one whose fourth chord drops a fourth, and wants to find other songs with the same progression, listen, and feel what they do. Idea: index songs (his albums, possibly a reference corpus) by chord progression, then search by a progression he types or selects. Needs design; chords come from his own annotations, so Learning mode applies (nothing volunteered, no keys named for him).

## 2026-10-01 23:25 — ANSWER to the progression-search question: option B, standalone (via Ask)
Josh chose B, and bigger than the terminal's framing: the progression search should be almost independent of his annotations and of Night Roll's own songs. In his words: "a giant library of these things... they don't have to be on songs we've imported or captured or annotated... go out on the Internet and build this somehow. I have no idea how it would be built. It would be its own thing independent of Night Roll that Night Roll could use. An API Night Roll could ask: give me a list of songs that have this chord progression. Or just that I could use, and then I could look those songs up on YouTube and play them and hear what that sounds like in context." Needs design: where chord data comes from (licensing, open datasets), root-motion-shape queries in any key, a standalone service/API, Night Roll as one client. Learning mode: nothing volunteered; it answers only when he searches.

## 2026-10-01 23:30 — Clarification on the progression library: Josh is the client, Night Roll maybe (via Ask)
Josh: "I'm not even sure Night Roll would be the client. It's more like I would be, but maybe Night Roll could be in some way, not exactly sure yet. Really it's for listening." So design the library as its own thing for him to search and listen to (find songs, then play them on YouTube); a Night Roll hook is optional later, not the point.

## 2026-10-01 — Token-efficient Ask: step 6 (skip-already-sent bars + read_bars) — DONE 2026-10-01

Continuing docs/ask-token-plan.md (full plan — "Advisor plan" entry above).
Bridge-only (`askCaps.bridge`; local/LM Studio unaffected), on top of step 5's
compact encoding:

**Per-bar skip-already-sent.** `askBarRow`/`askBarFingerprint` factor ONE
track's one-bar compact row, and a bar's fingerprint across every track, out
of `askSpanNotesCompact`'s own math. `askSpanNotesCompactCached` hashes each
bar and compares it against a new per-bar field, `askSentGet(key).bars`
(bar → hash), living in the SAME sent-hash record step 4's whole-block
fields already use (one `askSentReset` — Clear chat/Compact/a changed
epoch — clears all of them together). A run of unchanged bars collapses to
one "bars A–B: as sent earlier" line; a new/edited bar still renders in
full. When EVERY bar in the window is already sent, `askContext` gets the
existing whole-block "unchanged since your last message" stand-in instead
(cheaper, and keeps step 4's own tests passing unchanged) — the granular
line only appears for a window mixing new and already-sent bars.
`askSentCommit` deep-merges the `bars` field (every other field there is a
scalar overwrite) and caps it at 2000 bars, dropping the lowest numbers
first.

**read_bars.** A new tool, `read_bars({from_bar, to_bar, tracks?})`
(`ASK_SONG_ONLY_TOOLS` — the OPEN song only, unlike `read_song`/
`read_notes`), reads bars from LIVE `song` state (unsaved edits included);
with no `tracks` filter it's byte-identical to `askSpanNotesCompact` for
that span. Capped to 32 bars regardless of the window's own budget, and
says so when truncated. `ASK_SYS_BASE2` lists it, explains the "as sent
earlier" bars the model may see, and no longer claims the model "cannot
open other songs, files, the repo or the web" (false on the bridge, where
Claude Code actually can) — it now says to prefer the context block and
these tools over reading a song's file directly, since they reflect the
user's live, possibly-unsaved state.

**Skipped:** annotation diffs (+/−/~) — the whole-block change-only gate on
annotations (step 4) already covers "nothing changed"; a true diff only
pays off for a turn that both reads and edits several annotations at once,
which Learning mode's "never on its own initiative" rule makes rare.

Measured (a 64-bar synthetic song, one note per bar, scrolled in 8-bar
steps to the end and back — 16 turns, `askSpanCachedBlock` isolated from
the rest of `askContext`): total notes-window chars 3026 → 1990 (−34.2%).
The forward pass (8 windows, every bar genuinely new) is identical either
way, 1615 chars; the whole saving is on the way back — the same 8 windows,
now already sent, drop from 1411 to 375 chars (−73.4%). Before this step, a
revisited window paid full price again unless it was the SINGLE most
recently sent one; now the per-bar record remembers every bar ever
confirmed sent in the chat, however long ago. Tests: the "P10
skip-already-sent bars"/"P10 read_bars" blocks in tests/night-roll.test.mjs
(12 cases). `npm test`: night-roll.test.mjs 387/387, whole suite green.
Docs: NIGHT-ROLL.md ("Skip already-sent bars + read_bars, step 6"
paragraph), docs/ask-token-plan.md (step 6 marked done + a final summary of
all eight steps, 0–7). This closes out the token-efficient-Ask plan — every
step in the build order is now shipped.

## DONE 2026-10-02 13:05 — iPad/iPhone: tapped notes silent with the silent switch on, but Play is audible (via Ask)
FIXED: previewNote switches the session to "playback" (audible with the silent switch on) and back to "ambient" 2 s after the last tap. Side effect: a tap pauses other apps' audio, like ▶.
Josh: with the iPhone/iPad on silent, pressing Play plays sound, but pressing/tapping a single note (Ab3, bar 10 beat 1, voice1 in cry-in-sorrow-part-2) makes no sound. Audio engine reports running, ⚠ log empty, status lines show the press registered ("Ab3 · bar 10 beat 1 · vel 16 · voice1"). Suggests the audition/tap path and the Play path use different audio routes (one honoring the silent switch, one not). Josh's rule: ear reports are measurements; reproduce before working around (see ipad-audio-known-good-engine).

## DONE 2026-10-02 — default track colors: first three are orange, cyan, PINK (via Ask)
DONE (see the 18:55/18:58 items below — superseded by a real max-min algorithm; first three are orange(30°)/blue(210°)/green(120°) again).
Josh, on a brand-new untitled-1 (pulse1/pulse2/triangle): the first three default colors are orange, light blue and pink; orange and pink are close. It used to be orange, blue, green, which he liked. The 12-hue +150° walk (TRACK_COLORS, index.html ~L2979) puts #d55181 (330°) third, only 60° from orange (30°) around the wheel; green (#008300, 120°) is fourth. Wants the first three clearly distinct again: orange, blue, green, then the rest of the walk. Check the 4th+ tracks stay distinct (FF4's 7-track set he approved 2026-09-30 should not get worse). Colors he set himself unchanged.

## DONE 2026-10-02 — track colors: Josh wants a real max-min algorithm, not a reshuffled list (via Ask)
DONE: `autoTrackColors(tracks)` (index.html, near TRACK_COLORS) — greedy max-min over a 24-hue/15° candidate set, assigned in track order, memoized per song (explicit colors + track count). First 8: orange(30°), blue(210°), green(120°), magenta(300°), yellow-green(75°), red(345°), cyan(165°), violet(255°) — FF4's 7-track set holds >= 45° between every pair, not just neighbors. Stable: a track's auto color depends only on the tracks before it. Test: tests/night-roll.test.mjs "autoTrackColors: farthest-point default track colors, explicit color still wins". Docs: NIGHT-ROLL.md's TRACK_COLORS paragraph.
Josh: "There has to be some sort of algorithm that always picks the furthest color away from all the colors you currently have in a set." Replaces the fixed +150° TRACK_COLORS walk (only separates CONSECUTIVE indexes; wraps to 60° between 1st and 3rd). Spec: farthest-point selection — each new/unset track takes the candidate hue (from the 12-hue palette or finer) maximizing its minimum circular hue distance (plus lightness/chroma sanity) to every color already used in the song, including colors Josh set by hand. First track stays orange; second ~opposite (blue); third ~90° from both (green). Must stay stable (a track's auto color shouldn't change when later tracks are added), so assign in track order and skip tracks with explicit colors. Check FF4's 7-track set doesn't get worse. Supersedes the 18:50 palette-order item.

## DONE 2026-10-02 — track colors: exclusions (via Ask)
DONE: `TRACK_COLOR_CANDIDATES` hard-filters the 24-hue set to a lightness band (no black-ish, no near-white) and WCAG contrast >= 3 against `ROLL_SURFACE_COLORS` (--bg, --grid-soft, --grid — the roll's own background and pitch-row shading); all 24 candidates at the chosen S/L clear both. No light theme exists, so no second set to check. Near-white is excluded outright (the "simplest fix") rather than cross-checked against gold/accent individually.
Josh: avoid black-ish colors; white is OK on the dark theme, but nothing that looks like the roll's own rows ("rows of notes on a roll" — the lane stripes/background shading). Add to the 18:55 max-min spec: candidates must pass a lightness band and a minimum contrast against the roll background AND the row/lane shading colors (both themes if there's a light theme); near-white allowed only if it can't be mistaken for the playhead, selection or highlight colors. Distance in max-min = hue distance, with that contrast as a hard filter on candidates.

## DONE 2026-10-02 19:02 — Ask should be able to WRITE NOTES on Josh's own songs (via Ask)
Josh, on untitled-1: asked Ask to insert a C3 gallop on the triangle track (a couple of gallops, to check the tempo in his head). Ask has no note-writing tool (only add/edit/delete_annotation); the ✦ Fill button is the only route. Josh: "I need you to be able to fill in notes, especially on a song I'm working on — not a song I'm trying to learn. That would be a key feature for anyone doing song development."
Proposal: a write_notes Ask tool (track, bar/beat start, list of pitch+start+duration+velocity, optional replace-range), ONLY on editable/own songs, ONLY when the user explicitly asks; one undo step; says in one line what it wrote; refuses on captures/locked songs. The user's chat request is the per-instance approval for his own song (CLAUDE.md compositions rule). Needs a rule decision: today's Ask prompt says this chat writes no notes outside annotations — update that line and NIGHT-ROLL.md. Probably also a pattern shorthand (gallop = 8th+16th+16th) is unnecessary; the model spells out the notes.
DONE: shipped as the write_notes Ask tool (ASK_TOOLS/ASK_SONG_ONLY_TOOLS, index.html) — track matched by name (never the selected track), every note validated before anything lands, one ⟲ undo step via applyTake, refuses off editableSong() naming ✎ Edit. See NIGHT-ROLL.md's ✦ Ask section.

## DONE 2026-10-02 19:05 — REMOVE the ✦ Fill button; Ask chat writes notes in plain language (via Ask)
Josh tried ✦ Fill on untitled-1 ("C3 gallop on triangle"): take 1 wrote C4 D E G on pulse1 (wrong pitch, wrong track, not a gallop). He found the button confusing ("I don't know what this Fill button does… I don't like it") and wants it gone. Wants: type "insert a gallop on C3 on the triangle" into the normal Ask chat and have it just work. Supersedes the 19:02 item's framing: build write_notes as the replacement, then remove the ✦ Fill button (and the edit-row ✦ / Edit ▾ → Fill with AI…, the Ask sheet's fill-onto row, help-sheet entry, drift keyword, HELP.md, NIGHT-ROLL.md, Ask system prompt line "this chat writes no notes"). Fill's validation (range, real pitch, register) and one-⟲ landing carry over into the tool. Target track must come from the user's words (triangle), never defaulted to the selected track.
DONE: ✦ Fill removed entirely — #fillbtn, Edit ▾ → Fill with AI… (#emAskFill), the Ask sheet's fill-onto/take-chip rows, and every Fill-only helper (askFill/openFill/askFillable/askValidateTake/askTargetOptions/etc.) are gone; its gate, validation and one-⟲ landing live on inside write_notes. Help sheet, HELP.md, drift keyword, and NIGHT-ROLL.md all updated; vm suite green (389/389 real tests, pre-existing "real rip" failures aside).

## DONE 2026-10-02 19:25 — toggle for the "added this session" dashed outline: View ▾ → Display → ┄ Outline new notes, device pref, off by default
(original:) 2026-10-02 19:25 — via Ask (Josh, iPad): toggle for the "added this session" dashed outline
Josh: "is there a way to turn that off… it's actually a cool idea, highlight all the notes added this session with the dotted line, I actually really like that I just don't wanna see it all the time. Especially when I'm writing a new song, of course I know they're all unpublished."
Today index.html ~L5397 draws the white dashed stroke for every n.added note, unconditionally. Wanted: a device-local View-menu toggle (localStorage pref, not song state), default off or off for brand-new songs; keep the feature. Needs help-sheet entry etc. per the shipping checklist.

## DONE 2026-10-02 19:33 — lasso clear left a gold note (Josh, Terminal #47): a single selection from before lasso mode drew the same gold ring and survived "lasso: cleared"; empty tap and tapping the note out now clear it too
## DONE 2026-10-02 19:35 — AI window: several screenshots per message + 🖼 pick from Photos (Josh, Terminal #47)
Josh tapped 📷 twice meaning to send both shots; the old single-slot `askShotPending` silently dropped the first. Built: `askShotPending` is now an array (cap 4) — each 📷 tap appends, each has its own thumbnail + ✕ (`askShotRemove`), `#askshotx` still clears all at once, status line says "📷 N screenshots — sent with your next message". A new 🖼 button (aria-label "Attach a picture from Photos/Files") beside 📷 opens a hidden `<input type=file accept="image/*" multiple>` — iPad Safari/WKWebView offers Photo Library/Take Photo/Choose File. Each picked file goes through `askPrepImage`: HEIC/HEIF or anything over 2752px longest side or 2MB is redrawn to canvas and exported JPEG @0.85 (canvas decodes HEIC in Safari); otherwise kept as-is. Both 📷 and 🖼 upload through the same `askShotUpload` → bridge `/v1/shot` (25MB cap, PNG/JPEG magic-byte sniff only — client always converts HEIC before upload, so the bridge needed no changes). `askShotOutgoing` sends one `(screenshot: path)` line per shot; the on-device bubble collapses them to one 📷 per shot (`askShotDisplayText`). Composer draft now saves `{text, shots: [path,…]}`; an old `{shot: path}` draft restores as one. Both ♪ this song/✦ Ask and ⌨ Terminal share the same composer — verified by reading the shared `askSend`/`askTerminalSend` code path, both call `askShotOutgoing`/`askShotClearAll`.
iOS shell (~/work/ff/night-roll-app, separate local repo, not pushed): Info.plist had no NSPhotoLibraryUsageDescription (needed for the file input's photo-library option) or NSCameraUsageDescription — added both ("Attach a picture to a message for Claude."), committed on its current branch (master).
Tests: tests/night-roll.test.mjs — "📷/🖼: several screenshots per message (cap 4), per-item removal, and the old single-shot draft shape" and "🖼: the Photos/Files picker is a hidden multi-file image input beside 📷". Help sheet, HELP.md, drift keyword ("from Photos"), NIGHT-ROLL.md updated.
## DONE 2026-10-02 19:30 — View ▾ sections are sub-menus (Josh, Terminal #46)
Josh: "View ▾ is too tall — make EVERY section an expanding sub-menu." Generalizes "View type ▸" (chrome density follow-up, ruling #4) to all six groups: View, Panels, Tools (renamed from Highlight / Readout), Display, Background, Mode. Each is now a header row (▸ closed / ▾ open) plus a content div the header shows/hides; ACCORDION — at most one group open at a time, and View ▾ always reopens with all six closed. Header hints: View names the current view type (unchanged), Mode names the current mode (+ Listener), Background shows a running-jobs count. Every existing item id/handler/✓ logic/dimming/Learning-mode hiding is unchanged, just nested one level deeper. See NIGHT-ROLL.md "View ▾ sub-menus (2026-10-02)".

## DONE 2026-10-02 19:55 — undo/redo/copy/paste locked in place (Josh, Terminal #48): ⟲ ⟳ ⧉ 📋 moved to the start of #editrow, ahead of Select/Pencil/Erase and every per-mode control, so Pencil no longer pushes them

## DONE 2026-10-02 20:05 — copy/paste icons (Josh, Terminal #49): ⧉/📋 replaced with Google Material Icons content_copy/content_paste (outlined, Apache-2.0, inline SVG); status lines say "Copy"/"Paste" instead of the glyphs

## DONE 2026-10-02 20:15 — switching back into Night Roll stopped YouTube (Josh, Terminal #51): a tap/▶/click that ended while the app was hidden left the session on "playback" (every revert skips a hidden page), and the wake on return resumed the engine under it. The return now sets "ambient" first when nothing is playing. Taps still use "playback" (he accepted that a note tap may stop YouTube). Needs his ear on the iPad.

## DONE 2026-10-02 20:25 — one ＋ for attachments (Josh, Terminal #52): 📷 and 🖼 merged into a ＋ beside Speak that drops up "📷 Screenshot of Night Roll" / "🖼 Photo Library…" (the iMessage/ChatGPT/Claude-app pattern); Photo Library opens iOS's own chooser (Photo Library / Take Photo / Choose File)

## DONE 2026-10-02 20:40 — heads-up before an iPad install relaunches the app (Josh, Terminal #53): build-ipad.sh → bridge --deploy-in 20 → ✦ AI counts down in gold. Bridge needs a restart to know /v1/deploy (done when idle).

## 2026-10-02 20:55 — icon audit for Josh (Terminal #50): https://claude.ai/artifact/RB1G5wuzBcEMfmiVmnteoK — 61 controls vs Google Material icons: 41 switch / 12 keep / 6 either / 2 done. Waiting on his pick (Q-list). Also found: Edit ▾ menu Copy/Paste still show ⧉/📋; ▦ ⇄ ⊞ each carry two unrelated meanings.

## DONE 2026-10-02 21:10 — buttons look pressed (Josh: copy "doesn't seem like it pressed"): every button dims + dips on :active; a no-op touchstart listener makes iOS Safari apply :active at all

## DONE 2026-10-02 — one control registry: setControl() (Josh: "the code is not well factored", approved) — docs/split-plan.md §4 step 2 (Opus builder, worktree branch)
`src/ui/icons.js` (ICON + iconSvg, moved out of app.js verbatim) and `src/ui/controls.js` (CONTROLS table: id → {icon, glyph, cls, label, prefix, aria}; `setControl(id, patch)` the only writer of a registered control's innerHTML/aria-label — every field is an independent patch, so an aria-only call never clobbers a label another call just wrote). Migrated: Play ▶/■ (setPlayBtn now a thin wrapper; playGateTick's loading-% display too), #volbtn (setVolBtn), #jobsbtn/View ▾'s #vwJobs (updateJobsBtn), #errbtn/#vwMessages (errChip), #askbtn (deployButtonTick's countdown + askStatus's aria-label), #viewbtn + the Roll/Tracks/Score drop-up (#vsRoll/#vsTracks/#vsScore), every renderViewMenu() row (Roll/Score view/Listener mode/Tracks view/Mixer/Tracks/Edit toolbar/Outline new notes/Bottom bar/Instrument panel/Notes strip/Compare with repo/Analyze/Learning mode) + #vwGrid — 26 registered controls total. Not migrated (no fixed id, or static-only — see NIGHT-ROLL.md "Controls registry"): renderJobs()/fsubItem()'s per-row button factories, the mic/Speak button, #askattach/#askshot/#askpick (nothing writes them). tests/controls.test.mjs: a static scan (tools/split/check-controls.mjs) fails if any src/ file but ui/controls.js writes a registered control's textContent/innerHTML/aria-label (allowlist empty, may only shrink) + a behavioral proof of setControl()'s icon/glyph/prefix/partial-patch semantics. npm test: night-roll 417 (416+1 skip), gestures 17, bridge 10, pwa 3, package 3 (47 runtime modules), modules 33, controls 3 — all green; check.mjs clean except the known pre-existing oldBpb finding. One real tooling finding this step surfaced: app.js's top-level boot code calling the newly-imported setVolBtn tripped check.mjs rule 4 (layer-0-only top-level references) — app.js (LEGACY_CONTAINER) is now exempt from rule 4 the same way main.js already was, for an analogous but narrower reason (see tools/split/check.mjs's comment and docs/split-plan.md "Deviations (2)"). Doc sweep: NIGHT-ROLL.md module map + new "Controls registry" section (also flags a pre-existing inaccuracy in the "Material icons" section's ".chk"/.lbl" description — never matched the real code). `npm run test:e2e:smoke`: 8/8 passed (6.2s).

## DECIDED 2026-10-02 21:30 — split index.html into ES modules (Josh: "just whatever the advisor says for the plan, just do it")
No build step stays; the one-file rule goes. Opus advisor writes docs/split-plan.md; Sonnet builders execute it step by step, one shippable step per push. Order: Material icons ship first → split (control registry folded in). Josh won't review the plan.
## DONE 2026-10-02 21:00 — Material icons across the app (Josh approved the audit's 41 switches)
DONE: all 41 SWITCH rows from docs/icon-audit.html applied (Google Material Icons, outlined, @material-design-icons/svg, Apache-2.0) — Edit toolbar, transport/LCD, footer, AI window, and File/Edit/View menus — plus the Edit ▾ menu's #emDup/#emPaste (still showing ⧉/📋) switched to match the toolbar's #copybtn/#pastebtn. KEEP/EITHER rows left unchanged (music notation, M/S/H, disclosure carets, and the no-urgency-either-way rows). One `ICON` table + `iconSvg()` (top of the `<script>`, boot-path TDZ-safe); every control a label rewrites (counts, Play/Stop, View ▾'s checkmarks, the deploy countdown) now rebuilds its whole `innerHTML` instead of touching `textContent`, so the svg survives. Help sheet prose reworded to name switched controls in words (e.g. "⏳ Jobs" → "Jobs") rather than inline icons; FEATURES drift-guard keywords updated to match. tests/harness.mjs's innerHTML stub now derives textContent (tag-stripped) to match a real browser, since several rewrites are icon+text with no wrapping element. vm suite green (397/397 night-roll.test.mjs; full `npm test` green aside from the 7 pre-existing "real rip" failures). Docs: NIGHT-ROLL.md "Material icons (2026-10-02)".

## DONE 2026-10-02 21:45 — Notes ▴ drop-up gains Hide/Show notes strip (Josh, Terminal #57: the strip above the footer took space and its toggle lived only in View ▾ → Panels)

## DONE 2026-10-02 21:50 — copy_bars Ask tool: "repeat bars 5–6 after bar 6 and shift everything else over two bars" (Josh via Ask)
Josh asked Ask to repeat bars; the model tried a ~130-note write_notes call and it came back one closing brace short (that raw-JSON bug itself was fixed separately, in the bridge: a long tool call missing a closing brace is now repaired and run instead of shown as raw JSON).
DONE: `copy_bars({from_bar, to_bar, at_bar})` — inserts (to_bar − from_bar + 1) bars at at_bar on every track (notes AND annotations after it slide later — section/chord/key/tempo/loop, the same shift Edit ▾ → Insert bars… does), then copies the source bars' notes (every track, drums included) into the new gap; annotations inside the copied range are never duplicated (Learning mode — they're Josh's own analysis), only shifted if after at_bar. One ⟲ undo step for the whole thing. Built on `openGapShift`, extracted out of `insertTime` (Insert bars…'s own apply code, index.html ~L6757) so the shift is never duplicated between Insert bars, copy_bars and the new `insert_bars({at_bar, count})` (empty bars, same shift, fell out free of the same extraction). Same gate as write_notes (editable own songs only, refuses a locked capture naming ✎ Edit). Wired into ASK_TOOLS/ASK_SONG_ONLY_TOOLS/askRunTool and the ✦ Ask system prompt (tool count now eleven, one sentence each). Tests: 3-track scratch-song copy (drums included, later notes + a section annotation shift, an in-range chord neither shifts nor duplicates, one ⟲ restores exactly), bad ranges/locked-capture refusals change nothing, insert_bars. Help sheet + HELP.md + drift keyword "repeat bars" + NIGHT-ROLL.md updated. vm suite green (402/402, one pre-existing skip).

## 2026-10-02 22:25 — BUG (Josh via Ask): app reload left the song with duplicated notes; undo could not recover it
Josh had inserted two bars (Insert bars + paste), then deleted them by hand and shrank the song back. When the iPad app rebooted (build 22:10→22:17), untitled-1's triangle came back with notes DOUBLED: an overlay of the pre-shift and post-shift versions of bars 9–17 (e.g. 9|1C 1C, a gallop laid over the old C# pickups), plus two extra bars (18–19) of stale gallop, and the song length back at 19 bars. Undo history was gone, so nothing to revert to. Ask re-wrote triangle bars 9–17 from its earlier context (write_notes with replace) and emptied 18–19.
STILL DOUBLED after that fix (seen in the 22:18 context): triangle bars 3–6, every note appears twice (3|1C 1C 2C 2C …, 5–6 gallop pairs). Bars 1–2 and 7–8 not re-checked. Needs the same dedupe, or a real fix.
Likely area: the reload/restore path after a bar insert or resize (autosave draft vs .mid, or the unsaved-edits merge applying the shift twice). Josh: "we have some horrible bug that when the app rebooted it threw shit all over the place". Repro idea: insert 2 bars + paste, delete the paste by hand, reload the app; compare notes.

## DONE 2026-10-02 22:45 — reload doubled notes in Untitled/local songs (Josh via Ask, 22:25): loadEdits replayed the removed/added overlay on top of a draft that already held every edit (local/ songs saved BOTH). draftIsWhole() = isComposition()||isLocalDraft(): such songs never write or replay the overlay; a stale one is dropped on load. Edit ▾ → Remove duplicate notes (same track+start+pitch, keep the longer, one undo) to clean untitled-1 bars 3–6 — Josh taps it.

## 2026-10-02 22:30 — URGENT (Josh via Ask): after the 6ad5eee build, untitled-1 lost ALL pulse1 + pulse2 notes
At build 22:23 the open song has only the triangle, and it is the STALE whole-copy: the old bars 9–17 sit two bars later (gallop copy at 9–10, old bar 9–10 now 11–12, F bar at 13, climb at 17), i.e. the state from before Josh hand-deleted the inserted bars. Pulse1/pulse2 are empty. Likely cause: the whole-song copy was older than the added-notes list, and 6ad5eee throws the list away on open — so the newest edits (and the pulse tracks) were only in the list. Please check whether the old overlay/draft is still anywhere on the iPad (localStorage/IndexedDB) before it is overwritten, and whether the discard can be made non-destructive (keep the list aside until the whole copy is proven newer). Ask has the pulse1/pulse2 notes for bars 3–11 in its chat and can re-write them if the data is truly gone, but only with Josh's say-so.

## 2026-10-02 23:00 — untitled-1 RECOVERY READY (terminal) — waiting on Josh's say-so
6ad5eee's load change deleted untitled-1's edits overlay; on his iPad that overlay held the newest notes (the whole-song copy was older). Reverted in c35945e (installed). Recovered the song as of 22:18 (the last Ask context before the bad build) from Ask's own chat history: ~/.night-roll-bridge/recovery/untitled-1-2218.json (write_notes-ready: per track, pitch/bar/beat/dur_beats; 4/4, 175 bpm, 19 bars) + .txt (the compact rows). pulse1 16 notes (bars 4–7), pulse2 37 (bars 3–11), triangle 146 (bars 1–17; the reload bug's 32 exact doubles in bars 3–6 removed). Velocities were not in the context (all 80). ASK SESSION: when Josh says to restore, read that JSON and write each track with write_notes + replace over bars 1–19 (one call per track; the bridge now repairs a long call's missing brackets). Never without his explicit go.
Follow-up (terminal): find WHY the whole-song copy of a local song was older than the overlay (IndexedDB draft writes for local/ — draftInIdb — may be failing or lagging on iPad) before touching the overlay logic again.

## DONE 2026-10-02 — local song persistence: one copy, crash-safe (NIGHT-ROLL.md "Local song persistence (2026-10-02 fix)")
WHY the whole copy was older: local/ songs wrote the draft only on Insert bars, undo of a reorder, track ops and recordings; every note edit went only to the overlay — not an IndexedDB failure. Now a local song writes ONLY its whole draft on every edit (saveEdits → saveDraft), whole in localStorage (synchronous; ≤500k chars) + {seq, tracks} in IndexedDB, every write stamped seq. An old build's overlay on load: added notes merged unless already there (track+start+pitch+length), removed ids NOT replayed (logged, notes kept), then moved aside to ff1roll-retired-edits-<key>@<ms> only after the merged draft reads back holding every one of its notes — never deleted. untitled-1 on the iPad: its overlay (if still there) folds on the first open with this build; a deletion Josh made after the last whole-copy write may reappear (delete it by hand). Not crash-safe: a local song over 500k chars (stub + IndexedDB; the in-flight edit can be lost — the app says so on the next open). Delete bars / closeGap branch can land on top of this.
## DONE 2026-10-02 22:20 — Delete bars (Edit ▾ + Ask delete_bars)
Josh in the terminal: "Is there a way to delete a bar? I wanna delete bar 8 from this song" … "we have Insert bars in the Edit [menu], it would be next to that".
DONE: `closeGap(T, len)` — the inverse of `openGapShift`, same relationship `deleteTime`/`insertTime` have — removes the time span [T, T+len) on every track (drums included): a note starting inside is deleted (soft-delete, same `eraseBatch` undo kind `deleteSelection` uses); one sustaining across T is clipped to stop there; one ending exactly at T stays put (no special case — same strict `>` as Insert bars' straddle rule); everything at/after T+len shifts earlier by len. Annotations never die (Learning mode): one anchored inside the deleted span moves to the cut point instead of being lost; a range straddling the cut shrinks by the overlap (one tick-mapper applied to both start and end). One deviation from openGapShift's own convention, on purpose: "has an end" is tested by `n.b2`, not `n.end` — `finalizeNotes` gives every point-type chord/section a synthetic one-bar `n.end` for the editor's row-stacking display only, and clamping that blindly (as openGapShift's own `n.end` check would) baked a fake partial-bar range into a plain chord the moment it got shifted; caught by a test, fixed by checking `n.b2` (the field `resolveNote` itself treats as "real range"). openGapShift is unchanged — same latent dormant quirk still sits there, out of scope, not touched. Edit ▾ → Delete bars…, right under Insert bars… (from bar — defaults to cursor's bar — + count, same small-sheet style); Ask tool `delete_bars({from_bar, count})` (askDeleteBars), same gate/validation shape as copy_bars. Wired into ASK_TOOLS/ASK_SONG_ONLY_TOOLS/askRunTool and the Ask system prompt (tool count now twelve). Reply: "bar 8 removed — everything after moved 1 bar earlier" (+ "; N annotations moved to bar 8" when any did). Icon: playlistRemove (Google Material Icons, outlined, Apache-2.0, same ICON table). Tests: delete bar 3 on a 3-track drum-included scratch song (inside-span notes gone on every track, a sustain clipped at the cut, one ending exactly at the cut untouched, later notes shift, an inside annotation moves to the cut, one after shifts, a straddling one shrinks, one ⟲ restores notes + annotations exactly), delete 2 bars, bad ranges/locked-capture refuse with nothing changed, hidden in the general chat. Help sheet + HELP.md + drift keyword "Delete bars" + NIGHT-ROLL.md updated. vm suite green (405/405, one pre-existing skip).

## QUEUED 2026-10-02 23:40 — help: step-by-step AI setup (Josh, Terminal #64)
HELP.md has only Settings → AI model (server URL, iPad needs https via Tailscale Serve). Add an "AI setup" help section: LM Studio (lms server start --cors / the CORS toggle, port 1234), Ollama (OLLAMA_ORIGINS), Tailscale Serve (https for the iPad, the /claude mount), the bridge (npm run bridge / node tools/claude-bridge.mjs --claude full --upstream lmstudio=http://localhost:1234, restart after reboot, --token). After the deploy-safeguards merge.
## DONE 2026-10-02 — three deploy safeguards so an install can never cost him work (Josh: "I'm really concerned now about doing work because every time there's a deployment I worry something bad is gonna happen" — the untitled-1 recovery above)
**1 — off-device backups on the Mac.** POST /v1/backup {key, doc, notes?, at} (bridge) writes `~/.night-roll-bridge/backups/<key with / → __>/<ISO time>.json`, skips a byte-identical write, keeps the newest 300 per song and never drops anything younger than 7 days past that; GET /v1/backups?key=… lists them, GET /v1/backups/<dir>/<file> reads one; body capped ~20 MB (413). App side: `scheduleBackupFlush()`/`flushBackupNow()` debounce 5 s off `saveDraft()`/`saveLocalNotes()`, gated on `editableSong()` (his own songs only) and `askCaps.bridge` (the bridge only — never leaves the device otherwise); also flushes on `visibilitychange` and from safeguard #2's first tick. Never blocks or throws into an edit — a failed POST only `logDebug`s. **2 — a Version before every install.** `deployBeforeInstall()`, on `deployWarn()`'s first tick of a cycle: if the open song's music/annotations differ from its newest Version (compared by `musicSig()`, not a raw-blob compare — a local/ draft's own `seq` stamp bumps on every save even unchanged), saves one labelled "Before update HH:MM" and flushes a backup. **3 — "Not now."** Tapping ✦ AI during the countdown opens an `appConfirm()` sheet (no native dialogs) — Install now / Not now. Not now POSTs /v1/deploy {hold:true}; the bridge's new `deployHold` blocks the new `--deploy-wait` CLI flag (polls GET /v1/status every 2 s; exits once the countdown's run out AND no hold is active, or after 60 min, or at once if unreachable) until released or 60 minutes pass; the button reads "✦ AI · ⏸" and the status line says the update is waiting. build-ipad.sh (night-roll-app) now runs `--deploy-in 20 && node tools/claude-bridge.mjs --deploy-wait` instead of a blind `sleep 20` before `devicectl install`. Tests: tests/bridge.test.mjs (backup write/list/read/skip/retention/413; hold blocks/releases --deploy-wait; deployHold in status — 10/10 green) and tests/night-roll.test.mjs ("deploy safeguard #1/#2/#3" — full suite 416/416, one pre-existing skip). Help sheet ("Update countdown" extended + new "Backups on your Mac") + HELP.md + drift keywords "Not now"/"Backups on your Mac" + NIGHT-ROLL.md "Deploy safeguards (2026-10-02)".

## DONE 2026-10-02 23:30 — AI setup help (Josh, Terminal #64): "AI setup, step by step" in the help (LM Studio CORS, Ollama OLLAMA_ORIGINS, Tailscale Serve for the iPad, the bridge + launchd + /claude mount + token)
## DONE 2026-10-02 23:35 — install countdown banner (Josh, Terminal #65: did not notice the countdown): gold top banner with Not now / Install now

## DONE 2026-10-02 23:55 — ruler taps no longer arm tiny cycles (Josh, Terminal #66): a ruler press must travel 24px (RULER_RANGE_SLOP) before it selects; under that it is a tap that places the cursor. PORT NOTE: lands after split 0b started — RESOLVED: 0b's cutover.mjs extracts from CURRENT index.html, so RULER_RANGE_SLOP is already present in src/app.js, no manual re-apply needed.

## DONE 2026-10-03 00:05 — edit toolbar reordered (Josh, Terminal #67): undo redo cut copy paste delete ⋯ (split now next to join inside ⋯), then Select/Pencil/Erase + Pencil options last. PORT NOTE: after split 0b started — RESOLVED: 0b's cutover.mjs extracts from CURRENT index.html, so the reordered toolbar markup is already present, no manual re-apply needed.

## DONE 2026-10-03 00:30 — track chips no longer cut off when the AI window is docked wide (Josh, Terminal #68): #trackrow.stacked puts the transport on the first row and the chips full-width below whenever they overflow beside it (fitTrackRow, ResizeObserver + updateTrackMore). PORT NOTE: lands after split 0b started — MOOT: reverted in 42bbd73 (iPad blinking loop) before 0b's re-run; src/app.js does not contain fitTrackRow. See the 2026-10-03 00:50 QUEUED redo below.

## 2026-10-03 00:05 — BUG (Josh via Ask): screen blinking nonstop on iPad
Josh: "That did not work and it is making the whole screen freak out, it is blinking and blinking." Seen on build 10/03/2026 00:01:03 (after 0692e13 track chips fix: chips move to a full-width row when the AI window is docked wide). Screenshot: ~/.night-roll-bridge/shots/2026-10-03T04-00-49-106Z.jpg shows AI panel docked Right, chips in the top bar. Suspect: chip-wrap layout flapping (wrap -> no longer overflows -> unwrap -> overflows again), a resize loop. Song is untitled-1; notes are intact in the screenshot.
- Josh follow-up (00:02): blinking is width-dependent. At the width in screenshot 2026-10-03T04-01-34-880Z.jpg it is "kind of OK"; at certain other widths/settings it is really bad. Fits the wrap/unwrap threshold loop: look at widths right at the chip-fit boundary (add hysteresis).

## DONE 2026-10-03 12:40 — redo track-chip row stacking WITHOUT flapping (fitTrackRow in src/app.js: row width vs trackRowNeed() = transport children + chips' scrollWidths, never the ▾ signal; 60px slack. Browser sweep 1400→600→1400 by 10px: one stack (850) and one unstack (920), 0 unstable widths; need identical stacked/unstacked (859). Smoke 8/8.) — was (0692e13 reverted in 42bbd73: the iPad blinked nonstop at some widths)
Design: stack decision depends only on the row WIDTH vs a threshold = transport natural width + all chips natural width + margin, measured once while unstacked and re-measured only when the track set or transport buttons change (never while stacked, never from the ▾ overflow signal). Hysteresis: stack below threshold, unstack above threshold + 60px. Verify in the browser at several widths (step the row width 700→1400 by 20px and assert at most one flip each way) BEFORE shipping. After split 0b lands (goes in src/).

## DONE 2026-10-03 01:00 — Select/Pencil/Erase on their own row (Josh, Terminal #69: "too annoying the way it moves"): #moderowbreak forces the wrap in #editrow; ⋯ opening no longer shifts them. PORT NOTE: markup only (index.html), survives the split cutover.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split step 16: index.html's CSS → css/app.css (docs/split-plan.md §4 step 16)
The one `<style>` block (1186 lines, 66,956 bytes) is css/app.css verbatim —
byte-identical, no `url()`/`@import` so nothing rebases — linked from `<head>`
where the block was (render-blocking, so no inline critical CSS kept).
index.html 2917 → 1733 lines. sw.js precaches it and routes css/ network-first
like src/ (SW_VERSION nr-v33); tools/package.mjs copies css/, exempts it from
the prose scan, fails if a linked stylesheet is missing; harness `appCss()`,
`appSource()` includes the CSS (5 night-roll tests grep it, unchanged);
pwa.test pins link + precache + route; package.test the byte-identical copy.
Docs: NIGHT-ROLL.md Module map intro, CLAUDE.md "No build step" rule, the
plan's Done note. npm test: night-roll 429/430 (1 skip), gestures 31, pwa 4,
package 3, modules 93; check.mjs clean except oldBpb; smoke 8/8 (3.6s), the
server log shows css/app.css 200. To eyeball after merge: first paint on
Pages (no flash — the sheet blocks render), iPad offline launch styled (the
precache entry; a stale nr-v32 cache drops on activate).

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 0b reproduced on current main (docs/split-plan.md)
0b was first built 2026-10-02 on worktree branch worktree-agent-ab7f470f088110a71
(commit 27139d29) against an older main; several main commits landed on top of
that base before it could ship (ruler-tap threshold, edit-toolbar reorder,
the track-chip stacking commit AND its revert 42bbd73, the moderowbreak
fix). Per the main session's instruction, that branch's index.html/src/app.js
hunks were NOT merged by hand — instead: brought over the non-script files
(tools/split/, src/edition.js, src/main.js, src/devtools.js,
src/package.json, sw.js, tools/package.mjs, the pwa/package/modules tests,
CLAUDE.md, docs/split-plan.md) via a path checkout from that branch; ported
the NIGHT-ROLL.md "Module map"/sw.js-caching/boot-watchdog doc additions and
the boot-watchdog `<script>` block in index.html's `<head>` by hand; then
re-ran `tools/split/cutover.mjs` against CURRENT main's index.html so
src/app.js contains today's code. Mid-task, origin/main moved twice more
(0692e139's chip-row stacking reverted in 42bbd73 — iPad blinking loop; then
11ee4d4b's #moderowbreak fix) — merged origin/main into this worktree branch
before each cutover re-run, so src/app.js does NOT contain
fitTrackRow/#trackrow.stacked and DOES contain #moderowbreak's markup. Q6
above is the one real app bug 0b's static scan found (not fixed, out of
scope for a verbatim move). Verified: npm test per-file — night-roll.test.mjs
417 (416 pass + 1 pre-existing env skip), gestures.test.mjs 17/17,
bridge.test.mjs 10/10, pwa.test.mjs 3/3, package.test.mjs 3/3 (boot-from-dist
included), modules.test.mjs 32/32 — all match the counts 0b itself reported.
`node tools/split/check.mjs` clean except the one pre-existing oldBpb finding
(Q6). `node tools/package.mjs --out /tmp/nr-dist-check2`: runtime modules 47,
matching 0b's own report. instruments.test.mjs/ps2-real.test.mjs "real rip"
failures are pre-existing missing-fixture gaps in /tmp/claude-501/rips
(unrelated to src/, not touched by this step).

FOLLOW-UP (same worktree branch, commit a04001e3): the main session caught
a real gap the above missed — app.js exports nothing on its own, so
devtools.js's window mirror had nothing to mirror, AND tests/e2e/
helpers.mjs never set window.__NR_EXPOSE, so every bare-name
page.evaluate() across tests/e2e/*.mjs (~150 call sites) would have thrown
ReferenceError the first time CI actually ran them in a browser — the vm
suite above can't see this, since it never loads app.js as a real
window-backed page. Fixed: cutover.mjs now appends a generated
`__nrExpose$` get/set accessor footer to app.js (same technique as tests/
harness.mjs's own per-module footer, different name so the two don't
collide when the vm harness loads app.js as a fixture); devtools.js mirrors
it onto window with both get AND set; every e2e entry point
(helpers.openApp + audio/folder/editor's own local setups) now sets
__NR_EXPOSE before navigating. Added tools/split/check-e2e-globals.mjs (node
-only, no browser) wired into modules.test.mjs, which statically proves
every bare identifier the specs reference resolves — ran `npm run
test:e2e:smoke` once locally (allowed per CLAUDE.md) to confirm against a
real headless browser: chromium, 8/8 passed. NOT pushed: main session still
needs to browser-verify (localhost + the packaged dist output) before
pushing and building for the iPad.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 1: every top-level let/var → S (docs/split-plan.md)
Worktree branch worktree-agent-a2852b81b994e0764, commit 25acd664, on top of
0b (above). `tools/split/promote-state.mjs --file src/app.js --state
src/state.js --all` promoted 257 top-level `let`/`var` names (plan estimated
~203; undercounted multi-declarator lines) into `export const S` in new
src/state.js — no imports, evaluates first, so every S field exists before
any app code runs (removes the boot-path TDZ class of bug for state by
construction; main session: retire the "boot-path TDZ check" memory note
per the plan — this builder doesn't touch memory files). index.html
modulepreload + sw.js APP_MODULES (bumped nr-v7) gained src/state.js;
devtools.js's exposeGlobals() now mirrors every S field onto window with
get+set (e2e `song = …` keeps working, now sets S.song); app.js's generated
`__nrExpose$` footer logic moved to shared tools/split/e2e-footer.mjs and is
regenerated via new tools/split/regen-e2e-footer.mjs after any change to
app.js's top-level names (it had gone stale post-promotion — check.mjs rule
1 caught it). Two real bugs surfaced and fixed in shared tooling (not
worked around): scope.mjs's freeIdentifiers + promote-state.mjs's own
collectUses both skipped a for-loop's own initializer expression (`for (let
ti = song.tracks.length - 1; …)` left `song` un-renamed — a real
`ReferenceError`, caught by the vm suite, not by check.mjs, since both tools
shared the blind spot); app.js was reset to HEAD and promote-state.mjs
re-run in full against the fix rather than hand-patching. One genuine
pre-existing name collision, not a tool bug: `applyChop(S, E)` and a block
in `finalizeNotes` used S/E as local chop-start/end tick names (predating
any state container) — renamed to cStart/cEnd (pure local rename, zero
behavior change; an AST sweep confirmed no other S/E collisions remain).
~7 test assertions that pattern-match literal JS source text (not behavior)
updated for the `S.` prefix; two modules.test.mjs assertions updated for
the new file (checkSrc count 4→5; rule-8's devtools-import regex widened
to any import style, since state.js is deliberately `import { S }`, not
`import * as`). Verified: night-roll.test.mjs 417 (416 pass + 1 pre-existing
env skip), gestures 17/17, modules 33/33, bridge 10/10, pwa 3/3, package
3/3, plus nsf/chip-worker/migrate-rollnotes spot checks all green.
`node tools/split/check.mjs` clean except the known pre-existing oldBpb
finding (Q6); `node tools/split/check-e2e-globals.mjs` clean. `node
tools/package.mjs --out /tmp/nr-dist-s1`: 47 runtime modules (matches 0b).
`npm run test:e2e:smoke` (allowed once locally): chromium 8/8 passed. Full
detail + deviations: docs/split-plan.md "Deviations (1)". NOT pushed: main
session still needs to browser-verify (localhost + packaged dist) before
pushing and building for the iPad — same as 0b, this is a pure refactor
with no user-facing change, so verification is "does the app still behave
identically," not a new feature to try.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 3: src/midi/parse.js + src/midi/write.js (docs/split-plan.md)
Worktree branch worktree-agent-a9454f25a407fa673, commit fa87502e, on top of
step 2 (d1a5bd40, already merged to main). `move.mjs --names
parseMidi,tickToSec,secToTick --to src/midi/parse.js` then `--names
writeMidi --to src/midi/write.js`, both over src/app.js — by NAME, not the
table's "midi parse"/"midi write" banner ranges (the "midi parse" banner's
section runs past these three declarations into unrelated grid/selection
code; writeMidi has no leading banner at all, just its own inline comment).
parse.js needed one import, `S` (tickToSec/secToTick read `S.playRate`) — a
same-layer (layer 0) import, allowed by rule 5. write.js is fully
self-contained, no imports. Neither function's body changed a byte:
checked by running `tools/dump_notes.mjs` against a scratch/ copy of
albums/starters/fur-elise.mid and diffing the output against the committed
.notes.txt — identical. `regen-e2e-footer.mjs --file src/app.js` re-run;
devtools.js gained `midiParse`/`midiWrite` namespace imports (GET-only,
same pattern as icons.js/controls.js); sw.js APP_MODULES gained both
files, SW_VERSION nr-v8 → nr-v9; index.html's modulepreload list gained
both, grouped with the other layer-0 modules ahead of app.js;
tests/modules.test.mjs's checkSrc fileCount assertion bumped 7 → 9.
NIGHT-ROLL.md's module map gained both entries; its Code map's now-stale
"midi parse → parseMidi + tempo maps" line was removed (moved up, per the
module map's own stated convention for exactly this situation).
No scope.mjs/move.mjs bugs surfaced this time (unlike every prior step) —
both functions are leaf code, so the free-identifier/hoisting edge cases
0b/1/2 found don't apply. One real finding, not a bug: `midiBase64`
(sitting right after writeMidi in app.js) stayed put — its own comment at
a call site says "any bytes — chunked btoa, not MIDI-specific," confirmed
by grep (SoundFont bytes, recorded-audio bytes, and MIDI bytes all go
through it) — moving it into midi/write.js would misfile a general utility
as MIDI-specific; left for a later step (platform/ or a small util module)
to claim. Verified: night-roll.test.mjs 417 (416 pass + 1 pre-existing env
skip), gestures 17/17, modules 33/33, controls 3/3, bridge 10/10, pwa 3/3,
package 3/3 (incl. the boot-from-dist test), nsf 20/20 (3 pre-existing
vault-only skips), chip-worker 31/31, migrate-rollnotes 9/9 — all green.
`node tools/split/check.mjs` clean except the known pre-existing oldBpb
finding (Q6); check-e2e-globals.mjs and check-controls.mjs clean. `node
tools/package.mjs --out /tmp/nr-dist-s3`: 47 runtime modules (unchanged
from step 2 — midi/ adds no new tools/-side runtime modules of its own).
`tools/at.mjs`, `tools/span.mjs` and `tools/dump_notes.mjs` re-verified
against real songs in albums/starters/ (never albums/compositions/).
`npm run test:e2e:smoke` (allowed once locally): chromium 8/8 passed. Full
detail + deviations: docs/split-plan.md "Deviations (3)". NOT pushed: main
session still needs to browser-verify (localhost + packaged dist) before
pushing and building for the iPad — same as every prior step, this is a
pure refactor with no user-facing change.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 4: src/theory/chords.js + src/theory/key.js (docs/split-plan.md)
Worktree branch worktree-agent-ab420f8b09566d0df, commit 40a73ba8, on top
of step 3 (fa87502e/db529279, already merged to main). `move.mjs --names
SHARP_SPELL,spellMemo,spellFor,spellPc,pitchName,CHORD_TEMPLATES,nameChord,
CHORD_FLAT,chordSym,NUM_DEG,MAJ_STEP,MIN_STEP,parseNumeral,
splitProgression,CHORD_BASES,CHORD_EXTS,chordQualParse,chordQualCompose,
parseChordSym,SF_MAJOR,LETTERS,LETTER_PC,keySpelling --to
src/theory/chords.js`, then `--names
TONIC_SPELL,FIFTHS_POS,MODE_FIFTHS,trueSf,keyNameFor,pearsonCorr,fileKeyAt,
checkMeterVsFile --to src/theory/key.js`, both over src/app.js — by NAME
(neither cluster sits under one banner; each is scattered across 2-3
sections hundreds of lines apart, interleaved with UI code that stays).

Two real findings (full reasoning: docs/split-plan.md "Deviations (4)"):
- `spellPc`'s implicit-`sf` default called `sfShownAt()` (the Learning/
  Normal mode gate), which stays in app.js until platform/mode.js's own
  step — moving `spellPc` as written would have made theory (layer 0)
  import app.js (layer 5), a check.mjs rule-5 violation. Fixed by
  resolving `sfShownAt(S.playCursor)` at the one call site that relied on
  the default (the roll ruler's pitch-class label) instead of inside
  `spellPc` — a one-line, value-identical change, not a byte-identical
  move, for that one function only. `spellFor`/`keySpelling`/
  `SHARP_SPELL`/`spellMemo`/`SF_MAJOR`/`LETTERS`/`LETTER_PC` moved too
  (unlisted by the plan, load-bearing: `spellPc` calls `spellFor` on
  every non-null `sf`, not just the default branch).
- `estimateKey` and `checkKeyVsFile` — the plan's two biggest named
  targets — did NOT move: both reach into model-layer helpers not split
  out of app.js yet (`trackIsDrums` via `keyEstimateSig`; `barTicks`).
  Moving them would be a rule-5 violation a verbatim move can't fix
  without misfiling a model helper into theory or rewriting the
  functions. Both stay exactly where they were, bare-name reachable;
  every Learning-mode gating spy test still passes unchanged. Flagged as
  the QUEUED split note below for whichever later step moves trackIsDrums/barTicks.

`regen-e2e-footer.mjs --file src/app.js` re-run; devtools.js gained
`theoryChords`/`theoryKey` namespace imports (GET-only); sw.js
APP_MODULES gained both files, SW_VERSION nr-v9 → nr-v10; index.html's
modulepreload list gained both, grouped with the other layer-0 modules;
tests/modules.test.mjs's checkSrc fileCount assertion bumped 9 → 11.
NIGHT-ROLL.md's module map gained both entries.

Verified: night-roll.test.mjs 417 (416 pass + 1 pre-existing env skip),
gestures 17/17, modules 33/33, controls 3/3, bridge 10/10, pwa 3/3,
package 3/3, nsf 20/20 (3 pre-existing vault-only skips), chip-worker
31/31, migrate-rollnotes 9/9 — all green. `node tools/split/check.mjs`
clean except the known pre-existing oldBpb finding (Q6);
check-e2e-globals.mjs and check-controls.mjs clean. `node
tools/package.mjs --out /tmp/nr-dist-s4`: 47 runtime modules (unchanged —
theory/ adds no tools/-side runtime module of its own). `tools/at.mjs`,
`tools/pitch-census.mjs`, `tools/annotations.mjs`,
`tools/loop-targets.mjs` and `tools/dump_notes.mjs` re-verified against
real songs in albums/starters/ (never albums/compositions/) —
`dump_notes.mjs`'s output on a scratch copy of fur-elise.mid is
byte-identical to the committed .notes.txt. `npm run test:e2e:smoke`
(allowed once locally): chromium 8/8 passed. NOT pushed: main session
still needs to browser-verify (localhost + packaged dist) before pushing
and building for the iPad — same as every prior step, this is a pure
refactor with no user-facing change.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 5: src/model/{catalog,grid,edits,rollnotes}.js (docs/split-plan.md)
Moved, each via `move.mjs --names` over src/app.js (one more invocation into
the existing src/theory/key.js):
- `model/rollnotes.js`: `barTicks`, `applyChop`, `notesBase`, `baseName`,
  `notesStoreKey`, `ROLLNOTES_FORMAT`/`ROLLNOTES_MAX_VERSION`/
  `ROLLNOTES_LOCK_MSG`, `parseRollnotes`/`jsonToRawNote`/
  `parseRollnotesJSON`/`deriveNoteTypes`, `noteToJSON`/`trackDirText`/
  `audioDirText`, `resolveNote`, `dedupedNotesWithIndex`,
  `serializeNotesList`/`serializeRollnotes`/`serializeRollnotesStamped`.
- `model/grid.js`: `pencilTicks`, `isTripletDur`, `songHas32nds`,
  `moveSnapTicks`, `gridAnchorTick`, `snapTickAbs`, `pencilCellAt`,
  `gridCellStart`, `effTs`, `beatsPerBarEff`, `beatTicks`,
  `beatsPerBarDisp`, `secDepthCap`, `trackIsDrums`.
- `model/edits.js`: `editsKey`, `isLocalDraft`, `overlayNoteSig`,
  `updateClearBtn` — the safe quarter of the edits store; see below.
- `model/catalog.js`: `groupOf`, `catalogHas`, `publishedPaths`,
  `folderOf`, `albumFolders`, `segTitle`, `folderTitle`, `titleCaseSlug`,
  `FOLDER_NAMES` — the "album/group lookups" half of the plan's
  `model/catalog.js` line; see below for `initCatalog`.
- `theory/key.js` (not listed by step 5's table, but the right home):
  `keyNameToSf` + `MODE_OFFSET`/`LETTER_SF`/`MODE_SF_OFFSET` — pulled out
  of `deriveNoteTypes`'s `key:`-directive parser because it's pure theory
  (the inverse of the already-there `keyNameFor`), not annotation-model
  logic.

Did NOT move (every one hits a real rule-5 violation — a layer-2 `model/`
file importing a not-yet-split piece of app.js, still layer 5
LEGACY_CONTAINER today): `initCatalog` (needs `folderOnly`/`songsURL`/
`folderScanAlbums` — platform/, step 6 — and `albumMetaFor` — audio/chip.js,
step 8); `finalizeNotes` (needs a dozen render/audio/UI functions across
steps 7/8/9/11); and, from the edits store, `loadEdits`/`saveEdits`/
`foldOldOverlay`/`retireOldOverlay`/`updateEditBtnVis` (the actual
2026-10-02-regression code — needs `isComposition`/`scheduleAnalysisRecompute`/
`saveDraft`/`computeSongEnd`/`updateSongMeta`/`draftRead`/`updateChipBtn`/
`editableSong`/`ownFolderPath`/`originOf`/`LINK_SONGS` — provenance/audio/
versions/gen, steps 6/8/9/10). Per this task's SAFETY instruction, the
edits-store SAFETY functions were checked individually rather than forced
across a layer boundary as a block; none of their bodies changed a byte,
and they're still bare-name reachable from app.js, so every "local song: …"
regression test (tests/night-roll.test.mjs, the exact 2026-10-02 coverage)
passes unchanged. Full reasoning + the rollnotes.js/grid.js forward-reference
ordering fix (a hand-corrected import specifier, not a logic change) in
docs/split-plan.md "Deviations (5)".

`regen-e2e-footer.mjs --file src/app.js` re-run (needed — without it, rule 2
flagged 41 "assignment to imported binding" violations from the stale
footer). devtools.js gained `modelCatalog`/`modelGrid`/`modelEdits`/
`modelRollnotes` namespace imports; sw.js APP_MODULES gained all four files,
SW_VERSION nr-v10 → nr-v11; index.html's modulepreload list gained all four;
tests/modules.test.mjs's checkSrc fileCount assertion bumped 11 → 15.
NIGHT-ROLL.md's module map gained all five entries (four model/ files +
theory/key.js's keyNameToSf addendum).

Verified: night-roll.test.mjs 417 (416 pass + 1 pre-existing env skip),
gestures 17/17, modules 33/33, controls 3/3, bridge 10/10, pwa 3/3,
package 3/3, nsf 20/20 (3 pre-existing vault-only skips), chip-worker
31/31, migrate-rollnotes 9/9 — all green, all unchanged counts.
`node tools/split/check.mjs` clean except the known pre-existing oldBpb
finding (Q6); check-e2e-globals.mjs and check-controls.mjs clean. `node
tools/package.mjs --out /tmp/nr-dist-s5`: 47 runtime modules (unchanged —
model/ adds no tools/-side runtime module of its own). `tools/at.mjs`,
`tools/span.mjs`, `tools/annotations.mjs`, `tools/loop-targets.mjs` and
`tools/dump_notes.mjs` re-verified against albums/starters/fur-elise.mid
(never albums/compositions/) — `dump_notes.mjs`'s output on a scratch copy
is byte-identical to the committed .notes.txt. `npm run test:e2e:smoke`
(allowed once locally): chromium 8/8 passed. NOT pushed: main session still
needs to browser-verify (localhost + packaged dist) before pushing and
building for the iPad — same as every prior step, this is a pure refactor
with no user-facing change.

## RESOLVED 2026-10-03 (step 9) — split: estimateKey/checkKeyVsFile moved to src/model/song.js, not src/theory/key.js
Was: "estimateKey/checkKeyVsFile cannot move to src/theory/key.js, ever, as currently written" — correctly structural (theory/ is layer 0, trackIsDrums/barTicks are genuinely layer 2, no model/ file holding them ever helps). The real fix named here (the second of the two options: "move to a model/gen-layer module instead of theory/key.js") is what step 9 did: `estimateKey`/`checkKeyVsFile` (+ `keyEstimateSig`/`tonicPcFromName`/`KS_MAJOR_PROFILE`/`KS_MINOR_PROFILE`) landed in `src/model/song.js` (new this step), which is layer 2 and can legally import `trackIsDrums` (model/grid.js)/`barTicks` (model/rollnotes.js) same-layer, plus `pearsonCorr`/`keyNameFor`/`fileKeyAt`/`TONIC_SPELL`/`SF_MAJOR` (theory/, layer 0) downward. No dependency-injection rewrite needed — the plain move.mjs move worked once the DESTINATION changed. See docs/split-plan.md "Deviations (9)".

## RESOLVED 2026-10-03 (step 9) — split: initCatalog + folderScanAlbums both landed in src/model/catalog.js
Was: "finish moving initCatalog, finalizeNotes, and the edits-store SAFETY functions once their blocking dependencies land." Splitting the three leftovers apart by what actually happened:
- `initCatalog` — RESOLVED. The step-8 CORRECTED note assumed `albumMetaFor` living in `audio/chip.js` (layer 3) was permanent; it wasn't — step 9 relocated `albumMetaCache`/`albumMetaFor` OUT of chip.js and into the new `model/provenance.js` (layer 2), a correction chip.js's OWN `isCaptureKey`/`chipSource` situation needed anyway (below). That made `albumMetaFor` same-layer for `model/catalog.js`, and `initCatalog` moved clean, by name, verbatim.
- `folderScanAlbums` — ALSO RESOLVED, same move, and worth noting explicitly: this function was never actually in step 6's `platform/folder.js` despite some Module-map prose once implying it was (now corrected in NIGHT-ROLL.md) — step 6's own Deviations correctly listed it as blocked, by `albumTitleFor` (then still app.js). `albumTitleFor` landed in `model/provenance.js` this step too, which cleared it — but into `model/catalog.js` (alongside `initCatalog`), NOT `platform/folder.js` (its step-6-table destination): platform is layer 1, and `albumTitleFor` is layer 2, so landing it in platform now would be a permanent upward-import deadlock, the identical mistake `estimateKey`/`theory/key.js` made in steps 4-5. catalog.js was the only legal home once `albumTitleFor` moved to provenance.js.
- `finalizeNotes` (→ src/model/rollnotes.js) — STILL BLOCKED, re-checked this step: of its dozen-ish call targets, `bakesTempo` is now clear (model/provenance.js, step 9), but `renderTrackbar` (ui/trackbar.js, step 14), `updateTrackGains`/`sfPreloadForSong`/`gamePreloadForSong` (audio/, step 7, still blocked), `fitView` (render/roll.js, step 11), `applyAudioDirs`/`updateSongMeta`/`keyLabelState` (none yet split) remain. Re-check after steps 10/11/14.
- `loadEdits`/`saveEdits`/`foldOldOverlay`/`retireOldOverlay`/`updateEditBtnVis` (→ src/model/edits.js) — STILL BLOCKED, re-checked this step per its own instruction: `isComposition`/`ownFolderPath`/`isCaptureKey`/`editableSong`/`originOf` are now ALL real, legal imports (model/provenance.js + model/song.js, step 9) — real progress — but `saveEdits` still needs `scheduleAnalysisRecompute` (gen/analysis.js, step 10) and `saveDraft`/`computeSongEnd`/`updateSongMeta` (confirmed BLOCKED themselves, not step 9's to clear — see the versions.js/song.js QUEUED entries); `updateEditBtnVis` still needs `updateChipBtn` (blocked, step 8). All five stay bit-for-bit in app.js. Re-check after step 10 (gen/analysis.js) and whichever step lands `draw`/`buildScoreModel`/`finalizeNotes` for `computeSongEnd`'s sake. **CORRECTED 2026-10-03 (step 10): this assumption was wrong.** `gen/analysis.js` landed (`harmonyTrackIndices`/`computeAnalysisLayer` only), but `scheduleAnalysisRecompute` itself did NOT move with it — it calls `finalizeNotes()` (model/rollnotes.js's own still-blocked headline, step 5) and `draw()` (render, step 11), neither of which step 10 could clear. `saveEdits` still cannot import `scheduleAnalysisRecompute` from anywhere lower than app.js. Re-check again once `finalizeNotes` and `draw` land (steps 5's own leftover + step 11) — see docs/split-plan.md "Deviations (10)".

**CORRECTED 2026-10-04 (step 11): the premise of "once `draw`/`fitView` land" was wrong — they never will, structurally.** `render/roll.js` now exists, but `draw`/`drawFull`/`resize`/`playbackFrame`/`updateCanvasA11y` did NOT move into it: `resize`/`drawFull` call `updateTrackMore`/`updateEditButtons` (`ui/trackbar.js`/`ui/note-editor.js`, step 14, layer 4 — strictly ABOVE render's layer 3, forever); `draw`/`playbackFrame` inherit the block from `drawFull`. `fitView` is a DIFFERENT function (view-fit-to-content, still in app.js, not checked by this step — likely has its own render/UI calls) — not resolved either way by this step. So `finalizeNotes`'s `draw`/`fitView` blockers, and `scheduleAnalysisRecompute`'s `draw()` blocker (→ `saveEdits`'s transitive block), are now understood to be PERMANENT, not "re-check after step 11." Both `finalizeNotes` and `saveEdits` can only ever move once `draw`/`fitView`/`updateTrackMore`/`updateEditButtons` themselves stop needing layer-4 UI — i.e. not until the specific UI calls inside THEM are themselves restructured, which no verbatim move can do. See docs/split-plan.md "Deviations (11)" and NIGHT-ROLL.md's `render/roll.js` entry.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 6: src/platform/{base,mode,storage,folder,native}.js (docs/split-plan.md)
Moved, five `move.mjs --names` invocations over src/app.js (base → mode →
native → storage → folder, so each later file could resolve a cross-import
against an already-moved earlier one):
- `platform/base.js`: `setDocTitle`, `linkSongsBase`/`LINK_SONGS`/
  `linkRepoLabel`, `rememberLastSong`, `RECENT_KEY`/`RECENT_MAX`/
  `recentSongs`/`saveRecentSongsRaw`/`clearRecentSongs`, `MOVED_DIRS`/
  `movedPath`, `songPathFromURL`/`songShareURL`/`albumParamFromURL`,
  `PERF_FLAGS`/`PERF_NOSCENE`.
- `platform/mode.js`: `hasExistingNightRollPrefs`, `appMode`, `setAppMode`,
  `analysisAvailable`.
- `platform/native.js`: `nativeCall`, `audioSessionType`.
- `platform/storage.js`: `cfg`/`saveCfg`/`baseJoin`, `draftStoreKey`,
  `readBase`/`songsURL`/`analysisURL`/`nsfURL`/`repoName`/`repoApi`/
  `apiError`, every self-contained IDB leaf (`idbOpen`, `idbAudioPut`/
  `Get`/`Delete`/`Move`, `idbSf2Put`/`Get`, `idbNsfPut`/`idbNsfPutNow`/
  `idbNsfGet`, `idbFsGet`/`idbFsPut`, `idbDraftOp`/`idbDraftGet`/
  `idbDraftDelete`/`idbDraftMove`), `IMP_DIR`/`CONSOLE_OF`, `draftInIdb`.
- `platform/folder.js`: `fsRoot`, `folderActive`, `folderOnly`,
  `folderSupported`, `nativeFs`, `nativeDirHandle`, `folderPermission`,
  `fsDirFor`, `folderRead`/`folderWrite`/`folderDelete`, `fsReadJSON`,
  `restoreFolder`, `readData`, `bundledPath`.

Did NOT move — this step's SAFETY instruction named several functions
explicitly and each was checked individually, not swept as a block:
`saveEdits`/`loadEdits`/`saveDraft`/`draftWrite`/`draftRead`/
`localDraftWrite`/`localDraftTracks`/`idbDraftPut` (all reach `logErr`
and/or `isComposition`/`editableSong`/`retireOldOverlay`/`setInfo`/
`updateSongBtn`/`updateSyncBtn`/`filesMirrorSoon` — UI/model, not yet
split); `scheduleBackupFlush`/`flushBackupNow` (need `editableSong`/
`draftDoc`/`serializeRollnotes`/`aiUrl`/`aiHeaders`/`logDebug`); `sfShownAt`
(calls `estimateKey`, still LEGACY_CONTAINER per step 4's unresolved
finding); `nativeOpenUrl`/`nativeOpenHook` (call `setInfo`/`stop`/
`closeFileMenus`/`openPickedFiles` — import-hub/UI, not bridge code
despite the name). `platform/sw.js` was not created at all: the
service-worker-registration code is a single top-level `if`/`else`
statement (not a `--names`-selectable declaration) whose body calls
`setInfo` — blocked even if wrapped via `--range`. Full reasoning for
every one of these in docs/split-plan.md "Deviations (6)" and
NIGHT-ROLL.md's module-map entries.

`regen-e2e-footer.mjs --file src/app.js` re-run; check.mjs clean except
the pre-existing `oldBpb` finding (Q6); check-e2e-globals.mjs and
check-controls.mjs clean (26 controls, unchanged). devtools.js gained
`platformBase`/`platformMode`/`platformStorage`/`platformFolder`/
`platformNative` namespace imports; sw.js APP_MODULES gained all five
files, SW_VERSION nr-v11 → nr-v12; index.html's modulepreload list gained
all five; tests/modules.test.mjs's checkSrc fileCount assertion bumped
15 → 20. NIGHT-ROLL.md's module map gained all five entries plus a
one-line fix to the model/edits.js entry (LINK_SONGS no longer "still in
app.js").

Verified: night-roll.test.mjs 417 (416 pass + 1 pre-existing env skip —
every "local song: …" SAFETY-regression test passes unchanged, since none
of that code moved a byte), gestures 17/17, modules 33/33, controls 3/3,
bridge 10/10, pwa 3/3, package 3/3, nsf 20/23 (3 pre-existing vault-only
skips), chip-worker 31/31, migrate-rollnotes 9/9 — all green. A full `npm
test` run also surfaced 4 pre-existing tests/ps2-real.test.mjs failures
(Zophar rip fixtures absent/incomplete in this environment) — confirmed
unrelated to this step by grep (no moved name is referenced by tools/ps2/
or that test file). `node tools/split/check.mjs` clean except oldBpb;
`node tools/package.mjs --out /tmp/nr-dist-s6`: 47 runtime modules
(unchanged — platform/ adds no tools/-side runtime module of its own).
`tools/at.mjs`, `tools/span.mjs`, `tools/annotations.mjs` re-verified
against albums/starters/fur-elise.mid (never albums/compositions/);
`tools/dump_notes.mjs` re-run over the whole albums/starters/ directory —
`git diff --stat` against the four committed .notes.txt files came back
empty. `npm run test:e2e:smoke` (allowed once locally): chromium 8/8
passed. NOT pushed: main session still needs to browser-verify (Settings →
data location, open a local-folder song) before pushing and building for
the iPad.

## QUEUED 2026-10-03 — split: platform/sw.js, nativeOpenUrl/nativeOpenHook, sfShownAt, and the whole draft/edit-persistence SAFETY path still can't move (terminal-only, not a question for Josh)
Leftovers from step 6 (docs/split-plan.md "Deviations (6)"), re-checked against step 9's new model/ files:
- `platform/sw.js`: the service-worker-registration `if`/`else` (src/app.js,
  originally index.html ~line 23103) needs `setInfo` (ui/chrome.js, step
  14) in its `else` branch. Unaffected by step 9. Revisit once step 14
  lands; it's one statement, not a cluster, so this should be a single
  `--range` once `setInfo` is importable.
- `nativeOpenUrl`/`nativeOpenHook` (→ platform/native.js): still need
  `setInfo`/`stop`/`closeFileMenus` (ui/chrome.js + audio/transport.js,
  steps 7/14). CORRECTED: `openPickedFiles` did NOT land in `import/hub.js`
  as this entry once assumed it would — step 9 moved only
  `importHubLabel` there; `openPickedFiles` itself stays in app.js, blocked
  by `CHIPS`/`setInfo`/`createComposition`, none yet split (see NIGHT-
  ROLL.md's `import/hub.js` entry). `nativeOpenUrl` is blocked by this too
  now, same as before, just a more specific reason.
- `sfShownAt` (→ platform/mode.js) — CORRECTED, now understood PERMANENT,
  not pending `estimateKey`'s move: `estimateKey` moved in step 9, but to
  `model/song.js` (layer 2), not out of the split entirely — `platform/`
  is layer 1, and layer 1 can never import layer 2, forever, the identical
  shape as `estimateKey`'s own old `theory/key.js` deadlock. `sfShownAt`
  can only ever reach platform/mode.js if REWRITTEN to take `estimateKey`
  as a parameter (a logic change, out of scope for a move step) or if
  `sfShownAt` itself moves to a layer-≥2 module instead — a design
  question, flag to whoever next considers it rather than retrying the move.
- `saveEdits`/`loadEdits`/`saveDraft`/`draftWrite`/`draftRead`/
  `localDraftWrite`/`localDraftTracks`/`idbDraftPut` (→ platform/storage.js)
  — RE-CHECKED 2026-10-03 (step 9): `isComposition`/`editableSong` (both
  named here before step 9 as the "model/song.js, step 9" half of the
  blocker list) are now real, legal imports from model/provenance.js and
  model/song.js — but `logErr` (ui/chrome.js, step 14) still blocks
  `idbDraftPut`/`localDraftWrite`/`localDraftTracks` directly, and
  `saveDraft` still needs `isComposition`'s SIBLINGS `editableSong`
  (clear)/`retireOldOverlay` (model/edits.js, still blocked)/`setInfo`/
  `updateSongBtn`/`updateSyncBtn`/`filesMirrorSoon` (none yet split). All
  eight stay bit-for-bit in app.js. Re-check again after step 14 (`logErr`,
  `setInfo`) — this is now the ONLY remaining blocker class for this group.
- `scheduleBackupFlush`/`flushBackupNow` (→ platform/storage.js) —
  RE-CHECKED 2026-10-03 (step 9): `editableSong`/`draftDoc` are now real
  (model/song.js/model/versions.js) — two of four blockers cleared — but
  `serializeRollnotes` (model/rollnotes.js, layer 2 — permanently out of
  reach for platform, layer 1, confirmed unchanged) and `aiUrl`/`aiHeaders`
  (now landed in `ask/backend.js`, step 13 — still layer 4, still above
  platform's layer 1) remain. Still permanently blocked by
  `serializeRollnotes` alone regardless of step 13 landing — flag this
  specifically if a future step reconsiders it (the same "rewrite to
  inject the dependency, or move the function to a higher layer" choice
  as `sfShownAt` above). `flushBackupNow`/`scheduleBackupFlush`
  themselves also still did NOT move in step 13 (re-checked, step 13's
  own task) — both call `logDebug` directly, a second, independent
  blocker from `serializeRollnotes`.

## DONE 2026-10-03 13:30 — pan past the song end (Josh, Terminal #70: "push the song left so I can see like 10 empty bars"): clampView lets a drag scroll to PAN_TAIL_BARS=16 empty bars past the last bar; zoom-out fit unchanged

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 7: src/audio/{engine,voices,transport}.js + the ?perf profiler fix (docs/split-plan.md)
Moved, byte-identical (AST-diffed, not just eyeballed): `audio/engine.js`
(AudioContext lifecycle's pure half — warmContext/clockAlive/
clockProbeText/gestureActive/openMaster/trackGain/trackVol/trackPan/
trackAudible/updateTrackGains/dutyWave/makeOsc/pluckBuffer/pieceState/
pieceAudible/drumNoise*/drumHit), `audio/voices.js` (voice
identification — voiceType/trackVoice/SF-voice tables/game-voice id
parsers/playSynthVoice), `audio/transport.js` (currentLoop/audioStopSrcs/
album math leaves + constants). Tests/checks/package/smoke all green,
unchanged counts from pre-step-7. Also fixed: the `?perf=1` self-profiler's
`wrap()` → `prof()` (NIGHT-ROLL.md "Perf HUD" + "Module map"; prof() lives
in state.js, not platform/base.js, for a layer reason — see there).
Terminal session: review, browser-check (play a synth/SF2/game-voice song,
tap a note preview), merge, push, build.

## QUEUED 2026-10-03 — split: scheduleNote/previewNote still can't move to src/audio/voices.js; play/stop/play-gate/album still can't move to src/audio/transport.js (terminal-only, not a question for Josh)
Leftovers from step 7 (docs/split-plan.md "Deviations (7)"):
- `scheduleNote`/`previewNote` (→ audio/voices.js) — CORRECTED 2026-10-03
  (step 8): the `chip`/`chipActive`/`chipHas`/`chipPreviewBuffer`/
  `chipNoteSlice` blocker DID clear exactly as this note predicted (all
  landed in audio/chip.js/audio/chip-stream.js) — but a re-check surfaced
  a SECOND, independent blocker this note hadn't named: `scheduleNote`'s
  `n._clip` branch calls `scheduleClip` (audio/clips.js, step 8), which
  itself stays in app.js (blocked by `stretchEnsure` → one `draw()` call —
  see the audio/clips.js QUEUED entry below). `previewNote` falls through
  to `scheduleNote`, so it inherits the same block. Retry
  `move.mjs --names scheduleNote,previewNote --to audio/voices.js` once
  `scheduleClip` itself is importable (i.e. once `draw()` moves, step 11,
  or `stretchEnsure` otherwise clears) — same layer (3), so this becomes a
  legal import then, no further change needed to either function. See
  docs/split-plan.md "Deviations (8)". **CORRECTED 2026-10-04 (step 11):
  `draw()` did NOT move — it is now understood to be PERMANENTLY stuck in
  app.js (it calls `drawFull`, which calls `updateTrackMore`/
  `updateEditButtons`, `ui/trackbar.js`/`ui/note-editor.js` content, step
  14, layer 4 — strictly above audio's/render's own layer 3, forever).
  `stretchEnsure` therefore stays blocked by this call regardless of which
  layer-3 file it lives in; `scheduleClip`/`scheduleNote`/`previewNote`
  inherit the same permanent block. The "or `stretchEnsure` otherwise
  clears" branch is the only remaining path — see the audio/clips.js
  QUEUED entry below, also corrected. See docs/split-plan.md
  "Deviations (11)".
- `play`/`stop`/the whole play-gate (`playGate`/`playGateKick`/
  `playGateTick`/`playGateActive`/`playGateWait`)/album orchestration
  (`albumStart`/`albumPlayIdx`/`albumNext`/`albumPrev`/`albumAdvance`/
  `albumLeave`/`albumStrip`/`albumClear`/`armAlbumLink`/`albumPos`) (→
  audio/transport.js) — UPDATE 2026-10-03 (step 8): `chip.*` (audio/chip.js
  + audio/chip-stream.js), clip scheduling (`clipLen`, audio/clips.js),
  and `met.*` (audio/metronome.js) are all real exports now, so THAT
  specific clause of this note has cleared. UPDATE 2026-10-03 (step 9):
  `albumEffectiveOrder` also cleared (`model/album-order.js`, layer 2 —
  legal downward import for audio/, layer 3) — but `loadSong` itself is
  still bare in app.js (blocked by `play`/`setInfo`/`fitView`/
  `renderTrackbar`/`buildScoreModel`/`draw`/ask-panel calls, see NIGHT-
  ROLL.md's `model/song.js` entry), so importing it remains illegal
  regardless. Still blocked by `document.getElementById`/`setControl`/
  `setPlayBtn`/`setInfo`/UI-chrome calls (ui/chrome.js, step 14) and
  `loadSong`/`S.CATALOG`. This remains the single most entangled cluster
  the split has found so far; likely needs steps 11 AND 14 to land (step 9
  is now done and only partially helped) before a clean move is possible.
  Re-check incrementally after each.
- The second `?perf=1` instrumentation wrapper (the "mark the timeline on
  an edit" pass over `saveEdits`/`selEditApply`/`insertTime`, same guarded
  block as the now-fixed `wrap()`) is STILL silently broken — same
  `globalThis[name]` disease, different mechanism (pushes an EDIT marker,
  not a timing sample), out of this step's "replace wrap() with prof()"
  scope. Needs its own small `profMark(name, fn)`-shaped fix (or folding
  into `prof()` as an optional second callback) whenever someone next
  touches this HUD.

## QUEUED 2026-10-03 — split: ensureAudio/resumeAudio/rebuildAudio cannot move to src/audio/engine.js, ever, as currently written (terminal-only, not a question for Josh)
Leftover from step 7 (docs/split-plan.md "Deviations (7)") — correcting
the plan's own step-7 line ("ensureAudio, resumeAudio... clockAlive,
rebuildAudio, warmContext, master gain" as engine.js's contents): three of
those six named functions are PERMANENTLY blocked, the same way
`estimateKey`/`checkKeyVsFile` are permanently blocked from
theory/key.js (open-items.md's existing QUEUED entry above) — not a "once
some other step lands" situation. `ensureAudio`'s `onstatechange`,
`resumeAudio`'s dead-clock-recovery path, and `rebuildAudio`'s own log
line all call `logDebug`/`logErr`/`setInfo`, which resolve to `errChip()`
(`document.getElementById`/`askSeenMax()`) — UI-chrome, layer 4, and
logging/status reporting will never be a layer-≤3 concern in this app's
own layer table (the same reasoning `scheduleBackupFlush`'s entry above
gives for `serializeRollnotes`). If this is ever reconsidered, the only
way around it — short of a real architecture change (an event/callback
the UI layer subscribes to, instead of audio code calling into logging
directly) — is out of scope for a verbatim-move split step; this is a
design question, not a sequencing one, so flag it to Josh specifically
(not silently retried) if a future step proposes touching it.

RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 1): the architecture
change this entry asked for — an upcall port, not an event/callback bus —
landed as `src/hooks.js` (layer 0, one forwarder per name: `setInfo`,
`logErr`, `logDebug`, plus `appConfirm`/`updateJobsBtn`) + `src/wire.js`'s
`installHooks()`. `ensureAudio`/`resumeAudio`/`rebuildAudio` themselves
have NOT moved yet (that's step 2) — this entry's blocker is dissolved,
not yet acted on; step 2 moves them (NIGHT-ROLL.md "Module map", `hooks.js`
entry).

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 8: src/audio/{chip,chip-stream,clips,metronome,bounce}.js (docs/split-plan.md)
Moved, six `move.mjs --names` invocations over src/app.js (`playSec` into
the EXISTING audio/transport.js first — step 7's file, unlisted by any
step's table but needed by both chip-stream.js's `chipStreamPump` and
metronome.js's `metPumpFollow` — then the five new files): `audio/chip.js`
(29 names: `chip`/`chipTrackNo`/`albumMetaCache`/`albumMetaFor`/
`ghHeaders`/`vaultFetch`/`chipAlbumHasSource`/the memory-budget math/
`chipRenderStreamed`/`chipWorkerAvailable`/the preview cache +
`chipPreviewBuffer`/the live-playback surface), `audio/chip-stream.js` (23
names: the on/off/auto switch, every stream constant, the tape-time
segment math, the worker-reply handlers, the cache/pin/evict bookkeeping,
`chipNoteSlice`, the pump), `audio/clips.js` (26 names: the file/peak
cache, the decode path, the tempo-from-a-take math, `audioReady`, the
WSOLA algorithm + worker plumbing), `audio/metronome.js` (12 names: `met`
+ its persistence, `metBuildCells`/`metClick`/follow-mode math/
`metPump`/`ensureMetGain`/`metHalt`/`applyMetMode`), `audio/bounce.js` (4
names: `wavEncode`/`audioBufferToWav`/`midiBase64`/`deliverAudioFile`).
Zero unresolved free identifiers from any invocation.

Three real findings, each a permanent structural block (not "not yet
split"), full writeups in docs/split-plan.md "Deviations (8)" and
NIGHT-ROLL.md's module-map entries:
- **`CHIPS`** (the per-console-kind table) can never move to audio/chip.js
  as currently written — ONE guarded `logErr` call inside
  `CHIPS.usf.capture`'s diagnostic blocks the whole table, and with it
  `chipEstimateTracks`/`chipRender`/`chipPublish`/`chipRenderInWorker`/
  `chipCleanupAfterFailure` (chip.js) and `chipStreamOpenWorker`/
  `chipStreamOpen`/`chipRenderAuto` (chip-stream.js) — the actual render
  entry points this step's name promises. Splitting the table by hand
  (render fields vs. import fields) would be a structural edit, not a
  verbatim move. Needs either `logErr` to become injectable/removable, or
  a deliberate two-table split, whenever someone next considers this —
  not a silent retry.
  RESOLVED 2026-10-04 (docs/split-phase2-plan.md step 1): `logErr` (plus
  `logDebug`/`setInfo`) became an injectable upcall port exactly as asked
  — `src/hooks.js`, forwarding through `S.hooks`, installed by
  `src/wire.js`. `CHIPS`'s own `typeof logErr === "function"` guard is
  untouched (still byte-identical) and now resolves to the port — no
  two-table split needed. `CHIPS`/`chipRender`/`chipSource`/etc. have NOT
  moved yet (step 2's job); this entry's blocker is gone, not yet acted on.
- **`isCaptureKey`** was checked and deliberately NOT moved into
  audio/chip.js even though doing so would have unblocked `chipSource`
  today — its other caller, `ownFolderPath`, is slated for
  model/provenance.js (layer 2, step 9), and layer 2 can never import
  layer 3. Moving it would have traded today's `chipSource` blocker for a
  permanent step-9 deadlock, the same mistake `estimateKey`/`theory/key.js`
  made in steps 4-5. RESOLVED 2026-10-03 (step 9): `isCaptureKey`/
  `ownFolderPath` both landed in `model/provenance.js` exactly as predicted
  here, and `audio/chip.js` (layer 3) can now legally import `isCaptureKey`
  (layer 2) downward. `chipSource` ITSELF still did NOT move, though —
  clearing this blocker surfaced a second, independent one this entry
  never named: `chipSource` → `chipVaultFile` → `chipExt` → `CHIPS[kind]`,
  the SAME `CHIPS`/`logErr` block below. See docs/split-plan.md
  "Deviations (9)".
- **`scheduleClip`/`stretchEnsure`/`stretchEnsureAll`/`audioChaseNow`** (→
  audio/clips.js) stay in app.js: `stretchEnsure`'s only real blocker is
  one `draw()` call at the end of its stretch-worker callback (render,
  step 11) — everything else in it is already pure/moved. This is also
  WHY `scheduleNote`/`previewNote` still can't move (see the corrected
  entry above) and why `offlineWaitForAssets`/`renderSongOffline` still
  can't move to audio/bounce.js (see below). **CORRECTED 2026-10-04 (step
  11): `render/roll.js` landed, but `draw()` itself did NOT move into it —
  PERMANENTLY, per that step's own "hub stays" finding (`drawFull` calls
  `updateTrackMore`/`updateEditButtons`, `ui/`, layer 4, above render's
  layer 3, forever).** `stretchEnsure`'s blocker therefore never clears by
  `draw()` moving — it can only clear if `stretchEnsure`'s own `.then()`
  callback is rewritten to not call `draw()` directly (a logic change, out
  of scope for a verbatim move) or if some other redraw-triggering
  mechanism replaces the direct call. `scheduleClip`/`scheduleNote`/
  `previewNote`/`offlineWaitForAssets`/`renderSongOffline` all inherit this
  same permanent block. See docs/split-plan.md "Deviations (11)".
- `metStart` (→ audio/metronome.js) stays in app.js: it calls
  `ensureAudio`/`resumeAudio` directly, both permanently blocked per the
  existing QUEUED entry above. `metHalt`, its exact mirror, moved clean
  (only `audioSessionType`, already platform/native.js).
- `offlineWaitForAssets`/`renderSongOffline`/`recordRealtimeAudio` (→
  audio/bounce.js) stay in app.js: blocked by `audioEnsureFile`/
  `stretchEnsureAll` (clips.js's own blocked pair), `stop()`/
  `scheduleNote()` (transport/voices, both still blocked), and
  `setInfo`/`stop`/`play` respectively.
- `initCatalog`'s QUEUED retry note (above) is CORRECTED, not cleared:
  landing `albumMetaFor` in audio/chip.js (layer 3) cannot unblock a
  layer-2 `model/catalog.js` import, ever — same shape as `estimateKey`.
  RESOLVED 2026-10-03 (step 9): the fix was not to retry this move but to
  relocate `albumMetaFor` ITSELF, out of audio/chip.js and into
  model/provenance.js (layer 2) — see the "RESOLVED ... initCatalog +
  folderScanAlbums" entry above and docs/split-plan.md "Deviations (9)".

`regen-e2e-footer.mjs --file src/app.js` re-run; check.mjs clean except
the pre-existing `oldBpb` finding (Q6); check-e2e-globals.mjs and
check-controls.mjs clean (26 controls, unchanged). devtools.js gained
`audioChip`/`audioChipStream`/`audioClips`/`audioMetronome`/`audioBounce`
namespace imports; sw.js APP_MODULES gained all five files, SW_VERSION
nr-v13 → nr-v14; index.html's modulepreload list gained all five.
tests/modules.test.mjs's checkSrc fileCount assertion bumped 23 → 28 (a
one-line test edit, same mechanical bump every step since 3 has made).

Verified: night-roll.test.mjs 427 (426 pass + 1 pre-existing env skip —
every "local song: …" SAFETY-regression test passes unchanged, since none
of that code moved a byte), modules 33/33, gestures 21/21, controls 3/3,
pwa 3/3, package 3/3, nsf 20/23 (3 pre-existing vault-only skips),
chip-worker 31/31, bridge 10/10, migrate-rollnotes 9/9, psx-render 7/7,
spc-render 5/5, instruments-export 4/4, sounding 8/8 — all green. `node
tools/split/check.mjs` clean except oldBpb; `node tools/package.mjs --out
/tmp/nr-dist-s8`: 47 runtime modules (unchanged — audio/ adds no
tools/-side runtime module of its own). `npm run test:e2e:smoke` (allowed
once locally): chromium 8/8 passed. NOT pushed: main session still needs
the iPad ear check (a chip song NES + one streamed console song, an
audio-clip song at 0.5×, the metronome, Download audio) before pushing
and building.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 9: src/model/{song,selection,provenance,album-order,versions,jobs}.js, src/import/{hub,capture}.js, src/sync/publish.js (docs/split-plan.md)
This step hit the "named target stays, pure leaves move" pattern harder
than any step before it — of the plan's own headline names for this step
(`loadSong`/`setSong`/`computeSongEnd`, `selEditApply`/`nudgeSelection`,
`saveSongAs`, `publishSong`), only `editableSong` moved; everything else
reaches `draw`/`setInfo`/`buildScoreModel`/`finalizeNotes`/`saveEdits`/UI-
button updates (render step 11, ui/chrome step 14), none yet split.
**CORRECTED 2026-10-04 (step 11): render landed, and this clarifies —
not clears — the block for every layer-2 (`model/`) name in this
paragraph.** `loadSong`/`setSong`/`selEditApply`/etc. are `model/`,
layer 2; `draw`/`buildScoreModel` are now real `render/` exports, layer
3 — a layer-2 module can never import layer 3, so these were never
"blocked until render exists," they are PERMANENTLY blocked by render's
own layer, independent of whether `draw`/`buildScoreModel` themselves
ever move again. What
`render/roll.js` landing actually did was let step 11's OWN entangled
hub (`draw`/`drawFull`/`resize`/`playbackFrame`) surface its own,
separate, equally permanent blocker one layer up (`ui/trackbar.js`'s
`updateTrackMore`, step 14) — see docs/split-plan.md "Deviations (11)".
What
DID move, nine new files: `model/provenance.js` (the whole P1 origin/rule-
table machinery — `isCaptureKey`, `ownFolderPath`, `isComposition`,
`originOf`, `RULES`/`rulesFor`, `canEditMusic`, `bakesTempo`/`bakesMeter`,
`albumTitleFor`, `slugify`, `isUnsaved`, + `albumMetaCache`/`albumMetaFor`
RELOCATED here from audio/chip.js, a step-8 placement correction);
`model/song.js` (`editableSong` + `estimateKey`/`checkKeyVsFile`,
relocated here from the dead-end `theory/key.js` attempt, steps 4-5);
`model/selection.js` (`selEditItems`/`clipboardHas`/`clipSummary` only —
every mutator stayed); `model/album-order.js` (the one fully-clean file,
matches the plan's table exactly); `model/versions.js` (the whole
localStorage version store minus `saveVersion`/`saveDraft` themselves);
`model/jobs.js` (the jobs store's and debug log's pure halves —
`jobsNotify` stays, PERMANENTLY, same shape as `ensureAudio`'s logging
calls in step 7 — `jobsNotify` itself was later misfiled upward to
`ui/sheets.js` once step 14 created it, per this doc's "Module map"
`ui/sheets.js` entry; see the step 2 QUEUED entry below — RESOLVED
2026-10-04, docs/split-phase2-plan.md step 1: `updateJobsBtn` is now a
`hooks.js` port, so `jobsNotify` can move down to `model/jobs.js` legally;
step 2 does the actual move); `import/hub.js` (`importHubLabel` only); `import/
capture.js` (byte-magic format sniffing + pure key/label helpers);
`sync/publish.js` (every GitHub-Contents-API/local-folder write primitive,
the share-link builder, the README generator — 22 names — despite
`publishSong` itself staying blocked). Along the way, relocating
`albumMetaCache`/`albumMetaFor` also retroactively RESOLVED two separate
permanent-looking blocks from earlier steps: `initCatalog` (steps 5/8) and
`folderScanAlbums` (step 6) both landed in `model/catalog.js` this step,
once `albumMetaFor`/`albumTitleFor` were layer 2 instead of layer 3. See
the three RESOLVED entries above (estimateKey/checkKeyVsFile, initCatalog
+ folderScanAlbums, isCaptureKey/chipSource) and docs/split-plan.md
"Deviations (9)" for the full per-cluster accounting, including a real
`tools/split/move.mjs` tooling gap this step hit twice (a same-file
self-import bug when a name being moved was already imported BACK from
the destination file by an earlier invocation — hand-fixed both times,
flagged for whoever next touches move.mjs to add a guard).

`regen-e2e-footer.mjs --file src/app.js` re-run three times; check.mjs
clean except the pre-existing `oldBpb` finding; check-e2e-globals.mjs and
check-controls.mjs clean (26 controls, unchanged). devtools.js gained
`modelSong`/`modelSelection`/`modelProvenance`/`modelAlbumOrder`/
`modelVersions`/`modelJobs`/`importHub`/`importCapture`/`syncPublish`
namespace imports; sw.js APP_MODULES gained all nine files, SW_VERSION
nr-v14 → nr-v15; index.html's modulepreload list gained all nine.
tests/modules.test.mjs's checkSrc fileCount assertion bumped 28 → 37.

Verified: night-roll.test.mjs 427 (426 pass + 1 pre-existing env skip —
every "local song: …" SAFETY-regression test passes unchanged, since none
of that code moved a byte), modules 33/33, gestures 21/21, controls 3/3,
pwa 3/3, package 3/3, nsf 20/23 (3 pre-existing vault-only skips),
chip-worker 31/31, bridge 10/10, migrate-rollnotes 9/9, import-set 5/5,
album-order 8/8, psx-render 6/6, spc-render 5/5, instruments-export 4/4,
sounding 12/12 — all green. `node tools/split/check.mjs` clean except
oldBpb; `node tools/package.mjs --out /tmp/nr-dist-s9`: 47 runtime modules
(unchanged — model/import/sync add no tools/-side runtime module of their
own). `node tools/dump_notes.mjs` re-verified byte-identical against a
scratch copy of albums/starters/fur-elise.mid; `tools/at.mjs` re-verified
against the same song. `npm run test:e2e:smoke` run twice (mid-step and
after the estimateKey/initCatalog follow-up): chromium 8/8 both times.
NOT pushed: main session still needs the browser checks this step's own
plan entry asks for — Save As on a scratch local song, the Versions
sheet, an NSF import into a scratch composition (never
albums/compositions/), and a publish to a scratch path — before pushing
and building.

## DONE 2026-10-03 13:55 — Quantize off the toolbar (Josh, Terminal #71: "takes up too much room … never used it"): #quantbtn stays in the markup hidden (Edit ▾ → Quantize… clicks it; Q key unchanged)

## DONE 2026-10-03 14:10 — Lasso next to Select (Josh, Terminal #73): placeLassoBtn() moves #lassobtn before #modeseg when the edit row shows, back to the footer on read-only songs

## DONE 2026-10-03 16:20 — Publish on a no-folder song names it first (publishUnsavedSong → saveSongAs → publishOpenComposition; .mid + annotations), Publish sheet says so up front. Was: breadcrumb still says "Local › Not saved yet › lotion" after Publish
Josh published lotion and the breadcrumb did not change. Cause (src/app.js songWhereLabel/updateSongBtn ~L9471): "Local" shows whenever a ff1roll-draft-<path> exists OR the path is not in S.CATALOG; folder "Not saved yet" is the CATALOG group "local" (src/model/catalog.js). Publish apparently neither adds the song to its real album group nor clears/refreshes the draft marker, so the crumb stays stale. Wanted: after a successful Publish, the crumb names where it went (album/folder, Published) and Local/Not saved yet goes away. Needs a real-browser check.

## DONE 2026-10-03 14:40 — File menu on Untitled songs (Josh, Terminal #75): Save Version was hidden for local/ songs (fileMenuSaveLabels used isComposition only) — now shown (isUnsaved too), and it opens the name+folder form; Save As closed instantly because openSaveForm clicked the File button again while the File menu was open (toggled it shut) — now only opens it when closed. Browser: Untitled → Save Version → name+folder → moved to albums/compositions/…, notes identical after reload.

## DONE 2026-10-03 14:35 — stacked top bar split the controls (Josh, Terminal #76: volume under the tracks): only #transport moved up; #timectl (metronome/gear/speed/volume) stayed after the chips. Stacked now keeps #transport+#timectl on the top row (chips order:1 full width), and trackRowNeed counts #timectl. Sweep clean (stack 1050 / unstack 1120, 0 unstable).

## DONE 2026-10-03 14:55 — "Save lost all my annotations" (Josh, Terminal #77, lotion): they were NOT lost (Mac backups after the save hold all 6; a reload shows them) — saveSongAs moved the keys but left the open song resolved under the old key, so the LCD showed the base tempo (120) and no key. saveSongAs now reopens the song from its new draft (openDraftDoc — the reload road). Browser: annotated Untitled at 175 / C locrian → Save Version → still 175 / C locrian, notes intact, crumb updated.

## 2026-10-03 15:10 — CI red on 561a2e9: WebKit (iPad Pro 11, 1194px) stacks the top bar now that the threshold counts #timectl; the stack happened a frame AFTER renderTrackbar (observer → rAF), shifting the roll under e2e drags that had just measured. renderTrackbar now calls fitTrackRow() synchronously. Watching CI.

## 2026-10-03 15:25 — 0310e28 reopened the song via openDraftDoc after Save; that replaced S.song under callers still holding it (e2e newComposition → seedChord lost its notes; smoke 4 failures locally). Replaced with an in-place finalizeNotes()+updateSongMeta(); smoke 8/8; browser: 175 / C locrian shown right after Save.

## DONE 2026-10-03 15:45 — ruler selection survives a relaunch (Josh, Terminal #78): rangeSel kept per song in localStorage (ff1roll-range-<key>, a view pref), written from draw() when it changes, restored in setSong, carried by renameLocalKeys

## DONE 2026-10-03 16:00 — opening an annotation no longer raises the iPad keyboard (Josh, Terminal #79): openEditor focuses the text box only for a NEW text note; opening an existing one of any kind blurs instead

## DONE 2026-10-03 16:45 — stretching the cycle while it plays keeps the playhead (Josh, Terminal #81): the rangeEdge drag end restarts playback from where the playhead is when it is still inside the new span (from the new top only otherwise)

## DONE 2026-10-03 17:05 — cycle stretch really keeps the playhead now (Josh, Terminal #83: b282f3f missed it): play() itself always reset fromSec to the cycle top; new opts.keepPos keeps an in-span position (used by the rangeEdge reschedule only; ▶ unchanged). Test proves both.

## DONE 2026-10-03 17:25 — each song reopens at its own zoom + scroll (Josh, Terminal #84): ff1roll-view-<mode>-<key> (debounced from draw), restored by fitView before it would fit; ruler selection already persisted (10d1640)

## DONE 2026-10-03 17:55 — playhead strip restyled as ruler chrome (Josh, Terminal #85: it looked like a light roll row): ruler panel background, a line above, bar ticks tall / beat ticks short from the bottom

## DONE 2026-10-03 (740feaf) — 32nd note value now drag-snaps to 32nds (moveSnapTicks: the pick is a trigger, as item 12's original spec said; presence still triggers too)
### was: 2026-10-03 Ask: 32nd note value does not drag-snap to 32nds
Josh (lotion, pulse2 bar 40): with the 32nd note value selected he still can only drag/move notes in 16th steps. He expects the 32nd button to make move/drag snap to 32nds (0.125 beat). He wants to nudge a pulse2 echo of pulse1 a 32nd later. Ask wrote the shift by hand via write_notes for now. Please check whether the note-value button should drive the drag snap, and fix if so.

## DONE 2026-10-03 (branch module-split) — `npm test` runs every file now (tools/run-tests.mjs: one file at a time, all of them, then the list of failed files)
### was: `npm test` stops at the first failing file
The script chains files with `&&`, so when the real-rip suites (ps2-real, instruments) fail because /tmp/claude-501/rips was cleared, every later file (gestures, bridge, pwa, modules, controls…) silently never runs locally. Fix: skip real-rip tests when the rips dir is missing (like other *-real suites should), or run each file regardless and fail at the end.

## IN PROGRESS 2026-10-03/04 — AI interaction as its own library (Josh, Terminal #91)
"extract all the code for the AI interaction into its own library so that we
can write other iPad apps and just use this seamlessly … a new repo … pull it
from there". Order: finish the module split first (step 13 = src/ask/), then
lift src/ask/ + tools/claude-bridge.mjs (bridge server, Terminal tab, notes,
status, shots, backups) into a standalone repo that Night Roll consumes as
plain ES modules (no build step). Night Roll-specific context (song/annotation
lines, Learning-mode rules) stays in Night Roll as a plug-in to the library.
Was blocked on Q7 (split order) and Q8 (repo) — both answered; see
docs/ai-library-plan.md for the full design (library layout, host adapter,
what goes where, the 8 ordered steps).

**Step 1 DONE 2026-10-04 (branch module-split):** `Night-Roll-App/claude-bridge@v0.1.0`
(web/sse.js = aiSSE only, plus its tests/README/LICENSE) vendored into
`vendor/ai/` by the new `tools/ai-sync.mjs` (`--ref`/`--repo`, `--from` for
the dev loop, `--check` wired into `npm test` via tests/modules.test.mjs);
`src/ask/backend.js`'s `aiSSE` now imports from `vendor/ai/web/sse.js`
(re-exported — every existing importer, and the vm harness's bare-name
`aiSSE`, unaffected); `sw.js` (`AI_LIB`/`AI_MODULES`/`CACHE`), index.html's
modulepreload, `tools/package.mjs` (reachability guard + never-ships-
vendor/ai/bridge/**), and `tools/split/check.mjs` (rules 1-3/6/7 now also
run over `vendor/ai/web`) all wired per the plan's §1. NIGHT-ROLL.md gained
an "AI library (vendor/ai)" section. Steps 2-7 (bridge server, backends,
store/ctx-cache/bridge-client/attach, the client loop, the window, the
library's own markup) remain queued — see docs/ai-library-plan.md §4.
NOT pushed from this worktree: browser-verify (offline + the iPad package)
is step 1's own stated verify line, still owed before this merges/ships.

**Step 2 DONE 2026-10-04 (branch module-split, worktree agent-a20925efe82cb8d31):**
the Mac bridge server itself moved to `Night-Roll-App/claude-bridge@v0.2.0`
(library commit 900292b) as `bridge/server.mjs` — `startBridge(opts,
profile)` + `main(argv, profile)`, today's logic carried over verbatim
except every Night Roll-specific value (system prompts incl. the
Learning-mode convention, the `.night-roll-bridge` state-dir name, the
`/shapes` mount, the startup banner) threaded through a `profile` object;
`--repo` is now required, with no default of the library's own.
`tests/bridge.test.mjs` moved to the library against a neutral test
profile; its `tests/lint.test.mjs` (app-vocabulary ban) now also covers
`bridge/`. `bridge/launchd/` is a generic `--entry`/`--label` installer.
Night Roll: `node tools/ai-sync.mjs --ref v0.2.0` vendored
`vendor/ai/bridge/` (package.mjs's never-ships-bridge guard, from step 1,
reverified clean); `tools/ai-profile.mjs` holds every moved string,
verbatim; `tools/claude-bridge.mjs` is now a 4-line shim
(`main(process.argv, profile)`) — its path, every flag, `npm run bridge`,
and the launchd plist all keep working unchanged; `tools/launchd/install.sh`
likewise shims to the library's installer (log file now
`~/Library/Logs/com.nightroll.bridge.log`, named after the launchd label
rather than hand-picked — the only externally-visible behavior change).
Night Roll's own `tests/bridge.test.mjs` is now the shim test (`/health`,
`/v1/models`, `--repo`'s default, `/shapes`, the Learning-mode text in the
system prompt) — `tests/ai.test.mjs` unchanged throughout. `npm test`
green (only the pre-existing ps2-real/instruments local-rip gaps fail);
`npm run test:e2e:smoke` green; `node tools/split/check.mjs` clean except
the known pre-existing `oldBpb`. NOT pushed from this worktree, and NOT
merged into the running bridge (launchd `com.nightroll.bridge` on the main
checkout, branch `main`, untouched) — the terminal session applies this
after Josh's merge: `node tools/ai-sync.mjs --ref v0.2.0` (already run
here; re-run after merge if needed) then `launchctl kickstart -k
gui/$UID/com.nightroll.bridge`. Steps 3-7 (backends, store/ctx-cache/
bridge-client/attach, the client loop, the window, the library's own
markup) remain queued — docs/ai-library-plan.md §4.

## OVERNIGHT PLAN 2026-10-03 (Josh, Terminal #97/#99/#100) — all on branch module-split, Josh tests in the morning
1. Split steps 9–15 (builders, one step at a time, merged here).
2. AI library: new private repo Night-Roll-App/claude-bridge (name/visibility Josh's, Q8) holding ALL AI support (bridge server, in-browser/cloud models, Ollama, LM Studio, the AI window); Night Roll imports it (plain ES modules, no build step).
3. AI integration tests (tests/ai.test.mjs): fake bridge/Ollama/LM Studio servers, assert the real request AND the reply landing in the app — being written now.
4. ✅ npm test runs every file (tools/run-tests.mjs).
5. "✦ Annotate this song for me" (QUEUED IDEA 2026-09-27): built after the library. Normal mode ONLY (Learning mode never gets AI-written analysis — CLAUDE.md), on-demand per tap, annotations tagged AI-written, clearable in one go.
Morning: one iPad build of the branch + one checklist; merge to main only after Josh says so.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-03 — module split step 10: src/gen/{drummer,bassist,analysis}.js (docs/split-plan.md)
Sparsest "headline moved" ratio of any step so far: of the plan's own named
targets (`drGenerate`, `bsInferTimeline`/`bsGenerate`, "Analyze layer compute
and adopt"), only `bsInferTimeline` moved, and even that needed two unlisted,
zero-blocker relocations first (the real content of this step): `tonicPcOfName`/
`modeOfName` → `theory/key.js` (pure key-name parsers, inverse of `keyNameFor`),
`keyNameAt`/`sfDeclaredAt`/`sfDeclaredAtRaw`/`sfShownAt`/`sfAt` → `model/song.js`
(the declared/shown key+scale-factor family, next to `estimateKey`). Both were
genuinely blocker-free (unlike every "permanent" UI/render blocker steps 6-9
found) — nobody had moved them yet, so this step did. `gen/drummer.js` ←
`drumRng`/`DR_TOMS`/`fnv1a32`/`DR_FILLS`/`sectionLane`/`drBoundaries`/
`drNormParts`/`drBassTrack`/`drBackbeats`/`fmtBarBeat` (pure fill/skeleton
math only — `drGenerate`/`drKitCountT` stay, blocked by `setInfo`/`saveEdits`/
`computeSongEnd`/`draw`/`drPartsGet`). `gen/bassist.js` ← `bsChordTone`/
`bsInferTimeline`/`bsChordTimeline`/`chordAt`/`nextChange` (`bsGenerate`/
`applyTake` stay, blocked by `setInfo`/`saveEdits`/`computeSongEnd`/`draw`).
`gen/analysis.js` ← `harmonyTrackIndices`/`computeAnalysisLayer`
(`scheduleAnalysisRecompute`/`drawAnalysisLayer`/`adoptChordBand`/
`adoptAllChords`/`adoptKeyRegion`/`openAnalyzeSheet` stay — `drawAnalysisLayer`
specifically because it's render/canvas code, not compute, despite sharing
the banner). Corrects the step-9-era QUEUED note that assumed landing this
file would unblock `model/edits.js`'s `saveEdits` via `scheduleAnalysisRecompute`
— it doesn't; see the corrected note above.

Two real `move.mjs` findings this step: the known same-file self-import bug
(now THREE occurrences across two steps — see the dedicated entry below) and
a NEW failure mode, a two-statement line join (`computeSongEnd = prof(...)`
joined onto `function annoSnapshot() {`, with the former's trailing comment
silently clobbered) — the exact same shape as step 9's own fix commit
(4316dc7a, "Split the line the step-9 move joined"), now a confirmed repeat,
not a one-off. Both hand-fixed (import-line deletion; line split with the
comment restored verbatim). `regen-e2e-footer.mjs` re-run once; check.mjs
clean except oldBpb; check-e2e-globals.mjs/check-controls.mjs clean (26
controls, unchanged). devtools.js gained `genDrummer`/`genBassist`/
`genAnalysis`; sw.js APP_MODULES gained all three, SW_VERSION nr-v15 → nr-v16;
index.html's modulepreload list gained all three. tests/modules.test.mjs's
fileCount bumped 37 → 40.

Verified: night-roll.test.mjs 428 (427 pass + 1 pre-existing env skip — the
six existing "P6 Analyze layer" tests, including the Learning-mode spy test
and the notes.txt/askContext byte-identity test, already satisfied this
step's "Analyze is Normal-mode only, nothing leaks into Learning" verify
line, so no test was added), modules 33/33, gestures 21/21, controls 3/3,
pwa 3/3, package 3/3, nsf 20/23 (3 pre-existing vault-only skips), chip-worker
31/31, bridge 10/10, migrate-rollnotes 9/9, import-set 5/5, album-order 8/8,
psx-render 6/6, spc-render 5/5, instruments-export 4/4, sounding 12/12 — all
green. `node tools/split/check.mjs` clean except oldBpb; `node
tools/package.mjs --out /tmp/nr-dist-s10`: 47 runtime modules (unchanged).
`node tools/dump_notes.mjs` re-verified byte-identical against scratch copies
of all four albums/starters/ songs (never albums/compositions/); `tools/at.mjs`
re-verified against fur-elise.mid. `npm run test:e2e:smoke` run once: chromium
8/8. NOT pushed: this is a pure refactor with no user-facing change, but the
main session should still browser-verify (open a song, generate a drum/bass
take, toggle Analyze in Normal mode) before pushing and building, per the
plan's own checklist.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split step 11: src/render/{roll,tracks,score,instrument,cof,compare}.js (docs/split-plan.md)
This step found the single sharpest "hub stays" case the whole split has
hit: `resize`/`draw`/`drawFull`/`playbackFrame`/`updateCanvasA11y` — the
plan's own named headlines for render — did NOT move, and PERMANENTLY
(`resize`/`drawFull` call `updateTrackMore`/`updateEditButtons`,
`ui/trackbar.js`/`ui/note-editor.js`, step 14, layer 4, strictly above
render's own layer 3, forever; `updateCanvasA11y` independently calls
`songTitleOf` → `impDisplayTitle`, `import/capture.js`, layer 4). This
task's own instructions anticipated exactly this ("`draw()` is the hub…
leave it in app.js and say so").

Six `move.mjs --names` invocations over src/app.js, in dependency order
(roll.js first — every other render file needs its `css`/`ctx`/
`trackColor`/`curTick`/etc. — then tracks/score/instrument/cof/compare):
`render/roll.js` (60 names — the kit-lane row math, the farthest-point
auto-track-color algorithm, the view/range-selection persistence trio,
`drawRuler`/`drawLasso`/the playhead-strip family, the lasso-annotation
predicates, `drawAnalysisLayer`, `fallActive`); `render/tracks.js` (13
names — Tracks view's own geometry + `drawTracks`, fully clean, matching
the plan's table exactly); `render/score.js` (18 names — `buildScoreModel`/
`drawScore`/`renderMeasure`/`scoreTickToX`/etc.; note entry/erase/tap
stayed, blocked by `saveEdits`/`draw`/`renderTrackbar`); `render/
instrument.js` (21 names — `drawInst`/`drawPiano`/`drawGuitar`/`drawFall`
+ their geometry; hit-test/recording/MIDI stayed, input/record territory
step 12); `render/cof.js` (8 names — the wheel's drawing only; its drag
interaction stayed, step 12); `render/compare.js` (3 names — `drawCompare`/
`cmpDiff`/`cmpTrackKey`; the compare-mode UI/fetch/swap functions stayed,
blocked by `setInfo`/`readData`/`draw()`).

A same-layer forward-reference cycle between `roll.js` and `score.js` (and
a smaller one with `tracks.js`) — the step-5 `rollnotes.js`/`grid.js`
shape repeated at layer 3 — needed the same fix: move roll.js first, then
hand-correct its two temporary `"../app.js"` imports (`scoreTickToX`,
`drawAudioStrip`) to `"./score.js"`/`"./tracks.js"` once those files
existed; confirmed clean by `check.mjs` rule 5 immediately after. See the
two move.mjs-bug entries below for the `?perf=1` profiler-wrap casualties
this step's ten moved profiled functions produced (a new variant, not
either previously-documented slip).

`regen-e2e-footer.mjs --file src/app.js` re-run once (cleared 98 stale
rule-2 violations in one pass); `check.mjs` clean except the pre-existing
`oldBpb` finding; `check-e2e-globals.mjs`/`check-controls.mjs` clean (26
controls, unchanged). `devtools.js` gained `renderRoll`/`renderTracks`/
`renderScore`/`renderInstrument`/`renderCof`/`renderCompare` namespace
imports. `sw.js` `APP_MODULES` gained all six files, `SW_VERSION` bumped
`nr-v16` → `nr-v17`; `index.html`'s modulepreload list gained all six.
`tests/modules.test.mjs`'s `checkSrc` fileCount assertion bumped 40 → 46.
`node tools/package.mjs --out /tmp/nr-dist-s11`: 47 runtime modules
(unchanged — no `tools/`-side runtime module corresponds to `render/`).
`node tools/dump_notes.mjs` re-verified byte-identical against scratch
copies of all four `albums/starters/` songs (never `albums/compositions/`);
`tools/at.mjs` re-verified against `fur-elise.mid`. Tests, under
`perl -e 'alarm 1200; exec @ARGV' npm test`: night-roll 428 (427 pass + 1
pre-existing vault-only skip — every "local song: …" SAFETY-regression
test and every P6 Analyze-layer test passes unchanged), modules 33/33
(fileCount bumped 40 → 46), controls 3/3, pwa 3/3, package 3/3, nsf 20/23
(3 pre-existing vault-only skips, same gap as every prior step); the only
two failing test FILES were `ps2-real` and `instruments`, both pre-existing
local-rip-fixture gaps unrelated to this step (no moved name is referenced
by `tools/ps2/*.mjs` or either test file). `npm run test:e2e:smoke`:
chromium 8/8. **`node tools/split/verbatim.mjs HEAD` does NOT print a
clean ✔ — one known, hand-verified exception**: `AUDIO_STRIP_H` (one
`lost`/two `extra`) because its original app.js line combined it with the
unrelated boot-time `S.RULER_W = RULER_W_ROLL;` statement on one physical
source line; moving the constant away necessarily splits that line across
two files, which a line-granular text differ can never represent as a
non-loss no matter how it's phrased (tried: init-wrapping the assignment,
combining both on one line in the destination — illegal, rule 3 —
duplicating the value under a second name — illegal, rule 6). Verified by
hand, token for token, that nothing was lost: both halves reappear exactly
once, in app.js and `render/roll.js` respectively. See docs/split-plan.md
"Deviations (11)" for the full reasoning — flagged there as a fourth,
distinct `move.mjs`/`verbatim.mjs` tooling-limitation class, the one with
no available hand-fix. The main session should decide whether this
exception is acceptable as documented or whether to revert just this one
constant's move (which would also require reverting `drawAudioStrip`/
`drawRuler`'s placement, undoing real architecture, not just cosmetics).
NOT pushed: the main session should browser-screenshot roll,
tracks, score, instrument, circle of fifths and compare at desktop and
phone width, compared to before the step, per the plan's own verify line,
before pushing and building. See docs/split-plan.md "Deviations (11)" and
NIGHT-ROLL.md's six new `render/*` entries.

## RESOLVED 2026-10-04 (split phase 2 step 0, tooling) — tools/split/move.mjs: a same-file self-import guard is overdue (three occurrences across two steps)
`move.mjs` resolves a moved node's free identifier against the `--from`
file's OWN existing imports before checking whether the name is already a
LOCAL declaration in `--to`, so when `--from` already imports a name FROM
the very file now receiving new code, the mover emits a bogus
self-referencing import line inside `--to` (a parse error, caught
immediately by check.mjs, never silent). Step 9 hit this twice
(`albumMetaCache`/`albumMetaFor` into `model/provenance.js`;
`titleCaseSlug`/`folderScanAlbums` into `model/catalog.js`). Step 10 hit it
twice more (`MODE_OFFSET` inside `theory/key.js`, moving `modeOfName`;
`estimateKey` inside `model/song.js`, moving `sfShownAt`). All four were
one-line hand-fixes (delete the bogus import). Fix: before emitting a
back-import for a free identifier, check whether the resolved specifier
equals `--to` itself (or, more generally, whether the name is already a
local declaration in `--to`) and skip emitting it in that case.

**Fixed**: `planMove` now checks `toDeclaredNames` (every name already
declared in `--to`) BEFORE falling through to `--from`'s own imports, and
separately drops any import whose resolved specifier would equal `--to`
itself, as a defensive backstop. Reproduced the exact `MODE_OFFSET`
self-import from steps 8-10 as a unit test first (confirmed it failed on
the old code), then fixed it. Test: "move.mjs (a): never emits an import of
a file into itself" (tests/modules.test.mjs).

## RESOLVED 2026-10-04 (split phase 2 step 0, tooling) — tools/split/move.mjs: a second line-joining bug (two statements landing on one line after a deletion)
Step 9's fix commit (4316dc7a, "Split the line the step-9 move joined")
fixed one instance (`saveDraft = prof(...)` joined onto
`function saveVersion(quiet) {`) by hand, without a tooling fix. Step 10 hit
the identical shape again (`computeSongEnd = prof(...)` joined onto
`function annoSnapshot() {`, with the first statement's own trailing comment
silently replaced by the second statement's leading comment) — two
occurrences now, confirmed repeatable, not a one-off either. Fix: when
`move.mjs` deletes a contiguous run of top-level nodes, always leave (or
insert) a newline between whatever statement remains immediately before the
deleted run and whatever statement remains immediately after it, so two
surviving statements are never left sharing one line. Until fixed, every
future move must keep checking `git diff` for this pattern by hand (this
task's own instruction already does).

**UPDATE 2026-10-04 (step 11): a closely related but distinct variant,
hit ten times in one step** — every `?perf=1`-profiled function this step
moved (`drawRangeTints`, `drawLasso`, `drawRuler`, `drawTracks`,
`buildScoreModel`, `drawScore`, `drawInst`, `drawPiano`, `drawGuitar`,
`drawFall`) left its own `X = prof("X", X); // comment` statement behind
in app.js (it has no declared name, so `--names` never selects it) —
illegal the moment `X` became an import (`check.mjs` rule 2). In most
cases `scope.mjs`'s `leadingComments` (the backward comment-walk that
decides a selected node's "leading comment" span) swallowed the
statement's own TRAILING comment into the NEXT selected node's leading
comment — it only checks for whitespace between a comment and the next
node's start, not for a non-comment statement sitting in between — so the
comment silently relocated into the WRONG file while the `X = prof(...)`
code itself vanished from both files with no diagnostic. Two of the ten
(`drawRuler`'s, `drawPiano`'s) left no trace anywhere, comment included —
both sat squeezed between two selected cuts with no surviving node on
either side for the comment to attach to. All ten were hand-reconstructed
in the new files, verified against `grep -c "= prof(" src/*.js
src/render/*.js` (26 before this step, 26 after, same count, none
duplicated) rather than against the diff, which shows nothing for a
statement no tool ever "moved." A full tooling fix needs both bugs
together: the line-joining fix above, PLUS teaching `leadingComments` (or
`move.mjs`'s selection/cut logic) that a trailing same-line comment belongs
to the statement that precedes it, not to whatever node happens to come
next whitespace-only. Three documented bug classes now (self-import,
line-joining, trailing-comment-misattachment) — worth a combined
`move.mjs`/`scope.mjs` fix pass before step 12 if tooling work is ever
budgeted for.

**UPDATE 2026-10-04 (step 12): a fourth variant, found on an attempted
move that was then reverted — a synthesized `init<Module><N>()` call
left in `--from` has no import.** Attempted on the circle-of-fifths
wheel's drag interaction (`cofAngle`/`cofRelease` + its four top-level
`cofCanvas.addEventListener(...)` calls, wrapped as `initGestures1()`/
`initGestures2()`). When the selected range is a pure non-declaration
top-level statement (no accompanying named declaration in the same
`--names`/`--range` call), `move.mjs` wraps it in `export function
init<Module><N>()` in `--to` and leaves `init<Module><N>();` at the
original spot in `--from` — but the back-import logic only scans
`movedDeclNames` (the declared names of moved DECLARATION nodes) for
names the remaining body still references; a synthesized init name was
never a declared name in the original source, so it's invisible to that
scan and `--from` never gets `import { init<Module><N> } from
"<--to>";`. Silent until `check.mjs` rule 1 flags it ("free identifier is
not a local, an import, or in browser-globals.txt") — caught immediately
(three instances: `initGestures1/2/3`, the third from a separate,
also-reverted keyboard-delegate move), fixed by hand (one import line per
call) as a first attempt. No prior step had hit this because every
earlier non-declaration-statement move happened to leave its init call
either unreferenced elsewhere or co-located with a moved declaration
that itself triggered the normal import path (e.g. step 9's
`initCatalog`, a real pre-existing name, not a synthesized wrapper). Fix:
`move.mjs` should add `init<Module><N>` to `backReferenced` the moment it
decides to wrap a group, independent of whether that name is a "moved
declared name." A related, separate symptom from the same attempted
move: `regen-e2e-footer.mjs`, run once right after the step's two plain
name-based moves (before the cof-wheel attempt existed), generated a
stale `set` accessor for `cofRelease` in its `__nrExpose$` footer, correct
for the file as it then stood but wrong the moment `cofRelease` became an
import — `check.mjs` rule 2 caught it; the fix is procedural (run the
footer generator once, last, after every move.mjs call for the step, not
mid-step), not a tooling change. Both hand-fixes got the attempted move
to pass `check.mjs` cleanly — but a THIRD, unrelated gap then surfaced in
`verbatim.mjs` itself (see the step-12 entry below), with no comparable
hand-fix, and that one is why the cof-wheel move (and a second,
independently-blocker-free keyboard delegate) was reverted rather than
shipped. Five documented bug classes now across `move.mjs`/
`verbatim.mjs` (self-import, line-joining, trailing-comment-
misattachment, missing-init-import, verbatim's-no-tolerance-for-init-
wrapping) — the same combined tooling-fix pass this note has been
accumulating against, now overdue.

**All five, plus the step-14 footer-ordering slip and the step-14
stale-specifier/lost-export gap below, fixed 2026-10-04 (split phase 2
step 0, tooling)**:
- Line-joining + trailing-comment-misattachment: root cause was
  `scope.mjs`'s `leadingComments`, which treated a comment with only
  whitespace before the NEXT node as that node's leading comment even when
  the comment sat on the SAME LINE as unrelated preceding code (a trailing
  comment, not a leading one). Fixed there (one extra line-start check) —
  fixes both the join and the misattachment at the root, for every tool
  that calls it, not just move.mjs's own cut logic.
- Missing-init-import: `move.mjs` now adds the synthesized `init<Module><N>`
  (or `--init <InitName>`, new — see below) name to `--from`'s import list
  unconditionally the moment it decides to wrap a group, not by scanning for
  it among ordinary declared-name back-references.
- `--init <InitName>`: added, so a single synthesized init wrapper can take
  an explicit name instead of the auto-numbered `init<Module><N>` sequence.
- `verbatim.mjs`'s no-tolerance-for-init-wrapping: fixed — it now
  recognizes the `export function <InitName>() {` header and the bare
  `<InitName>();` stub unconditionally (unambiguous by shape), and budgets
  exactly as many tolerated bare `}` lines as there are net new/removed
  headers (never more, so an unrelated unmatched brace is still caught).
  `--hook X,Y` mode added too (docs/split-phase2-plan.md §1 M4.3, ahead of
  step 1 actually needing it).
- Step-14's footer-ordering slip (a reverse `--to src/app.js` move landing
  after the generated e2e footer, which `regen-e2e-footer.mjs` then deleted
  along with the stale footer): `move.mjs`'s `assembleTo()` now splits the
  footer off, inserts new content before it, and reattaches it at the true
  end — every time, not just when a human remembers to check.
- Step-14's stale-specifier/lost-export gap (an import whose specifier
  resolves at a legal layer but the target no longer exports that name):
  promoted into `check.mjs` as rule 9, exactly as that step's own note
  proposed. Checked against the real repo: zero findings (the repo is
  currently clean of this).
- Self-import guard: see the entry immediately above this one.
All reproduced as failing unit tests against the OLD code first, then
fixed, then re-verified clean against the real commits that originally hit
them (`node tools/split/verbatim.mjs 868beff8`/`b92ec10d` still print ✔).
See docs/split-phase2-plan.md step 0's own closing note and
tests/modules.test.mjs's `move.mjs`/`verbatim.` test blocks.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split step 12: src/input/{gestures,record}.js (docs/split-plan.md)
Shipped: the table's own two named leaf functions (`evtPos`/
`posToTickPitch`) plus five more pure hit-test/coordinate helpers found by
reading the surrounding code (`cursorHandleHit`, `cursorHit`, `tickAtX`,
`rulerSnapX`, `armNoteEdit`) — seven names into `input/gestures.js` — and
four pure record/MIDI-status helpers (`recOpenEnded`, `recSnap`,
`recSnapOn`, `midiStatusLine`) into `input/record.js`. Everything else
named in the plan's table description ("pointer/pinch/hold-to-grab,
lasso" for gestures; "MIDI-in/keyboard record, punch-in, take handling"
for record) is a single interlocking cluster — the canvas `pointerdown`/
`pointermove`/`pointerup` drag/pinch/hold-to-grab state machine, `tap`/
`finalizeLasso`/`toggleSel`/`scoreLassoTap`/`scrubTo`/`seekOrMoveCursor`/
`placePencilNote`/`endPointer`/`clearMultiSel`, the ● record button
handler, `recNoteOn`/`recNoteOff`/`recFinish`/`midiMessage`/`initWebMidi`/
`initCoreMidi`, `instTap`'s pointer wiring, and every keyboard-shortcut
`document.addEventListener("keydown", …)` block — and every one of them
calls `setInfo()` and/or `draw()`/`drawFull()` directly or transitively
(through `refreshSelInfo`/`renderTrackbar`/`openVoiceMenu`/`saveVoices`/
`hitNote`/`hitTracksNote`/`hitTracksClip`/`annoSnapshot`/`setAnchorBQ`/
`setEndBQ`/`setInstInfo`/`keyNameShownAt`/`instPlay`/`pushUndo`/
`saveEdits`/`updateSubtitle`), all still bare app.js names (`setInfo`/
`renderTrackbar`/`openVoiceMenu`/etc. are `ui/*`, step 14; `draw` is
render's own PERMANENT block per step 11's Deviations). Per this task's
own instruction ("app.js-only names are a problem only if they'd need
app.js imports: check.mjs decides"), every one of these stays bit-for-bit
in app.js — checked individually, not assumed as a block (the same
discipline step 6's Deviations insisted on): each was read in full and
its specific blocker named, not inferred from its neighbors.

**Attempted, then reverted: the circle-of-fifths wheel's drag interaction
(`cofAngle`/`cofRelease`) and a VoiceOver Enter/Space→`.click()` keyboard
delegate for `role="button"` elements.** Both are genuinely blocker-free
— `cofRelease` calls only `wrapSf`/`drawCof` (`render/cof.js`, already
below `input/`'s layer) and `S`; the keyboard delegate touches only
`document`/`t.click()` — and both moved cleanly through `check.mjs` after
the hand-fixes in the move.mjs-bug entry above. But `node tools/split/
verbatim.mjs HEAD` then reported several `extra` lines with no `lost`
counterpart: the `export function init<Module><N>() {` header, its
closing `}`, and the bare `init<Module><N>();` call that §2.2's own
wrapping mechanism requires for ANY top-level-statement move are new
structural text `verbatim.mjs` has no tolerance for (its tolerance list
is only import lines, `export` keywords, the generated e2e footer, the
devtools namespace list, and comment placement) — nothing was actually
lost, but this task's instruction is to amend until `verbatim.mjs HEAD`
prints a clean ✔, and the one exception shape it names (a single original
line combining two unrelated statements, step 11's `AUDIO_STRIP_H`)
doesn't cover this either. No prior step had hit it because no prior
step's move ever isolated a pure top-level side-effect statement by
itself (every earlier one was co-selected with a named declaration).
Rather than ship an undocumented new verbatim-exception class, both moves
were backed out and left in app.js. Real, on-topic, zero-blocker finds
for whichever step next budgets a `move.mjs`/`verbatim.mjs` tooling pass
(teach `verbatim.mjs` to tolerate the §2.2 init-wrap boilerplate the same
way it already tolerates generated imports/footers) — not acted on this
step.

`regen-e2e-footer.mjs --file src/app.js` re-run after the final file
state (the two shipped moves only); re-running after every move.mjs
invocation in a step, not just once at the end, is the safer habit the
next step should default to, given the stale-footer symptom above.
`check.mjs` clean except the pre-existing `oldBpb` finding;
`check-e2e-globals.mjs`/`check-controls.mjs` clean (26 controls,
unchanged). `devtools.js` gained `inputGestures`/`inputRecord` namespace
imports. `sw.js` `APP_MODULES` gained both files, `SW_VERSION` bumped
`nr-v17` → `nr-v18`; `index.html`'s modulepreload list gained both,
ordered after `render/compare.js` and before `app.js` (layer 4, below
app.js's layer 5). `tests/modules.test.mjs`'s `checkSrc` fileCount
assertion bumped 46 → 48. `node tools/package.mjs --out
/tmp/nr-dist-s12c`: 47 runtime modules (unchanged — no `tools/`-side
runtime module corresponds to `input/`). `node tools/split/verbatim.mjs
HEAD` prints a clean ✔. The sorted `^\w+ = prof\("\w+"` set across src/ is
unchanged (29 entries). Tests, under `perl -e 'alarm
1200; exec @ARGV' npm test`: the only two failing test FILES were
`ps2-real` and `instruments`, both pre-existing local-rip-fixture gaps
unrelated to this step; `gestures.test.mjs` 21/21, `modules.test.mjs`
33/33 (fileCount bumped), `controls.test.mjs` 3/3. `npm run
test:e2e:smoke`: chromium 8/8. None of this step's eleven moved names
were ever profiled. See docs/split-plan.md "Deviations (12)" and
NIGHT-ROLL.md's two new `input/*` entries.
NOT pushed: the main session should browser-check, on the iPad and
desktop, drawing a note, hold-to-grab, pinch-zoom, a ruler drag, and
strip tap/drag, before pushing and building.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split step 13: src/ask/{backend,tools,context,bridge,shots,sheet}.js (docs/split-plan.md)
Shipped: 172 of the ~192 ask/ai-prefixed names (plus `parsePitch`/
`b64Bytes`/`notesTxtForDoc`/`TERM_MODELS`) moved verbatim across six new
files — `ask/backend.js` (20: `aiUrl`/providers/WebLLM, all library-bound
per docs/ai-library-plan.md §3), `ask/context.js` (42: the system prompt,
every context-line builder, the sent/epoch cache, plus a relocated
`songTitleOf`/`songWhereLabel` — see below), `ask/tools.js` (19: the
`ASK_TOOLS` schema + pure annotation/write-notes/bars field helpers),
`ask/bridge.js` (55: seen-cursors, chat store/log, session/job
bookkeeping, inbox/status polling), `ask/sheet.js` (20: the chat sheet's
DOM + draft persistence), `ask/shots.js` (16: the screenshot list). Full
per-file name lists and the "did NOT move, and why" accounting are in
NIGHT-ROLL.md's Module map, not restated here. **None of the six files'
own headline orchestrators moved** — `askContext`, `askRunTool` and
every write-tool body, `askRun`/`askSend`/`askResume`, `openAsk`/
`askBtnTap`, every `deploy*` function except the three logging-free ones
— all still bare in app.js, blocked by `setInfo`/`draw`/`logDebug`/
`appConfirm`/`updateSongBtn`/`finalizeNotes`/`saveEdits`/`saveDraft`/
`publishSong`/`insertTime`/`deleteTime`/`applyTake`/`closeDropUp`/
`micStop`/`keyLabelState` — all `ui/*` (step 14) or permanently blocked
(`draw`, step 11's finding) or shared code with no home of its own yet.

**`songTitleOf`/`songWhereLabel` relocated into `ask/context.js`,
unlisted by the plan's table, after `model/song.js` (the thematically
obvious home, where `estimateKey` already lives) turned out to be
flatly illegal**: `songTitleOf` calls `impDisplayTitle`
(`import/capture.js`, layer 4), and `model/song.js` is layer 2 — layer 2
can never import layer 4, confirmed by `check.mjs` the moment it was
tried (`rule 5: model/song.js (layer 2) imports "../import/capture.js"
(layer 4)`). Reverted, re-run with `--to src/ask/context.js` (layer 4,
same layer as `import/capture.js`) instead — zero rule-5 findings. The
~30 non-ask callers left in app.js now import it back downward, legal
regardless of host file. See docs/split-plan.md "Deviations (13)" for
the full reasoning, including why `keyLabelState`/`closeDropUp`/
`micStop` (the other three app.js-shared blockers this step hit) were
NOT given the same treatment — each still has a genuine non-ask caller
with no `ui/*` home of its own yet, so relocating them would be the
"speculative widening" step 0a's Deviations warned against; `songTitleOf`
only got the exception because `model/` was ruled out BY THE LAYER TABLE
ITSELF, not by taste.

One `move.mjs` same-file self-import slip hit (the known class from steps
8-10): moving `askReadBars` into `tools.js` resolved its `songTitleOf`
reference via app.js's own already-rewritten import (pointing at
`ask/context.js`) instead of recognizing it as a local declaration of
that same destination file — produced a self-import inside
`ask/context.js`, caught immediately by `check.mjs`'s parse error, fixed
by deleting the one bogus line.

`regen-e2e-footer.mjs --file src/app.js` run once, after all seven
`move.mjs` invocations and both hand-fix passes (the self-import above,
plus the same-layer `bridge.js`/`sheet.js` cycle's one stale `../app.js`
specifier) — not mid-step, per step 12's own procedural finding.
`check.mjs`/`check-controls.mjs`/`check-e2e-globals.mjs` all clean except
the pre-existing `oldBpb` finding. `node tools/split/verbatim.mjs HEAD`
prints a clean ✔. `tests/ai.test.mjs` (7/7) and `tests/bridge.test.mjs`
(10/10) — this step's own oracles — both green, standalone and inside
`npm test` (427/427 on night-roll, the only other failures being the
pre-existing `ps2-real`/`instruments` local-rip gap). `npm run
test:e2e:smoke`: chromium 8/8.

NOT pushed: the main session should browser-check, on the iPad, sending
one Ask message, attaching a screenshot, and confirming the "Now:"
status line still updates — the plan's own verify line for this step —
before pushing and building. docs/ai-library-plan.md §3 gained a short
note on exactly which of its library-bound functions actually landed in
`ask/backend.js` vs stayed in app.js (`aiHostOk`), since extraction
(the plan's step 1) is the next task to pick this up.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split step 14: src/ui/{chrome,trackbar,mixer,voice-menu,notes,note-editor,sheets,wm}.js (docs/split-plan.md) — CORRECTS the step-11 "draw() is PERMANENT" finding and several "ui/*, step 14" placeholders above
app.js 17216 → 14744 lines. Full per-file name lists and the "did NOT
move, and why" accounting are in NIGHT-ROLL.md's Module map (each of the
eight files got its own entry plus a `finalizeNotes` correction entry);
not restated in full here.

**Headline finding, re-answering this task's own question ("decide
whether `draw`/`resize`/`drawFull`/`playbackFrame`/`updateCanvasA11y`
belong in a layer-4/5 home now that `ui/` exists"): they do, and step
11's "PERMANENT" framing above (and NIGHT-ROLL.md's `render/roll.js`
entry) is corrected, not merely cleared.** The permanence was real
against `render/roll.js` (layer 3 — `updateTrackMore`/`updateEditButtons`
are layer 4, upward, forever) but was never checked against `ui/chrome.js`
(layer 4, the SAME layer — cycles inside layers 3–5 are legal, §2.3) until
this step, because `ui/chrome.js` didn't exist yet. Grepped every
already-moved file across every layer for a call to any of the five:
zero hits below layer 4. `move.mjs --from src/app.js --to
src/ui/chrome.js --names resize,draw,playbackFrame,updateCanvasA11y,
drawFull` went through clean. This in turn unblocked `setInfo`/`logErr`/
`logDebug`/`updateSongBtn`/`updateSyncBtn`/`updateJobsBtn`/`appConfirm`/
`micStop`/`keyLabelState`/`closeDropUp`/`clampView`/`pushUndo`
(→ `model/edits.js`)/`addTrackUndoable`(→ `model/edits.js`)/`saveDraft`/
`computeSongEnd`/`refreshSelInfo`/`renderOctBtn`/`reflectSelVel` —
everything the "ui/*, step 14" placeholders above this entry were
waiting on. **`renderTrackbar`/`trackToggle` (→ `ui/trackbar.js`) and the
whole `renderMixer`/`mixerStripEl`/`mixerStripDragize`/`openMixer`/
`closeMixer`/`toggleMixer` cluster (→ `ui/mixer.js`) were ALSO tried one
hop further, passed a `move.mjs --dry-run` AND `check.mjs` clean — and
were reverted anyway, once `npm test`'s real module linking (which
`check.mjs` cannot do — see below) showed both still need `saveTrackDir`.
This is the step's SECOND real false step, not its first win.**

**What this does NOT clear, checked directly rather than assumed:**
- `saveTrackDir` (→ `finalizeNotes`) still blocks `ui/trackbar.js`'s
  `renderTrackbar` and `ui/mixer.js`'s whole cluster — both tried, both
  reverted, both stay bare in app.js. `openVoiceMenu` (→ `buildVoiceMenu`
  → `ensureAudio`/`resumeAudio`/`openMaster`) still blocks
  `ui/trackbar.js` too, same reason.
- **A new, `check.mjs`-shaped blind spot, not a `move.mjs` bug: `check.mjs`
  verifies a name resolves to SOME import at a legal layer, never that the
  import's SPECIFIER still exports that name.** `saveDraft` round-tripped
  through `model/versions.js` before landing in `ui/chrome.js`; three
  OTHER files' `import { saveDraft } from "../model/versions.js"` lines
  (ui/sheets.js, ui/mixer.js, app.js itself) were never updated to the new
  specifier, and `check.mjs` reported nothing — `model/versions.js` is a
  real, legal, layer-≤4 source to import FROM, it just doesn't export that
  name any more. Only `npm test` caught it (`SyntaxError: The requested
  module '../model/versions.js' does not provide an export named
  'saveDraft'`). A standalone script (not promoted into tools/split/, out
  of this task's scope) that walks every import and confirms the target
  file exports the name found exactly these three and nothing else — worth
  a `check.mjs` rule 9 for whoever next touches the checker.
- **A related, one-step-deeper variant of that same gap: rejoining two
  statements onto one physical line (the standard fix for a `verbatim.mjs`
  joined-line finding) can silently drop a relocated name's OWN `export`
  keyword, when the line's only `export` belonged to the OTHER statement.**
  `pubCheck`/`pubCompareDraft` shared one app.js line (nothing in app.js
  is individually `export`ed, so only the LEADING "export" convention
  move.mjs adds applied — to `pubCheck`, not to `pubCompareDraft`, which
  followed it on the same line). Rejoining them in `ui/sheets.js` to
  satisfy `verbatim.mjs` left `pubCompareDraft` un-exported; `check.mjs`
  has no rule that would catch this (it never requires a name to be
  exported), and `verbatim.mjs`'s own normalized-text comparison doesn't
  either. Caught by `npm test` (`ai.test.mjs`, a `SyntaxError` three tests
  in: "does not provide an export named 'pubCompareDraft'"). Fixed by
  splitting them back onto two independently-`export`ed lines — which in
  turn makes this, and `idbDraftPut`/`commitImports` (an unrelated pair,
  same app.js-joined-line shape, where `idbDraftPut` moved to
  `ui/sheets.js` and `commitImports` stayed in app.js, with no way to
  rejoin them across files), two ACCEPTED, hand-verified
  `verbatim.mjs` exceptions in the final commit — the same class step
  11's `AUDIO_STRIP_H` already established, just two more instances of
  it. `node tools/split/verbatim.mjs HEAD` on the shipped commit reports
  exactly these two `lost`/`extra` pairs and nothing else.
- `openVoiceMenu`/`buildVoiceMenu`/`buildGameVoicePicker`/
  `buildSf2VoicePicker`/`saveVoices`/`renderSf2Nav`/`sf2AuditionPreset`/
  `renderGameInstNav`/`instAudition` — `ui/voice-menu.js`'s whole named
  content except the six pure label leaves — stay in app.js, permanently:
  `sf2AuditionPreset`/`instAudition` call `ensureAudio`/`resumeAudio`/
  `openMaster`/`instPlayer` directly (audition-on-open), the identical
  `audio/engine.js` permanent wall as `play` (next bullet) and as this
  thread's own line 5527 entry above already found for `ensureAudio`
  itself.
- **`play`/`stop`/the whole play-gate/album cluster (line 5499 above):
  now CONFIRMED permanent, not merely "needs steps 11 AND 14."** Both
  landed; `play` is still blocked, independently, by `ensureAudio`/
  `resumeAudio`/`openMaster`/`scheduleNote` — `ui/chrome.js` existing
  changes nothing for it. `updateChipBtn`/`playGateKick`/`playGateTick`/
  `playGateActive`/`chipRenderAuto`/`CHIPS`/`chipExt`/`chipVaultFile`/
  `chipSource`/`psfInflater`/`sonySeqCapture` were all tried in
  `ui/chrome.js` too (genuinely clean of `draw`/`setInfo`) and reverted
  for the same `ensureAudio` reason, one hop removed.
- **`finalizeNotes` (model/rollnotes.js's own central resolver) — tried,
  found blocked a SECOND, independent way, and reverted; this is the
  step's one real false step, not a near-miss.** A first scan said it was
  clean once `renderTrackbar`/`computeSongEnd` resolved; the real move
  surfaced that it ALSO calls `sfPreloadForSong`/`gamePreloadForSong`/
  `updateEditBtnVis` directly, and those reach `playGateKick`/
  `updateChipBtn` — the same chip-transport wall as `play`, above.
  `finalizeNotes` genuinely needs a layer-4 home (its `renderTrackbar()`
  call is real) but no existing `ui/*` file fits "the model's rollnotes
  resolver," and the chip-audio reach-through means even a correctly-filed
  layer-4 home wouldn't clear it. Its ~30 callers (annotation edits, chord/
  progression insert, clip paste/delete, Save As, fork, Ask's write tools,
  the Analyze adopt family) all stay in app.js unaffected. This also closes
  off, by inheritance, `saveTrackDir`/`renameTrack` (both call
  `finalizeNotes`) and — one further hop — `drGenerate`/`bsGenerate`/
  `applyTake`/`saveEdits`/`openDrummer`/`openBassist`/`drBuildControls`/
  `drRefresh`/`bsBuildControls`/`bsRefresh` (`saveEdits` → `
  scheduleAnalysisRecompute` → `finalizeNotes`) — all six drummer/bassist
  sheet functions were tried in `ui/sheets.js`, found blocked this way,
  and reverted together. Their own pure leaves (`drKitCountT`/`bsRange`/
  `drRange`/`segSet`/`drPartsGet`/`drPartsSet`/`drPartsSync`/
  `computeSongEnd`/`dpTick`/`undoTrackAdd`) did not call any of the ten
  and stayed in `ui/sheets.js`.
- `ui/wm.js`: every pure window-layout-math leaf moved; `wmLayoutAll` and
  everything that calls it (`wmCloseWindow`/`wmDockSide`/
  `wmSetSideModeFor`/`wmDockBottomWindow`/`wmFloat`/`wmSideDividerize`/
  `wmLayoutTabs`/`wmLayoutSide`/`wmOpenMenu`/`makeWindow`) stayed —
  `wmLayoutAll` calls `resize()` (now `ui/chrome.js`, same layer, legal)
  but is threaded through so many call sites that this builder left the
  cluster together rather than chase it; genuinely worth a focused re-try
  (NOT closed off the way `ensureAudio`/`finalizeNotes` are), flagged here
  rather than NIGHT-ROLL.md since it's a real TODO, not a settled finding.

**Three queued items above are now corrected by this step's actual
landing, not by the placeholder assumption each made:**
- Line 5405's entry (`platform/sw.js`'s service-worker `else` branch,
  `nativeOpenUrl`/`nativeOpenHook`): `setInfo` is now a real `ui/chrome.js`
  export. `platform/sw.js`'s one `setInfo` statement is a legal downward
  import away from moving (untouched this step — platform/ isn't ui/*'s
  row to claim). `nativeOpenUrl`/`nativeOpenHook` remain blocked
  regardless: `stop()` (permanent, play-gate wall) and `openPickedFiles`
  (blocked by `CHIPS`/`createComposition`, neither this step's business)
  are independent, unresolved reasons.
- Line 5429's entry (`saveEdits`/`loadEdits`/`saveDraft`/`draftWrite`/
  `draftRead`/`localDraftWrite`/`localDraftTracks`/`idbDraftPut` →
  "platform/storage.js... re-check again after step 14"): CORRECTED — none
  of these landed in platform/storage.js. `saveDraft`/`draftRead`/
  `localDraftTracks` landed in `ui/chrome.js`; `draftWrite`/
  `localDraftWrite`/`idbDraftPut` landed in `ui/sheets.js` (its
  `bsBuildControls`/`drBuildControls` siblings needed them, same shape as
  step 13's `songTitleOf`: the thematically obvious lower layer was never
  reachable — `setInfo`/`logErr` are layer 4 — so these went to the
  layer-4 file that actually needed them). `saveEdits`/`loadEdits` did NOT
  move: `saveEdits` is blocked by `finalizeNotes` (above), `loadEdits` was
  not re-checked this step (not named by anything that moved).
- Line 5840's entry (step 11's render-hub "PERMANENT" framing): corrected
  in full above and in NIGHT-ROLL.md's `render/roll.js` entry — read
  "PERMANENT" there as "permanent against `render/roll.js` specifically,"
  not absolutely.

**Tooling: a new, fifth `move.mjs`/`verbatim.mjs`-adjacent slip class,
distinct from the four steps 9–12 found (self-import, line-joining,
trailing-comment-misattachment, same-line multi-statement splits) —
a reverse move's new content silently vanishes if `regen-e2e-footer.mjs`
runs before the footer is repositioned.** `assembleTo()` always appends
new chunks after the EXISTING body; for `--to src/app.js` specifically,
app.js's body ends with the generated `// ---- e2e accessor mirror ----`
block, so the reverted function lands AFTER it. `regen-e2e-footer.mjs`'s
`stripFooter()` does `body.indexOf(FOOTER_MARKER)` and slices to EOF —
deleting the just-reverted content along with the stale footer, silently
(the file still parses; nothing errors until a later edit references the
now-missing name). Hit on every one of this step's several `--to
src/app.js` reverts; caught the first time by `grep`ing a known body
string against both files and finding it in neither. Worked around by
hand each time (cut the marker-through-`__nrExpose$` block to the true
EOF, reinsert there, strip the stale `export` keyword the reverse move
added, THEN regenerate) — flagged for a real `move.mjs`/
`regen-e2e-footer.mjs` fix (either tool could detect and correct the
ordering itself) rather than a per-callsite habit.

`node tools/split/verbatim.mjs HEAD` (several commits — one per file is
not quite right this step, since multiple files needed a second,
corrective pass after the first landing turned out partly wrong): clean
✔ on every commit after the fixups above. Sorted
`^\w+ = prof\("\w+"` set checked across the FULL src/ tree (not just
app.js, since several already-profiled names moved or round-tripped
through other files this step) — unchanged, 30 entries. `check.mjs`:
clean except `oldBpb` and the three real, permanent `../app.js` imports
named above (`ui/mixer.js`'s and `ui/trackbar.js`'s `saveTrackDir`,
`ui/trackbar.js`'s `openVoiceMenu`). `check-controls.mjs`/
`check-e2e-globals.mjs` clean, no allowlist growth. index.html's
modulepreload list, `sw.js`'s `APP_MODULES` (`nr-v19` → `nr-v20`), and
`devtools.js`'s namespace-import list all gained the 8 files;
`tests/modules.test.mjs`'s `checkSrc` fileCount bumped 54 → 62. `node
tools/package.mjs --out /tmp/nr-dist-s14`: 47 runtime modules
(unchanged). `main.js` was NOT attempted — app.js still has ~400
top-level names left (annotation/tombstone management, the whole
audio-chip-transport stack, the ask-chat run loop, provenance/publish
orchestration, every top-level wiring block by rule) — "app.js empties
into main.js" does not happen at step 14; app.js remains the legacy
container into step 15.

NOT pushed: the main session should browser-check every menu and sheet
that actually moved (track chips' M/S/H and +track/+audio/+drums, the
Mixer sheet's fader/pan/drag-reorder, the Notes list and Check-vs-file
UI, the note editor's chord widget and mic dictation toggle, the Jobs/
Settings/Share/Analyze sheets), wm docking (mostly a regression check —
the action functions didn't move), and phone width (a smoke check — this
step touched no layout CSS), before pushing and building.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 1: src/hooks.js + src/wire.js, upcall ports (docs/split-phase2-plan.md)

Done. `src/hooks.js` (layer 0): one-line forwarders — `setInfo`, `logErr`,
`logDebug`, `appConfirm`, `updateJobsBtn` — each reading `S.hooks.<name>`
and throwing `hook <name> not installed` if called before boot wires it.
`src/wire.js` (layer 5): `installHooks()`, the ONLY place a port's bare
name binds to its real body; `installHooks();` is `app.js`'s FIRST
top-level statement (right after its import block). `src/state.js` gained
`hooks: {}`. In `src/ui/chrome.js`, the five real bodies were renamed
`setInfoImpl`/`logErrImpl`/`logDebugImpl`/`appConfirmImpl`/
`updateJobsBtnImpl`, and the file imports the bare names back from
`../hooks.js` for its own internal call sites (unchanged text) — rule 10
(tools/split/check.mjs) exempts a port's own home file and app.js/main.js
from its "impl strictly above every caller" layer check, same reasoning
as rule 4/5's existing LEGACY_CONTAINER treatment. `src/app.js` switched
its five imports of these names to `./hooks.js`. `src/ui/sheets.js`/
`src/ui/note-editor.js` (same layer as `ui/chrome.js`, no port needed)
instead import `XImpl as X` directly from `./chrome.js` — a port only
legalizes a genuinely LOWER layer's upcall; same-layer imports were
already legal (§2.3) and the rule 10b/10c fixture test (tests/
modules.test.mjs) confirms a same-layer PORT caller is still flagged, by
design — only the import SPECIFIER changed for these two files, never the
call sites. `src/ui/controls.js` moved to layer 0 in `tools/split/
check.mjs`'s LAYERS table (it imports only `ui/icons.js`; no file move).

Two real `tools/split/check.mjs` rule-10 gaps found and fixed, both
documented in the rule's own comment: (a) `ruleHooksPorts` didn't exempt
the impl's own home file or app.js/main.js from its layer check, so the
very pattern the plan's own M1 code sketch asks for (chrome.js importing
its own port) and app.js's existing imports both failed; (b)
`ruleNoTopLevelPortCalls` has no app.js/main.js exemption (rule 4 does),
so dozens of app.js's listener/IIFE blocks — which only CALL a port
inside a deferred callback, never at module-evaluation time — were
flagged; both now skip app.js/main.js, matching rule 4's existing
reasoning exactly.

Three permanent blockers docs/split-plan.md's Deviations (7)/(8) found —
`ensureAudio`/`resumeAudio`/`rebuildAudio` (audio/engine.js),
`CHIPS`/`chipRender`/`chipSource`/etc. (audio/chip.js), `jobsNotify`
(model/jobs.js) — are dissolved by this step's ports (see this file's
three RESOLVED notes above, and NIGHT-ROLL.md's `hooks.js` module-map
entry); none of those names have moved yet — that's step 2.

Tests added (tests/modules.test.mjs): a port throws before
`installHooks()` runs (loaded in an isolated vm context, never through
`createApp()`); every port is installed, as a function, once the real
app boots; reassigning the bare port name (`run("setInfo = …")`)
intercepts every importer of the port — including the real `app.js`
caller — bypassing `ui/chrome.js`'s `setInfoImpl` entirely. Plus the
rule-10a/10b/10c/10d synthetic fixture tests (already part of step 0's
commit) kept passing.

`perl -e 'alarm 1200; exec @ARGV' npm test`: only `ps2-real`/`instruments`
fail (pre-existing local-rip-fixture gap). `node tools/split/check.mjs`:
clean except `oldBpb`. `check-e2e-globals.mjs`/`check-controls.mjs`
clean. `node tools/split/verbatim.mjs --hook setInfo,logErr,logDebug,
appConfirm,updateJobsBtn HEAD`: ✔. Sorted `^\w+ = prof\("\w+"` label set
unchanged (29 entries — none of these five names are profiled).
`npm run test:e2e:smoke`: 8/8. `index.html`'s modulepreload, `sw.js`'s
APP_MODULES (`nr-v20` → `nr-v21`), and `devtools.js`'s namespace-import
list all gained `hooks.js`/`wire.js`; `tests/modules.test.mjs`'s
`checkSrc` fileCount bumped 62 → 64 (66 with vendor/ai/web). `src/app.js`:
15054 → 15056 lines (2 new: the `installHooks` import + call).

Browser-check by the main session: none required for this step alone —
nothing user-facing moved; the real ear/eye check is step 2's (chip count
+ debug log, an NSF/SPC chip render, metronome).

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 2: audio engine + chip render + idbDraftPut + jobsNotify move down (docs/split-phase2-plan.md)

Done. `blockers.mjs <names> --to <file>` run before every cluster (per
this step's own instruction), real repo, not a fixture.

Moved clean, by `move.mjs --names` (one invocation per cluster):
`ensureAudio`/`resumeAudio`/`rebuildAudio` → `audio/engine.js` (now the
`logDebug`/`logErr`/`setInfo` port exists); `metStart` →
`audio/metronome.js` (needed `ensureAudio`/`resumeAudio` moved first);
`CHIPS`/`sonySeqCapture`/`psfInflater`/`PSX_SOUNDING_ON`/`chipExt`/
`chipEstimateTracks`/`chipCleanupAfterFailure`/`chipSource`/
`chipVaultFile`/`chipModules` → `audio/chip.js` (the `logErr` port
dissolves docs/split-plan.md's Deviations (8) `CHIPS` blocker — see
below for a `check.mjs` gap this specific move surfaced);
`chipStreamOpenWorker` → `audio/chip-stream.js` (needed the chip.js
cluster moved first, for `CHIPS`); `scheduleGameNote`/`gameVoiceWarn`/
`gameVoiceWarned`/`gameNoteBucket`/`gameNoteCache`/
`resolveVoiceInstrument`/`gameLibSync`/`sf2Sync` → `audio/voices.js`
(`gameVoiceWarned`, unlisted by the task, pulled along — `gameVoiceWarn`
needs it, same "load-bearing helper" pattern steps 4-6 established);
`idbDraftPut` → `platform/storage.js` and `jobsNotify` → `model/jobs.js`
— both FROM `ui/sheets.js`, not `app.js` (phase 1 misfiled them there;
NIGHT-ROLL.md's own `platform/storage.js`/`model/jobs.js` entries already
said so). `blockers.mjs`'s CLI hardcodes `--from src/app.js`, so these
two needed a different check: `move.mjs --dry-run` first, by hand —
both picked up `ui/sheets.js`'s own same-layer import alias
(`logErrImpl as logErr` / `updateJobsBtnImpl as updateJobsBtn`, both
`from "./chrome.js"`, step 1's own "same-layer callers don't need the
port" choice) and copied that relationship verbatim, landing an ILLEGAL
upward import into a layer-1/layer-2 file (`../ui/chrome.js`, layer 4).
Both hand-fixed to import from `../hooks.js` instead (the port, legal
from any layer) — move.mjs has no way to know a copied import relationship
needs re-deriving against the NEW file's own layer, since nothing about
that is wrong in general (it's only wrong because `--from`'s import was
itself a same-layer shortcut, not the port). Also by hand: `app.js`'s own
stale `import { idbDraftPut } from "./ui/sheets.js"` / `import {
jobsNotify } from "./ui/sheets.js"` (sheets.js doesn't export either name
any more, just re-imports it for its own internal use) — `check.mjs` rule
9 would have caught a wrong-but-still-exported specifier, but these two
were imports of a name that's ENTIRELY GONE from that file, which is rule
1 territory (an unresolved import) — caught by `check.mjs` immediately,
not silently.

**Two real `check.mjs` gaps found and fixed, both load-bearing for this
step specifically (neither was hit by any phase-1 step, since nothing
moved OUT of app.js's blanket rule-4/rule-10d exemption into a real module
with this shape before):**
- `isPureLiteralish` didn't recurse into object/array literals — `CHIPS`,
  a plain `{nsf: {...}, gbs: {...}, ...}` table of closures, moving out of
  app.js for the first time tripped rule 10d (a top-level initializer
  "calling" the `logErr` port) even though `CHIPS.usf.capture`'s own
  `logErr` reference is inside a closure that only runs when CALLED, same
  as the already-existing `FunctionExpression`/`ArrowFunctionExpression`
  cases right next to this one. Fixed: an `ObjectExpression`/
  `ArrayExpression` is pure-literalish when every property/element is,
  recursively — building the literal itself never executes anything.
- (Documented in step 1's own entry already, re-confirmed here on real
  content, not just app.js/main.js's listener blocks: `ruleHooksPorts`'s
  self-file and app.js/main.js exemptions, `ruleNoTopLevelPortCalls`'s
  app.js/main.js exemption — both held up against this step's real moves
  with no further gap.)

**A new, real permanent blocker this step's own moves surfaced — NOT
`logErr`/`CHIPS` related, not anticipated by this task's brief:
`chipRender`/`chipRenderInWorker`/`chipPublish` (audio/chip.js) and
`chipStreamOpen`/`chipRenderAuto` (audio/chip-stream.js) all call
`songTitleOf` (`ask/context.js`, layer 4) directly** — `chipRender`/
`chipRenderInWorker`/`chipStreamOpen` each for a `logDebug` status line
naming the open song; `chipPublish` because `chipRender` passes debug
info through it; `chipRenderAuto` because it calls both. An illegal
upward import from `audio/chip.js`'s/`audio/chip-stream.js`'s layer 3,
and no port covers `songTitleOf` — it isn't one of step 1's five, and
isn't named by any later H step in docs/split-phase2-plan.md's table
either. All five stay in app.js, now importing `CHIPS`/`chipSource`/
`chipEstimateTracks`/`chipVaultFile`/`chipCleanupAfterFailure`/
`chipStreamOpenWorker`/etc. back from `audio/chip.js`/`audio/
chip-stream.js` unchanged. Flagged here, not silently retried: whoever
next considers this needs either a `songTitleOf` port (a sixth name for
`hooks.js`, own H commit) or to accept these five as this app's actual
render-entry-point home staying in app.js indefinitely.

`perl -e 'alarm 1200; exec @ARGV' npm test`: two NEW real-repo breaks this
step's moves caused, both fixed (not pre-existing, not the known
`ps2-real`/`instruments` gap):
- `tests/package.test.mjs`'s own CHIPS-list scan read `src/app.js` by
  name (hardcoded) for the `files:`/`shared:` module lists `CHIPS`
  carries — empty once `CHIPS` moved out. Fixed to use
  `tests/harness.mjs`'s `appSource()` (the whole src/ tree concatenated,
  §3.3 — built for exactly this).
- `tools/package.mjs`'s `chipTableModules()` had the SAME hardcoded
  `src/app.js` read — a real packaging-tool bug, not just a test one
  (the shipped iPad/Pages bundle would have silently stopped including
  `tools/sounding.mjs`/`tools/note-preview.mjs`/etc.). Fixed the same way,
  walking all of src/ instead of reading one file.
Both fixes are general (scan the tree, not a path), so neither breaks
again the next time a step moves CHIPS (or anything else `files:`/
`shared:`-shaped) to a different file.

After both fixes: only `ps2-real`/`instruments` fail (pre-existing).
`node tools/split/check.mjs`: clean except `oldBpb`
(`regen-e2e-footer.mjs --file src/app.js` re-run after EVERY move this
step made — a move that turns a declaration into an import without a
footer re-run left 4 stale rule-2 "assignment to imported binding"
findings the first time, from the generated `__nrExpose$`'s own two-way
accessor still trying to SET names that are imports now; caught
immediately, not shipped). `check-e2e-globals.mjs`/`check-controls.mjs`
clean. Sorted `^\w+ = prof\("\w+"` label set unchanged (29 entries — none
of this step's names are profiled). `npm run test:e2e:smoke`: 8/8.
`src/app.js`: 15056 → 14485 lines (571 out — well under the plan's
~1,100 estimate, because `chipRender`/`chipRenderInWorker`/`chipPublish`/
`chipStreamOpen`/`chipRenderAuto`, among the largest functions in the
cluster, all stayed).

**A fourth same-shape `verbatim.mjs` false alarm, same class docs/
split-plan.md's Deviations (11) found for `AUDIO_STRIP_H` ("a genuinely
unfixable… same-line, multi-statement split") — two instances this time,
both hand-verified, neither fixed in the tool (same reasoning: a line-
level differ has no concept of a physical line holding two unrelated
statements, only one of which moved).** `const PSX_SOUNDING_ON = false;
const HOLD_MS = 160;` was one original physical line; `PSX_SOUNDING_ON`
moved to `audio/chip.js`, `HOLD_MS` (+ its trailing comment) stayed —
`node tools/split/verbatim.mjs HEAD` reports one `lost`/two `extra` for
it, same as `AUDIO_STRIP_H`. ` if (typeof document !== "undefined" &&
document.addEventListener) document.addEventListener("touchstart", () =>
{}, {passive: true}); function ensureAudio() { // one context…` was
ALSO one original physical line (a top-level touchstart listener and
`ensureAudio`'s own declaration, sharing a line) — `move.mjs`'s cut left
the touchstart half joined onto the FOLLOWING statement instead
(`document.addEventListener("visibilitychange", …)`, a separate top-level
listener that happened to sit right after `ensureAudio`'s closing brace)
— the line-joining bug docs/split-plan.md's Deviations (9)-(11) already
named, hit here for the first time on a function (not a `prof()` wrap).
Hand-fixed: split back onto two lines, nothing else touched. Confirmed by
hand, token-by-token: `const PSX_SOUNDING_ON = false;` reappears verbatim
in `audio/chip.js`, `const HOLD_MS = 160;` (+ comment) in app.js; the
touchstart statement is its own line in app.js, `export function
ensureAudio() { // one context…` (same comment) in `audio/engine.js`.
Nothing lost either time — flagged here as the precedent `AUDIO_STRIP_H`
already set, not reopened as a tooling task.

Browser-check by the main session (plan §3): ⚠ chip count + debug log,
an NSF/SPC chip render, and the metronome — `ensureAudio`/`resumeAudio`/
`rebuildAudio`/`metStart`/the whole `CHIPS` table moved file, byte-
identical, but this is exactly the audio-session code the plan's own
"AUDIO IS FRAGILE" guardrail (docs/split-plan.md §5) singles out for a
real device/browser check regardless.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 3: render/chrome/session upcall ports + songTitleOf (docs/split-phase2-plan.md)

Done. Sixteen ports (§1 M1's recipe, one H commit, no code moved — only
renamed `XImpl` in place + rewired imports): `draw`, `playbackFrame`,
`clampView`, `updateSongBtn`, `updateSyncBtn` (home: `ui/chrome.js`);
`buildScoreModel` (home: `render/score.js`); `songTitleOf` (home:
`ask/context.js` — step 2's own `chipRender`/`chipRenderInWorker`/
`chipPublish`/`chipStreamOpen`/`chipRenderAuto` blocker); `fitView`,
`renderTrackbar`, `updateEditBtnVis`, `updateChipBtn`, `updateSubtitle`,
`askRender`, `finalizeNotes`, `recFinish`, `albumAdvance` (home: `app.js`
itself — the body stays, renamed + exported, so `wire.js` imports the
`*Impl` straight from `app.js`, a circular import with `app.js`'s own
`import { installHooks } from "./wire.js"` that's safe because every name
is a hoisted function declaration, identical in shape to the `app.js`↔
`wire.js` cycle step 1 already relies on).

Importers re-pointed by the rule the task stated: a caller whose own layer
is BELOW the impl's routes through `hooks.js` (the only legal path);
a caller at or above the impl's layer (same tier, or legally reading
downward already) uses `XImpl as X` directly from the impl's file instead
— `ui/sheets.js`/`ui/note-editor.js` (same `ui` tier as `ui/chrome.js`,
plus `ui/sheets.js` reading down into `render/score.js`/`ask/context.js`,
both already-legal downward imports) and `ask/bridge.js`/`ask/sheet.js`
(same `ask` tier as `ask/context.js`) all got the alias form; `ui/chrome.js`'s
own `songTitleOf` import (same `ask`/`ui` tier, both layer 4) did too.
`app.js`'s existing imports of the five `ui/chrome.js`-homed names plus
`buildScoreModel`/`songTitleOf` switched from their old home files to
`./hooks.js` (the home file no longer re-exports the bare name once
ported — this is true regardless of app.js's own layer, so it isn't an
exception to the rule above, just a consequence of where the bare name
actually lives now). Nine brand-new `import { X } from "./hooks.js";`
lines added to `app.js` for the names whose impl stayed there — needed so
`app.js`'s OWN internal bare-name call sites (`finalizeNotes` calling
`renderTrackbar()`/`fitView()`/`updateEditBtnVis()`; `renderTrackbar`
calling itself recursively plus `buildScoreModel()`/`clampView()`/
`draw()`; `updateEditBtnVis` calling `updateChipBtn()`; etc. — all
UNCHANGED call-site text) still resolve. Two same-file self-imports, same
pattern step 1 set for `ui/chrome.js`'s original five: `ui/chrome.js`
imports `draw`/`updateSongBtn`/`updateSyncBtn` back from `../hooks.js`
(for `resize()`'s `draw()` and `saveDraft()`'s `updateSongBtn()`/
`updateSyncBtn()` calls); `ask/context.js` imports `songTitleOf` back from
`../hooks.js` (for `askViewCursorLine`'s own internal
`songTitleOf(S.songKey)` call).

One pre-existing same-name-property wrinkle, checked and confirmed
harmless: `updateChipBtn.warned` (a per-song memoization flag, read/
written only by the sibling, non-renamed `updateChipBtnInner`) now hangs
off the `hooks.js` forwarder's function object instead of the impl's —
every reference resolves to the same singleton import, so this is
behaviorally identical, not a logic change.

`node tools/split/regen-e2e-footer.mjs --file src/app.js` re-run — the
nine app.js-resident names' setters in the generated `__nrExpose$` would
otherwise try to assign to now-imported bindings (rule 2), the identical
"a move that turns a declaration into an import" gotcha step 2 hit, here
from a rename rather than a move. After regen, the nine `*Impl` names get
two-way accessors and the bare names drop out of the footer entirely (an
import, not a declaration — `declaredNames()` returns `[]` for
`ImportDeclaration`), matching step 1's `setInfo`/etc. precedent.

Two real-repo tests in `tests/modules.test.mjs` updated (expected,
task-authorized test maintenance, not a new break): the "every port
throws"/"installHooks() installs" tests grew from the original five names
to all 21; the step-2-era negative test asserting `chipRender -> audio/
chip.js` is blocked BY `songTitleOf` now asserts the opposite (dissolved —
only `chipRenderInWorker`/`chipPublish`, chipRender's own still-in-app.js
siblings, remain, and that's a "move together" situation, not permanent).
Two tests added per plan §3's own list: a port-before-install throw test
(folded into the all-21 loop); a NEW rebinding test for `draw` (sets
`S.sceneValid = true`, reassigns the bare `draw` port, confirms the real
`drawImpl` — which unconditionally sets `sceneValid = false` — never ran).

`perl -e 'alarm 1200; exec @ARGV' npm test`: only `ps2-real`/`instruments`
fail (pre-existing, missing local rips). `node tools/split/check.mjs`:
clean except `oldBpb` (Q6). `check-e2e-globals.mjs`/`check-controls.mjs`
clean. `node tools/split/verbatim.mjs --hook setInfo,logErr,logDebug,
appConfirm,updateJobsBtn,draw,playbackFrame,clampView,fitView,
buildScoreModel,renderTrackbar,updateEditBtnVis,updateChipBtn,
updateSongBtn,updateSyncBtn,updateSubtitle,askRender,finalizeNotes,
recFinish,albumAdvance,songTitleOf HEAD`: ✔, zero lost/extra. Sorted
`prof("…")` LABEL set unchanged (29 — the renamed bindings keep their
original label strings). `npm run test:e2e:smoke`: 8/8. `node
tools/package.mjs --out`: 181 files, unchanged (no file added/removed).
`src/app.js`: 14486 → 14495 lines (+9, new hooks.js import lines only —
no code moved this step).

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 4: transport/voices/clips mostly blocked; chip render + chip-stream cluster moves (docs/split-phase2-plan.md)

Done, with almost the entire named scope staying in app.js — documented,
per this step's own instruction ("leave anything still blocked"), not
silently retried. `blockers.mjs` run against every named cluster FIRST,
real repo, before any move:

- `play`/`stop`/`playGate`/`playGateKick`/`playGateTick`/`playGateActive`/
  `playGateWait`/`buildSchedule`/`renderSongOffline`/`audioChaseNow` →
  `audio/transport.js`: 45 still-in-app.js closure names (the whole album
  system, sf/game/instrument preload machinery, the tombstone/undo
  helpers, `scheduleClip`/`stretchEnsure*`) plus 5 illegal-layer imports —
  `recOpenEnded` (`input/record.js`), `srAnnounce`/`scheduleBackupFlush`
  (`ui/chrome.js`), `computeSongEnd` (`ui/sheets.js`), `setAnchorBQ`
  (`ui/note-editor.js`), all layer 4.
- `scheduleNote`/`previewNote`/sf+game preload+wait → `audio/voices.js`:
  37 closure names (the same play-gate/instrument-preload web) plus 2 of
  the same illegal-layer imports (`recOpenEnded`/`srAnnounce`).
- `scheduleClip`/`stretchEnsure(All)`/`applyAudioDirs`/`audioEnsureFile`/
  `applyBeatMap`/`setSongTempo`/`writeClips`/`setClipDir`/`splitClipAt`/
  `deleteClip` → `audio/clips.js`: checked individually, not just as a
  block — every one of the ten comes back blocked, the smallest
  (`writeClips`/`setClipDir`/`splitClipAt`/`deleteClip`) by
  `annoSnapshot`/`tombstone`/`saveLocalNotes`/`buildSchedule` plus 3 of the
  illegal-layer imports (`setAnchorBQ`/`computeSongEnd`/
  `scheduleBackupFlush`), the larger ones pulling in the whole
  transport/play-gate web on top.

None of the five illegal-layer imports (`recOpenEnded`, `srAnnounce`,
`scheduleBackupFlush`, `computeSongEnd`, `setAnchorBQ`) are covered by any
existing port, and none are named by docs/split-phase2-plan.md's table for
one — adding a port for any of them would be a new H commit this step's
own scope ("step 4 = M commit(s)") doesn't authorize. This is the exact
shape docs/split-plan.md's phase-1 Deviations (7)/(8) already found for
this same code (`play`/`stop`/play-gate "did NOT move, almost entirely");
step 3's ports didn't touch any of these five names, so nothing new
cleared here. All three clusters stay entirely in app.js, bit-for-bit.

**What step 3's `songTitleOf` port DID unblock, exactly as it was designed
to**: `blockers.mjs chipRender,chipRenderInWorker,chipPublish --to
src/audio/chip.js` came back clean (per step 2's own writeup, `songTitleOf`
was their only blocker) — moved by name, verbatim. That immediately
cleared `chipStreamOpen`/`chipRenderAuto --to src/audio/chip-stream.js`
too (their remaining blocker was `chipRender`/`chipRenderInWorker`/
`chipPublish` themselves, now real same-layer imports from the just-moved
`audio/chip.js`) — moved the same way, same commit. `chipRender`/
`chipRenderInWorker` now import `songTitleOf` from `../hooks.js` for their
`logDebug` status line; `chipPublish` needed no direct import (it only
receives `chipRender`'s debug string through); `chipRenderAuto` now
imports `chipRender` from `./chip.js` instead of a bare app.js reference.

`node tools/split/regen-e2e-footer.mjs --file src/app.js` re-run. One
real-repo test in `tests/modules.test.mjs` updated (expected — the
step-3-era test asserted this exact cluster was STILL blocked by
`chipRenderInWorker`/`chipPublish`; now that step 4 actually moved them,
the correct assertion is that all five report clean, with
`blockers.mjs` finding nothing to chase at all — not even an empty
closure — because none of the five is declared in app.js any more, same
shape the pre-existing `chipSource` test already established).

`perl -e 'alarm 1200; exec @ARGV' npm test`: only `ps2-real`/`instruments`
fail (pre-existing). `node tools/split/check.mjs`: clean except `oldBpb`.
`check-e2e-globals.mjs`/`check-controls.mjs` clean. `node
tools/split/verbatim.mjs HEAD`: ✔, zero lost/extra — no exceptions
needed (a clean `move.mjs --names` move, not a rename, so nothing for
`--hook` to tolerate and nothing hand-verified). Sorted `prof("…")` LABEL
set unchanged (29 — none of the five moved names are profiled). `npm run
test:e2e:smoke`: 8/8. `node tools/package.mjs --out`: 181 files, unchanged
(no file added/removed — `audio/chip.js`/`audio/chip-stream.js` already
existed). `src/app.js`: 14495 → 14275 lines (220 out, well under the
plan's ~1,150 estimate — almost the entire transport/voices/clips cluster
stayed put).

Browser-check still needed by the main session (plan §3, narrowed to what
this step actually touched — see Q9 above): a chip song (NES + one
streamed console) and note preview (chip fallback). The rest of plan §3's
step-4 ear-check list (synth, SF2, game voice, clip at 0.5×, album
auto-advance) is unaffected — that code never moved.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 4c: the transport/voices/clips cluster is out (docs/split-phase2-plan.md)

Seven M commits, all verbatim (`verbatim.mjs <sha>` ✔ each, zero
exceptions), finishing what steps 4/4b left. The 50-name closure
blockers.mjs reported was not one knot: 28 names hang off a 22-name
strongly-connected core one way only, so they moved as their own
commits around it — title-order helpers → `model/catalog.js`; the
instrument-library loaders + `gameVoicesInSong`/`sf2VoicesInSong`/
`resolveGameVault` → `audio/voices.js`; `albumStrip` → `audio/
transport.js`; THEN the core in one commit (`scheduleClip`/
`stretchEnsure*`/`audioChaseNow` → clips; `scheduleNote` + sf/game
preload+wait → voices; play gate + `play`/`stop` → transport; one
import-line hand fix, `playGateKick` from `../app.js` → `./transport.js`);
then `previewNote` → voices, `applyAudioDirs`/`audioEnsureFile`/
`applyBeatMap`/`setSongTempo` → clips, and `renderSongOffline`/
`offlineWaitForAssets` → `audio/bounce.js` (split-plan §1's "offline
render" row, not the phase-2 table's transport guess). No new port, no
logic edit, Learning-mode gates untouched. Checks per commit: check.mjs
clean except `oldBpb`, e2e-globals/controls clean, prof label set
unchanged (29), footer regenerated. Group: `npm test` under alarm 1200 —
only ps2-real/instruments fail (pre-existing); smoke 8/8; package 181
files, list identical. `src/app.js`: 14179 → 13343 (836 out).

Device check owed — Q9 (the FULL step-4 ear list now: synth, SF2, game
voice, NES + one streamed console, clip at 0.5×, note preview, album
auto-advance, metronome). This is the known-good iPad engine moving file;
build, listen, revert on the first mute.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 5: model/gen down (docs/split-phase2-plan.md)

Eighteen commits (14 M, 3 H carrying 4 ports), all verbatim-checked.
Re-homed first, so the clusters could reach layer 2: `isDirective`/
`isCopyableAnno`, `setEndBQ`/`dropSupersededBy`/`dropLocalKeyAt`,
`notesTxtFor`/`declaredTsForKey` → model/rollnotes.js; `snapBeat` →
model/grid.js; `undoTrackAdd` → model/edits.js; `draftWrite`/
`localDraftWrite`, `saveDraft`/`retireOldOverlay`/`draftRead`/
`localDraftTracks`/`filesMirror`/`filesMirrorSoon`/`filesMirrorFor` →
model/versions.js (phase 1 step 14 had parked them in ui/*);
`transposeChordLabel` → theory/chords.js. Ported (hooks.js 24 → 28):
`updateSongMeta`, `lassoedAnnos`, `drumStep`, `annoInLasso`. Then the
clusters: `saveEdits`/`loadEdits`/`foldOldOverlay` → model/edits.js;
26 selection mutators → model/selection.js; `scheduleAnalysisRecompute`
+ `adopt*` → gen/analysis.js; `drGenerate` → gen/drummer.js;
`bsGenerate`/`applyTake` → gen/bassist.js; `moveClip`/`trimClip`/
`splitSelectedClipAtCursor` → audio/clips.js. check.mjs clean except
`oldBpb` throughout (rule 10 caught one wrong port use — fixed with the
downward Impl alias); prof set 29 unchanged; `npm test` under alarm
1200 — only ps2-real/instruments fail (pre-existing); modules 86/86;
smoke 8/8; package 181 files unchanged. `src/app.js`: 13343 → 12139.

Device check owed before shipping (plan §3 step 5): edit/undo,
quantize/split/join, copy/paste, a drummer/bassist take on a SCRATCH
song — and, since saveDraft/saveEdits/draftWrite changed file, one
real-browser edit → reload → compare on a scratch local song
(persistence needs a device test). Verbatim moves, but that rule exists
because of 6ad5eee.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 6: src/session/{song,album,files}.js (docs/split-phase2-plan.md)

Seven commits, verbatim-checked. Four re-homes first (`annotationsFor`/
`subtractTombstones`/`mergeLocalAdditions`/`resolveNoteWith`/`bakeTempos`/
`bakeMeter` → model/rollnotes.js; `draftFingerprint` → model/versions.js;
`cmpBar` → ui/chrome.js; `syncDurSeg` → ui/note-editor.js), then the
three new layer-4 files: song.js (finalizeNotesImpl, loadNotes, loadSong*/
setSong, openDraft*, fitViewImpl, updateSongMetaImpl, rememberRecentSong,
reflectSongURL), album.js (the run sequencer), files.js (saveSongAs,
openSaveForm + folder picker, saveVersion, forkCurrentSong,
renameLocalKeys). `revertSongToRepo`/`moveComposition` stay — held by the
sync/publish web (step 8). Manifests all updated (SW_VERSION nr-v21 →
nr-v24; fileCount 64 → 67). check.mjs clean except `oldBpb`; prof set 29
unchanged; `npm test` under alarm 1200 — only ps2-real/instruments fail
(pre-existing); modules 86/86; smoke 8/8; package 181 → 184 files (the
three session files only). `src/app.js`: 12139 → 11331.

TOOLING GAP (move.mjs, found this step; RESOLVED by step 7's step 0 addendum, below): `profWrapName` matches only
`X = prof("X", X)`. A port body renamed in step 3 keeps its label —
`finalizeNotesImpl = prof("finalizeNotes", finalizeNotesImpl)` — so the
wrap line is NOT carried with the function and is left in app.js
assigning to an import (a TypeError at module eval, caught by node
--check/check.mjs only indirectly). Hand-moved this time. Fix before
step 7 moves `renderTrackbarImpl`/`updateSubtitleImpl`/`drawImpl`/
`playbackFrameImpl`/`buildScoreModelImpl`: accept `XImpl = prof("X",
XImpl)` (identifier = declared name, label = name minus `Impl`).

Device check owed (plan §3 step 6): load, draft, Save As, fork, revert —
scratch songs only.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 7: the ui/ homes filled (docs/split-phase2-plan.md)

Nine M commits, verbatim-checked (plus a step 0 addendum first: move.mjs
carries `XImpl = prof("X", XImpl)` — the TOOLING GAP step 6 logged above
is RESOLVED, two fixture tests). In order, each blockers.mjs-clean on its
own: chrome leaves + three port impls (`songRegionRight`, `placeLassoBtn`,
`toggleHl`, `updateLCD`, `updateEditBtnVisImpl`/`updateSubtitleImpl`/
`updateChipBtnImpl`) → ui/chrome.js; `renderNoteList`/`openNoteList`/
`updateChordStale`/`useFileKey` → ui/notes.js; the Instruments sheet web
(13 names) → ui/sheets.js; the drummer/bassist sheets → ui/sheets.js;
the wm actions (11) → ui/wm.js; `trackToggle`/`saveTrackDir`/`saveVoices`/
`renameTrack` → ui/trackbar.js; the Mixer (6) + `reorderTrack` →
ui/mixer.js; the voice menu + pickers + clip controls (14) →
ui/voice-menu.js; `renderTrackbarImpl` → ui/trackbar.js. No new files
(manifests, SW_VERSION, fileCount unchanged). Rule 10 bit on every ui/*
commit but one — each hooks.js port import move.mjs copied for an impl at
layer ≤ 4 became the `XImpl as X` alias; that is now the rule for every
layer-4 move. check.mjs clean except `oldBpb`; prof set unchanged; `npm
test` under alarm 1200 — only ps2-real/instruments fail (pre-existing);
modules 88/88; smoke 8/8; package 184 files, identical. `src/app.js`:
11331 → 9360.

Browser check owed (plan §3 step 7): chips M/S/H, voice audition (game +
SF2 pickers), mixer (fader/pan/reorder), wm dock/float/close + the window
menu, phone width. Not iPad-audio-engine code, but the voice menu's
audition path (sf2AuditionPreset/instAudition) moved file — one ear check
on a game voice pick is cheap insurance.

## QUEUED (built on a worktree branch, not merged/pushed yet) 2026-10-04 — module split phase 2 step 8: import + sync out (docs/split-phase2-plan.md)

Twelve M commits, verbatim-checked, no new files, plus one harness
commit (below). Unblockers first
(folder-tree walks → model/catalog.js; tombstone maintenance →
model/edits.js; `jobsLoad`/`jobStart`/`jobsClearFinished` → ui/sheets.js
beside `jobApi`; `cmpEnter`/`cmpExit`/`cmpShow` → ui/chrome.js;
`askSave`/`askCommitLog` → ask/bridge.js; `createComposition` + the
make-it-mine trio → session/files.js; `updateManifest`/`manifestPlace` →
sync/publish.js; the import leaves and the File-menu shell), then the
chip capture/commit cluster → import/capture.js, the sync web in ONE
commit of three invocations (publish family → sync/publish.js; the sync
sheet → ui/sheets.js; `revertSongToRepo`/`moveComposition` →
session/files.js — a layer-4 cycle, legal), and last the Import hub
(`openPickedFiles`, `importAudioFiles`, m3u, `fsub*`) → import/hub.js.
check.mjs clean except `oldBpb`; prof set unchanged; `npm test` under
alarm 1200 — only ps2-real/instruments fail (pre-existing); modules
89/89; smoke 8/8; package 184 files, identical. `src/app.js`: 9360 →
7457. Steps 7 + 8 together: 11331 → 7457.

HARNESS FINDING (fixed, own commit): `run("appConfirm = …")` rebinds
hooks.js's port, but rule 10 makes a layer-4 caller import `appConfirmImpl
as appConfirm` directly, so the stub never reached import/hub.js and the
real confirm sheet hung the m3u test (208 tests cancelled behind it).
tests/harness.mjs now rebinds `<name>Impl` with the port; fixture test
added. DECISION for the main session to veto: the harness, not rule 10 or
16 tests, was changed - see the plan write-up. The devtools window mirror was NOT
changed - grepped tests/e2e/: no Playwright test stubs `appConfirm` or
`S.hooks`, so nothing to add there.

Device check owed (plan §3 step 8): an NSF import into scratch, a publish
to scratch; plus one revert and one discard-pending on a scratch song
(`revertSongToRepo`/`discardPending` moved file). Never his compositions.

Next in the plan: step 9 (ask/*: askRun, askSend, askContext, askRunTool,
askResume*, askFinish/Fail/Landed, ask*Annotation, askWriteNotes — and
`askRenderImpl`, the last port body still in app.js besides
`recFinishImpl`), step 10 (input/*), step 11 (the remainder by
blockers.mjs), step 12 (the ~320 top-level statements → init functions).


## QUEUED 2026-10-04 — DAW inventory shortlist (Josh, Terminal #104; docs/daw-inventory.md)
1. ~~Playhead tag inside the strip, triangle gone (Roll/Tracks/Score) — S~~
   DONE 2026-10-04 (built on a worktree branch off main, not the split
   branch; NIGHT-ROLL.md "Playhead tag"). Eyeball on device: tag colour
   against the panel, phone width, Score view, mid-play drag.
2. Keyboard: fixed key width, Play/Scroll segment, two-finger scroll, ‹ › octave + range readout, off-screen lit-key chevrons — M
3. Keyboard look (black-key offsets, rounded whites) + Sustain — S
4. Touch-and-hold a note → edit menu; three-finger undo/redo — S–M
5. Capture MIDI (keep the last ~60 s; "Keep that") — M
6. Velocity lane — M
7. Typed bar jump in the LCD; drag a cycle's middle to move it — S
8. Score → PDF/print — M
Build after the module-split branch merges (they touch render/input code the split is moving).

## QUEUED 2026-10-04 — Game Boy Tetris: Korobeiniki missing from our capture (Josh, Terminal #107–108)
Josh found Korobeiniki in a Game Boy OST on YouTube, not in our Game Boy › Tetris album (17/17 GBS tracks captured; rip header "Tetris v1.0", Hirokazu Tanaka). Interval search (E B C D C B A A C E, any key, repeats collapsed) over every channel of every GB/NES Tetris capture: found ONLY in NES › Tetris (Bullet-Proof Software) track-01. "A-Type Music (version 1.1)" is a real, different song (Josh confirmed). Next: fetch another GB Tetris rip (Zophar GBS/m3u) and compare track lists/lengths — rip lacks it vs our capture garbled a track.

## QUEUED 2026-10-04 — keyboard: stretch keys when the whole piano fits
On a very wide window (3440 px) all 52 whites at 44 px take 2288 px and the panel's right third is empty. When the full range fits, widen the keys to fill (keep 44 px as the minimum). Small; main's src/app.js instGeom / ui/piano.js pianoKeyW.
## QUEUED (built on a worktree branch `finish`, not merged/pushed yet) 2026-10-04 — module split phase 2 steps 11–13: app.js is GONE (docs/split-phase2-plan.md)

Branch `finish` (off `origin/module-split`), 39 commits: a third step 0
addendum, 11 step-11 commits (every remaining declaration out of app.js —
zero left), 25 step-12 commits (every top-level statement → one of 66
`init<Module><N>()` functions at its original spot; two new files,
ui/perf.js and platform/sw.js; the boot IIFE → session/boot.js `boot()`),
2 step-13 commits (src/app.js deleted; src/main.js = `installHooks();` +
the 66 init calls in the original order + `boot();` + the devtools gate;
LEGACY_CONTAINER, the harness legacy path and the e2e footer generator
retired; doc sweep). Every M commit `verbatim.mjs` ✔; every L commit ✔ with
the init tolerance; the one non-move commit (step 13's deletion) reports
exactly the deleted devtools footer-mirror block, nothing else. New test:
tests/boot-order.test.mjs — main.js's expanded top-level statement
sequence equals the 328-statement snapshot captured before the first init
move (tests/split-fixtures/boot-order.txt), statement by statement, and
did at every commit after the addendum that added it. check.mjs: no exemptions left, one
finding (`oldBpb`, now model/rollnotes.js — the known pre-existing bug,
Q6). `npm test` under alarm 1200 after each step: only ps2-real (4) +
instruments (13) fail (the local-rip gap); smoke 8/8 after each step;
package 188 → 191 files (+ session/boot.js, ui/perf.js, platform/sw.js)
→ 190 (− app.js), reachability guard green. Full accounting:
docs/split-phase2-plan.md's step 11/12/13 write-ups; NIGHT-ROLL.md's
Module map now opens with the finished state.

MORNING CHECKLIST — every browser/device check owed across phase 2 steps
4c–13 (each step's write-up lists it; this is the one list). None of
these steps changed logic — every commit is a verbatim move — so each
check is "it still works", not "it works differently":

- iPad ear check (steps 4/4c — THE engine moved file; iPad mute → revert
  first): synth, SF2, game voice, NES + one streamed console, clip at
  0.5×, note preview, album auto-advance, metronome. (= Q9.)
- Edits (step 5): edit/undo, quantize/split/join, copy/paste, a drummer
  take + a bassist take; and a real-browser edit → reload → compare on a
  scratch local song (saveDraft/saveEdits/draftWrite moved file).
- Song lifecycle (step 6): load, draft, Save As, fork, revert — scratch only.
- UI (step 7): chips M/S/H, voice audition, the Mixer, wm dock/float/close,
  phone width.
- Import/sync (step 8): an NSF import into scratch, a publish to scratch,
  one revert and one discard on a scratch song (never his compositions).
- Ask (step 9): an Ask tool run (write_notes) + a resume, the ✦ open, a
  Terminal-tab send.
- Input (step 10): a roll tap/drag/lasso/pinch, a Score pencil + erase,
  the playhead-tag drag (all three views), a keyboard glissando +
  two-finger scroll + Sustain + ‹ › + lock + chevrons, one ● record take
  from the keyboard, the cof drag.
- Boot + wiring (steps 12–13): a cold boot on Pages and on the iPad
  (offline relaunch too — SW_VERSION went nr-v28 → nr-v32), `?perf=1`
  (HUD + ⏺ report), `?sw=0`, Learning vs Normal (estimateKey never called
  in Learning), and — because every listener in the app re-attached from
  a different file — one pass over each sheet's open/close/Esc/drag and
  the File ▾ / View ▾ / Edit ▾ menus, the metronome sheet, the Settings
  sheet (folder pick, text size), Share.
- Step 2's (still owed): the ⚠ chip count + debug log, an NSF/SPC chip
  render.
