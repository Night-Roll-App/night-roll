# Night Roll — Technical Reference

The complete map of the player (`index.html`) for anyone (especially future
Claude sessions) continuing work. User-facing feature list also lives in the
in-app help sheet (? button). History: git log tells the build story.

Live: https://joshcough.github.io/night-roll/ (GitHub Pages, main
branch, root). Single file app + `vendor/vexflow.js`. No build step —
git push is deployment (~1 min propagation; iPad may need a hard reload).

Tests: `make test` (runs `node --test tests/*.test.mjs` — zero deps, Node's
built-in runner). `make serve` hosts the app at localhost:8000 (fetch needs
http, so file:// won't work). `tests/harness.mjs` extracts the inline `<script>` from index.html
and runs it in a vm with a stub DOM, so the app stays one file. Covers the
pure logic: MIDI parse, rollnotes parse/serialize round-trip, key math,
chord namer, duration decomposition, tempo maps, edit persistence. Run them
before committing player changes; add cases when touching that logic.
Shipping a feature means THREE writes: the code, its help-sheet entry,
and a keyword in the help drift-guard test ("help sheet covers every
shipped feature") — the guard fails the suite when help silently lags
the app, which happened to the key dial (2026-08-15 audit).
(2026-07-31 review verdict, second-opinioned: keep single-file until ~4–5k
lines — splitting adds Pages cache-skew risk for no payoff at this size.)

## Feature inventory

**Views:** piano roll (canvas) and engraved score (VexFlow → per-measure
cached canvases), toggled in the header, persisted. On song load the roll
auto-fits the whole song and its pitch range to the screen (fitView). Both share one
time-linear x-axis, the bar ruler, sections, markers, cursor, playhead,
subtitles, and gestures. Pinch zooms per axis (horizontal = time; vertical
= pitch rows, roll only). Roll zoom-out clamps to the song's own extents
(2026-08-07, Josh's spec): per-axis floors (pxqFloor/rowHFloor) flush to
the chop-trimmed bars and sounding pitch range, no padding — once time
fits, pinch-out only reveals pitch; once everything fits, it stops, and
the view snaps flush. fitView lands on the same floors, so the load view
IS the zoom-out limit. Score extras: intro column (clef/key/time) left
of bar 1; signatures redraw at key changes with cancellation naturals;
rests break beams; playhead/cursor interpolate notehead-to-notehead
(scoreTickToX), hopping glyphs only at key changes; zoom-out floor
computed from the densest measure (scoreModel.pxqMin — relaxes when dense
tracks are muted).

**Playback:** WebAudio. Pulse/pulse/triangle voices by track index; drum
tracks (name match or channel 10) get a synthesized kit. Per-track gain
nodes make mute/solo instant mid-playback. Songs loop at the final bar
(`songEndTick`) or per a "loop:" directive. Rewind ⏮. Speed slider
(25–200%, applies on release, snap-back button when off 100%) scales
tickToSec/secToTick via playRate; persists across songs. Persistent
AudioContext warmed on first touch, declick ramps, notes straddling the
cursor play their remainder (chase). Manual scroll during playback
suspends auto-follow until the playhead re-enters the view.

**Tracks:** chips mute (= fully hide, roll and score) and solo. Score model
rebuilds on toggle. Second tap on the selected chip opens the voice &
color menu, now grouped by family (Josh 2026-08-15: flat list got too
long): NES / waves, then SAMPLED instruments (his call after the synth
patches sounded "just okay") — 36 FluidR3_GM instruments across Keys &
mallets, Guitar & bass, Strings, Winds, Brass, Organ & choir, as
per-note MP3s in vendor/soundfonts/*.json (MIT, see LICENSE.md there;
~2MB per instrument, ~85MB total in the repo — web sessions should
clone with `--filter=blob:limit=1m` to skip them). The menu opens in
the current voice's family; ‹ backs out to the family list. Lazy per song: nothing
fetches at page load; a track using voice=sf-* fetches its instrument
once (browser-cached) and decodes ONLY the pitches the song actually
plays (a full 88-key decode would cost ~60MB RAM per instrument on the
iPad). finalizeNotes warms the pitch set AT SONG LOAD through an
OfflineAudioContext (`sfDecodeCtx`: no device, no gesture needed — the
AudioContext itself still waits for first touch), and `play()` waits up
to 1.5 s (`sfWaitForSong`, "loading violin…") for anything still
pending; only past that does an undecoded note fall back to a quiet
triangle for the pass (Josh, 2026-09-23: Threnody's violin used to
"kick in" a beat after Play, because the fetch began at that tap). The
2026-08-15 synth patches (voice=piano/pluck/strings/organ/bell) still
play for annotations that saved them but left the menu. Color via one
full-width `<input type=color>` picker
(swatch shortcuts removed same day per Josh — any hex, stored in the
track: directive as color=#rrggbb; TRACK_COLORS remains the default
palette for unannotated tracks). The chips hug their content: ▾ sits beside the last
chip, and the transport/LCD cluster stays pinned to the top row when
chips wrap (2026-08-15 iPad fixes). `darkreader-lock` meta keeps the
Dark Reader extension from repainting swatches gray.

**Local MIDI imports** (2026-08-15, Josh lost one to a song switch):
a picked MIDI becomes a device-local draft under `local/<name>.mid` —
reopens from Open → drafts ("local /" prefix), stays editable
(saveDraft allows local/ alongside compositions; note `ch` is preserved
so drums survive), never syncs (dirtySongs excludes local/), never
commits; Save As forks it into a real composition. The file input has
NO accept filter: iOS grays out extensions it doesn't recognize (.nsf
was unpickable) — the byte-sniff is the real gatekeeper.

**Metronome** (2026-08-14, ⏱ in the header): standalone, feature-rich —
meter 1–12 over 2/4/8/16 (bpm counts the DENOMINATOR beat, matching the
app's counting; compound meters default accents on each group of 3),
per-beat accent cells (tap: accent → normal → silent), subdivisions in
2/3/4, tempo slider + tap tempo, lookahead-scheduled NES square blips.
Plays through its own gain node straight to the destination, so the
song transport's master fade can't silence it — it clicks OVER a
playing song, which doubles as a crude meter audition. Settings persist
(ff1roll-met).

**Inspection:** tap note → pitch (spelled per active key), bar, beat in
1e&a counting, duration, velocity, track. Lasso mode (footer toggle):
drag-select across notes in any view (roll, score, fall); pitch list
shown; chord name behind a "Chord?" reveal (templates: triads, 6, 7s,
9s, sus, dim7, power-dyad "5"; slash inversions; missing-5th tolerance).
Lasso selection is EDITABLE (2026-08-07, for targets a rectangle can't
separate — undersea/underwater's interleaved pedal): each new box UNIONS
into the selection, tapping a note toggles it in/out (all three views
hit-test their own geometry: hitNote / scoreLassoTap / fallHitNote),
tapping empty space clears. Touch-first by design — no modifier keys on
iPad. Chord challenge (2026-08-07): tap a chord band in the ruler and
the same footer button reads "Challenge?" — opens a dialog built from
chordEvidence(): each label tone with its role (root/3rd/5th/7th...)
and whether it sounds (gold) or is missing (red), extras under an
"evidence, not verdict" heading (blue — pedals and passing tones land
there by design), per-channel note lists, and the namer's read of the
full stack, with a Copy button. Request-only, labeled bands only.

**Pitch-class finder** (2026-08-07, "find:" dropdown in the footer —
the sweep's most repeated operation, mode-hunting single degrees): pick
a pitch class and every occurrence highlights across all audible
channels while everything else dims to 15% — so zero hits reads as a
confident zero, which mode rulings depend on. Works in roll (accent
stroke), score (accent notehead boxes), and fall. Matches by pitch
CLASS (find Bb catches the capture's A#); options respell per the
governing key and carry the scale degree when one is set; the info
strip reports count + channels. Selector options rebuild on focus so
spellings track the current key.

**Instrument panel** (2026-08-07, 🎹 in the footer): a piano-keyboard /
guitar-fretboard strip above the footer, so Josh can think with the
instrument instead of purely symbolically. Lasso'd pitches light gold on
both instruments; sounding notes light live during playback in their
track's color (same palette as the roll/fall notes); every key
and fret is tappable (plays through master, so track mutes never silence
it — square voice on piano, triangle on guitar). Labels are the pitch
name spelled per the governing key plus the scale degree when a `key:`
directive governs the cursor (degrees never shown for undeclared keys —
key discovery stays the analyst's job). Piano range = the song's own
extent, octave-aligned. Guitar: standard tuning EADGBE, high-e on top
(tab convention), 24 frets, inlay dots, a lit pitch appears at every
playable position; a pitch off the neck octave-folds in (gtrFold),
drawn with a dashed ring + tiny ▴/▾ toward its true octave — seeing it
in the wrong octave beats not seeing it (Josh, 2026-08-07). Open state, tab, and Fall persist in localStorage.

**Fall view** (2026-08-07, ▼ Fall in the panel's tab bar — which sits
BELOW the keys so nothing blocks the landing): Synthesia-style — the
main canvas becomes a vertical drop and notes fall down into the panel's
piano keys, landing on the accent "now" edge the moment they sound (the
keys light via the same live-pitch set). Time maps through seconds
(tickToSec), so tempo maps and the speed slider stay truthful; ~4.5 s of
music fills the drop (FALL_WINDOW). Bar lines ride with numbers, chord
changes ride gold lines with their symbol, black-key lanes are banded,
lasso'd notes keep their gold stroke. Piano-only: enabling Fall forces
the piano tab open; picking Guitar (or closing the panel) returns to
whichever of roll/score was active. Pan/pinch/cursor gestures are
disabled while falling — the view rides the playhead, or sits at the
cursor when stopped — but lasso mode works (finalizeLasso has a fall
branch hit-testing key columns × seconds), so boxed notes light the
keys below.

**Annotations:** see format below. + Note editor is type-first (Text note /
Section / Chord / Key change / Time signature / Loop point) with bar/beat
dropdowns and a 🎤 Speak dictation button (Web Speech API; hidden where
unsupported). Chord type gets a chip widget (root · ♭♮♯ · quality · /bass)
composing into an editable symbol box, plus an optional attached-note text
(✱ on the band). A ruler drag before + Note defaults the type to whichever
of section/chord was saved from a drag last (chord-entry runs stay in chord
mode). ☰ Notes lists everything grouped by type (Key / Meter / Sections /
Chords / Loop / Chop / Text notes; each group's + pre-picks that type),
rows open the editor, Delete works on synced notes too (permanent on Sync).
Chop (2026-08-06, Josh's import-fixup tool): a `chop:` directive
non-destructively trims the displayed song from either end — see the
format spec; implementation is a raw-notes snapshot (`song.rawNotes`)
that applyChop() carves the visible tracks from, so roll, score,
playback, and loop-at-end all follow for free.
Gold ruler flags; subtitle strip follows playback, with a ⊙ toggle that
highlights the active note's span (ambient range tints removed — on a
fully-annotated song they covered everything). The strip is a
constant-height slot (2026-08-07): present for the whole song whenever
the song has text notes, blank between them, long notes scroll inside —
per-note toggling reflowed the layout and made the instrument panel
bounce.

**Meter:** neutral 4/4 grid until a `timesig:` directive declares the
real meter (set via the editor's Time signature type — numerator/
denominator pickers, never free text). Same philosophy as keys: the
rhythmic grouping is the analyst's finding, so the app won't pre-commit
it. Changing meter over existing annotations demands a second Save tap
and converts every anchor (incl. loop directives) to preserve musical
position. cave (2/4) and menu (6/8) carry grandfathered declarations.
**The counted beat is the denominator note** (2026-08-06): X/4 counts
quarters, X/8 counts eighths, X/2 counts halves — so 6/8 bars run
beats 1–6, the way compound meter is actually counted. The roll grid
draws one line per beat, with a medium line every 3 beats in compound
meters (6/8, 9/8, 12/8) marking the big pulses. Anchors, beat
dropdowns, loop targets, and the info strip all use this unit; meter
changes convert anchors across unit changes through absolute time.

**Keys:** display defaults to C until a `key:` annotation exists — key
discovery is Josh's job, by design. Picker reworked 2026-08-07 (Josh's
handoff design, after the old signature-paired list wrote a silent wrong
`key: D`): FIRST dropdown = tonic pitch class only (enharmonic pairs
labeled "G♯/A♭"; keyNameFor picks the spelling landing on a real
signature — G♯m over A♭m, D♭ over C♯), SECOND = mode (major/minor +
church modes). Tonic-without-mode is a first-class PARTIAL: "mode?"
stores `key: G#/Ab?` — round-trips, shows in the ☰ KEY group and the
dropdown label ("tonic stored, NOT applied") — but creates no keyRegion:
no signature, no respelling, nothing downstream until the mode lands.
"Set Gm @ bar N" writes full directives at the cursor's bar.
**◯5 Circle of fifths** (footer button): live canvas chart — majors /
relative minors / vii° rings, signature counts, the movable degree
window (IV·I·V / ii·vi·iii / vii°), gold rim on the song's governing
key. Two independent motions (Josh, 2026-08-07): the WHEEL spins —
drag it anywhere (fractional while dragging, snaps to wedges on
release) or step it with ⟲ ⟳ — putting any key at 12 o'clock; the
degree WINDOW moves separately by tapping a wedge. Opens with the
song's key on top and windowed. Detail block gives the window key's
accidentals, scale, all seven triads, and IV/V neighbors.
Ranged keys revert automatically. The dropdown label reports the recorded
names: "key: not set (C)" vs "key: Gm ✓". Minor names map to the relative
major's signature for engraving (keyNameToSf). MIDI files carry true key signatures (via
tools/fix_keysigs.py) but the app deliberately ignores them for display.

**Compositions** (2026-08-15, File in the header — Josh's rulings from
the 08-14 handoff): New builds a blank 3-voice NES song (name/tempo/
meter dialog; the chosen meter is written as HIS timesig directive) at
`albums/compositions/nightroll/<slug>.mid` — his scratch space; promotion
to compositions/ proper happens via Claude Code on request. A
composition is the standard .mid + .rollnotes pair: writeMidi() (in-page
format-1 SMF writer, round-trip tested against parseMidi) produces the
.mid; File→Save PUTs both via the GitHub API. **Chip captures are
locked** — Save refuses anything outside nightroll/ (regenerable
pipeline output; a stray thumb must not corrupt the corpus) — but
File→Save As forks ANY song into nightroll/ with rollnotes inherited
verbatim plus a "forked from <path>" note (drift is Josh's to own, no
app warnings — ruled). Cross-device freshness (2026-08-16): every repo write stamps the
rollnotes with 'saved' (epoch ms); drafts remember the stamp they're
based on plus a dirty flag. Load compares — newer repo + clean draft
switches to the repo silently; newer repo + dirty draft asks (keep
draft / take newer save); otherwise the draft wins as before. Offline
or unstamped repo = draft wins. Unsaved work auto-drafts to localStorage
(ff1roll-draft-<path>, full song JSON) on every edit; drafts win over
repo fetches on load and are listed under "Night Roll drafts" in the
picker. Pencil upgrades: dotted durations (8·, 4·, whole), p/mf/f
velocity segment, ⟲ single-stack undo; compositions get a ＋ track chip
(empty NES voice). The app maintains albums/manifest.json itself
(2026-08-15): Save inserts the song's catalog entry via the API and
refreshes the dropdown; File→Move to… relocates a composition between
Night Roll Sketches and My Compositions — PUT at the new path, DELETE
the old, manifest updated, every per-song localStorage key renamed
(tokenless fallback: draft-only local move). nightroll/ is its own
album via a nested album.json; build_manifest.mjs now scans one level
of subdirectories for album.json, so offline rebuilds agree with what
the app writes. The editable/locked line (isComposition, 08-15
tightening): nightroll/ is always editable; a song elsewhere under
compositions/ is editable only with a local draft on THIS device or a
provenance note at the top of the rollnotes — "forked from <path>"
(written by Save As) or "moved from <path>" (written by Move when it
leaves nightroll/, 2026-09-07). The note is what survives devices and
git; a draft is one machine's. Josh's Logic exports under compositions/
have neither and stay locked (writeMidi would strip their CCs/programs).
**Promoting a sketch by hand (git mv) MUST add the "moved from" note
too** — Threnody was promoted by rename on 2026-09-07 and came up locked
on the machine that wrote it. **Score-side entry SHIPPED same day** (the promised
follow-up): Pencil/Erase work in score view — the tapped stave picks the
track, the vertical position picks the diatonic step (calibrated at
runtime from VexFlow's own getYForLine, no magic constants; ledger lines
±4), the key signature supplies accidentals with a key/♮/♯/♭ override
segment, and x snaps to the pencil-duration grid through scoreXToTick
(coarse mid-measure on near-empty bars — its linear-within-measure
interpolation has few anchors there). Empty tracks keep staves on
compositions (clef guessed from the voice name) so a blank song is
enterable; erase hit-tests the engraved notehead boxes.

**Data locations** (2026-08-17, Josh's architecture, advisor-reviewed):
the app is CONFIGURED with where its data lives — `ff1roll-cfg` in
localStorage, edited via Sync → "Data locations ▾". Three rows: songs
(.mid/album.json/manifest), analysis (.rollnotes + docs), NSF. Each has
a read BASE URL ("" = this origin/relative — the default, i.e. today's
fused behavior; or any raw.githubusercontent.com/owner/repo/branch or
local server) and an owner/repo write target for the Contents API.
Helpers: `cfg()/songsURL()/analysisURL()/nsfURL()/repoApi(which)`;
every write failure names its repo, and 404 is reported as
"token can't see <repo>" (fine-grained tokens make unlisted repos look
nonexistent). The Sync sheet opens without a loaded song so a broken
config can always be fixed; loadNotes warns instead of rendering
silently empty when this device previously synced annotations for a
path the analysis location now lacks. NSFs read raw-first from the
PUBLIC joshcough/nsf-archive (Josh's considered call, 2026-08-17 —
reversing the earlier never-publish stance; chip audio is tokenless
everywhere), API+token fallback for private forks. The PHYSICAL split
into ost-songs/ost-analysis is designed and deferred until a second
analyst exists — see the plan in open-items; the mirror-tree layout
(rollnotes at identical relative paths) makes it a pure git move.

**Sync / Save & Commit sheet:** serializes the full current rollnotes
state and commits it to this repo via the GitHub Contents API
(fine-grained token, stored in browser localStorage, never in the repo).
**Publish all (2026-09-26, overnight branch):** publishes everything
`pendingSongs()` lists — the open song through `commitCompositionNow`;
another composition edited on this device through `publishDraftSong`
(the draft becomes the .mid via `writeMidi`, annotations via
`buildRollnotesFor`, `notesTxtFor(doc, key)`, `askCommitLog(h, key,
true)`, the manifest entry; then the draft is marked clean, a Save
checkpoint written when auto-save is off, the stash and notes stash
cleared); annotation-only and chat-only songs through `putRollnotes` /
`askCommitLog(h, key, isCompositionKey(key))`. `isCompositionKey`
mirrors `isComposition` for a closed song. The pending list's Open
button stays as a convenience; "open it to commit" is gone.
Rebuilt 2026-09-25 (Josh: "there should be song sections"):
`pendingSongs()` is the union of `dirtySongs()` (unsynced annotation
stashes), drafts whose `dirty` is set (`draftDirtyState`: "edited" since
a save, "never" saved), and `ff1roll-ask-*` logs with unsaved messages —
same `local/` and import exclusions as `dirtySongs`, open song first.
`renderSyncPending` draws one `.psong` block per song (accent bar on the
open one; every other song's title row carries an **Open** button —
`openDraft(key)` then `openSyncSheet()` — since music and chat commit
from the open song): a ♪ music line, a ✎ count then one row per
annotation with its ✕ (`discardPending`: drops that never-synced note
from this device), a ✦ chat count. 12px in `--text`; the whole sheet scrolls (the old 38vh
inner scroller is gone). The primary reads "⇪ Commit song" ("⇪ Save
song" in folder mode) in both modes; the status line under the buttons
is EMPTY until it has progress, a result, or a missing prerequisite to
report (no song / local file / no token) — Josh dropped the
what-ships include-line the same day ("the buttons are clear").
"Commit all (N)"
shows only when N > 1 and still ships ANNOTATIONS only (one PUT per
file; per-song ✓/✗ status; meter for foreign songs comes from a
localStorage stash written on load) — music and chat commit from the
open song, and the sweep now passes `{keepDraft: true}` to
`markCurrentSongSynced` so an edited composition's ● stays lit when only
its notes went up (it used to go dark with the .mid unpushed). The Sync
button counts `pendingSongs()`. Copy/Download fallbacks. Local unsynced
additions persist in localStorage keyed by song path.

**Sheets close one way, visibly (Josh, 2026-09-25: "all of our dialogs
should have an X button, on the top right").** Every `.overlay` sheet
gets the pinned `.sheetx` ✕ prepended at runtime; `.sheet .sheetx + h2`
pulls the title up onto the ✕'s row (the ✕ is 40px tall with a −16px
bottom margin plus the 10px gap, hence `margin-top: -34px`). The
per-sheet "Close" buttons that predated the ✕ are gone (17 of them,
including a duplicate `#chclose` id that had left the Challenge sheet's
Close without a listener). Cancel/Done buttons that pair with an action
stay. The `SHEET_TOP` observer now also calls `micStop()` when a closing
sheet contains the live 🎤 — the Message-Claude Close used to do that and
✕/Esc/backdrop never did.

**Import** (2026-08-15, File → Import…, replaces Load MIDI): one file
picker, byte-sniffed — MIDI in any wrapper (.mid/.midi/.smf/.kar,
RIFF-wrapped .rmi; MThd found anywhere) loads directly as a local file;
an NSF (NESM magic) opens the capture panel instead. NSF capture runs
the browser through the SAME pipeline that dumped the FF1 album —
tools/nsf/{nsf,notes,midi-write}.mjs dynamically imported off Pages, so
there is exactly one 6502/APU/loop-detect/tempo-fit code path — per
track: run N seconds (panel field, default 75; the detector needs
intro + 2 full passes in frame, so on "no loop" the window auto-doubles
up to 300s before conceding — 2026-08-16, after MM2's ~35s stage loops
made half the tracks read "no loop" at 75), reconstruct, loop-detect +
trim to intro + one pass, grid-fit
bpm (4/4 seed 120 — meter/tempo stay re-derivable by annotation like
any capture), makeMidi → parseMidi → stored as a LOCAL draft under
`albums/imports/<album-slug>/track-NN.mid`, with a hardware `loop:`
directive stashed as a local note when the loop returns past 1.1.
Nothing touches the repo at capture time (Josh's ruling: audition
first). Flow: Capture all (~10 s for a 23-track NSF) → open each from
the panel or Open → drafts, where every import album is its own folder
(2026-08-16: tap in for the track list; ⇪ per track commits that song
alone to its album, "⇪ Commit album" pushes the whole folder; ✕ on the
folder row two-taps the entire album's drafts away; the folder
disappears as its last draft commits or dies). Re-capture and re-import
OVERWRITE existing drafts for the same album/track (with their stale
loop notes) — the name-collision guard only fires between two rows of
the same import session → recognize a
tune and type its real name in the panel row (the draft renames in
place; the typed title — punctuation intact — becomes the dropdown
title at commit, via an album.json `songs` override when the filename
can't spell it) → ✕ the duds →
Commit import (File menu item with live count, or the panel button)
pushes every surviving import draft in one pass: .mid (writeMidi of the
draft), loop rollnotes (stamped), album.json (self-created so
build_manifest.mjs stays honest), manifest entries — then retires the
local drafts; the album appears in Open like any other. Uncommitted
captures are excluded from the Sync badge (their notes ride Commit, not
Sync — a sidecar without its .mid would be an orphan). Expansion-chip
NSFs (VRC6/FDS/…) capture 2A03 channels only; silent SFX slots report
"silent" and store nothing.

**Game Boy import (2026-09-27; Josh from bed via the bridge: the Zophar
Final Fantasy Legend rips, "push it to master and I'll test").** A
second chip behind the same panel. `CHIPS` is the descriptor table
(`nsf`, `gbs`: magic sniff, vault extension, channel names, module files,
parse/run pickers); `chipKindOf(bytes)` routes Import, `chipModules(kind)`
dynamically imports `tools/gbs/{gbs,notes,apu-render}.mjs` the same way
(`nsfModules()` = `chipModules("nsf")`), `openChipImport(kind, …)` and
`captureChipTrack(kind, M, …)` are the old NSF functions with the run
picked by descriptor — everything after `reconstruct` is shared because
the GB reconstructor emits the NSF event shape and the GB `makeMidi`
bakes in `{pulse1, pulse2, wave, noise}` (wave = the GB's sample
channel; noise → drums by LFSR shift). `nsfSess.chip` names the live
session's chip; the IndexedDB record gains `chip`; album.json keeps the
`nsf:` key with `vault: "<slug>.gbs"` and `chip: "gbs"`; the archive
upload uses the chip's extension (`*.gbs` gitignored like `*.nsf`). A
timer-mode GBS shows its PLAY rate in the panel status (same seconds,
longer emulation). m3u: Zophar's GBS rips ship ONE .m3u per track
(`DMG-SAJ.gbs::GBS,1,Main Theme - Nobuo Uematsu - …,01:28,,10`), so
`parseM3u` accepts `::GBS,` and the picker merges every picked playlist
in natural file-name order (a single NSF playlist is unchanged). The
real FFL1 rip (downloaded to test after Josh's iPad showed every row
with the same name, 2026-09-27) settled three things: the files are
Latin-1 (© is the single byte 0xA9 — `decodeM3u` tries strict UTF-8,
then windows-1252; a plain decode made U+FFFD and broke a copyright
heuristic); GBS lines are "Title - Artist - Game - ©1989-12-15 Square"
(NSF: "Game - Artist - Title") so the `::GBS,` marker means title
first; and GBS track numbers are 0-BASED (0–16 for 17 subsongs, out
of album order), so the marker also adds 1 to reach the app's rows —
keyed on the marker, not on "a 0 is present", so one picked per-track
file still lands on the right subsong. Running the real rip also found
an SM83 bug: JR e read PC before the operand fetch and landed a byte
short (tools/gbs/cpu-sm83.mjs; test "SM83: unconditional JR lands past
its own operand"). Verified with the real files in Chrome: 17 rows,
album order, Main Theme captured. The
file picker accepts `.gbs`; the File menu says "Import… (.mid / .nsf /
.gbs)". Tests: "GBS import: the Game Boy chip goes through the same
capture path" (synthetic GBS from `tools/gbs/make-test-gbs.mjs`, no ROM
data), the m3u test's GBS line. Offline twin: `node tools/gbs/dump.mjs`.

**Audio context rebuild only inside a tap (2026-09-27).** Josh, after
importing on the iPad (Game Boy, then Chrono Trigger): the imported song
played with a moving cursor and no sound, and every song after it was
silent until a relaunch — "the same exact bug we had with Game Boy". Not
the chip path (the SNES import had no renderer yet) and not scheduling
(Chrome: 1575 events scheduled, no exception). Import's file picker
interrupts the AudioContext; the `visibilitychange` handler then ran
`resumeAudio` with a dead clock, and its last resort closed and REBUILT
the context outside a user gesture — on iOS such a context runs its
clock (the cursor moves) but never reaches the speaker, and resume()
has nothing left to do. Now: `resumeAudio` resumes twice and, with a
dead clock, rebuilds only when `gestureActive()`
(`navigator.userActivation.isActive`; true where the API is missing);
outside a gesture it says "audio asleep — tap ▶ again" and play() (a
tap) does the rebuild via `rebuildAudio(why)`, which also resets
`metGain` and `organWave` — nodes the old rebuild left bound to the
closed context. Unverifiable on the Mac (Chrome has no interruption
path); the gating itself is exercised in Chrome with a faked dead clock.

**Chip audio and the AudioContext (2026-09-27, the second silence).** A
committed Chrono Trigger song silenced everything again with no picker
involved. `chipRender` runs at song load and called `ensureAudio`; iOS had
closed the context under the render's memory (eight voices × 3 min ×
48 kHz ≈ 300 MB twice over), and the rebuild ran outside a tap. Now the
render never touches the context: it produces `chip.pcm` (Float32 per
voice at `CHIPS[kind].renderRate` — 32 kHz for the SNES — or the live
rate), silent voices keep nothing, and `chipBuffers()` builds
AudioBuffers inside play()'s tap on the live context (rebuilt if the
context changed; `chipActive`/`chipHas` read either form). A render whose
song is no longer open throws "stale render" at its next progress tick;
`updateChipBtn` frees the previous song's pcm/buffers first. `ensureAudio`
rebuilds a closed context only inside a gesture, the visibility handler
only resumes, `resumeAudio` reads `gestureActive()` before its awaits,
and "audio asleep"/"engine closed" write the state to the ⚠ log.
Queued: a Worker for the render.

**Big drafts (2026-09-27; Josh imported Chrono Trigger's 92 songs on the
iPad: "quota has been exceeded", and the album "vanished" — it was under
Open → drafts → the folder).** localStorage holds ~5 MB per site and 92
captured SNES songs are 6 MB of note JSON (measured: 67 KB a track). An
import's (`albums/imports/**`) or local MIDI's (`local/**`) draft is now
a STUB in localStorage — flags, title, ppq, meter, tempos, `tracksRef: 1`
— with its `tracks` in IndexedDB store "drafts" (db version 4) under the
same key; his own compositions stay whole in localStorage (small,
synchronous, proven). `draftWrite(key, doc)` is the one writer (sync for
the caller; the IDB put rides `_idbQueue`), `draftRead(key)` the reader
that needs notes (`openDraft` is async now; `loadSongInner` fetches the
notes when the stub says so; `commitImports` reads whole drafts);
everything that only reads flags keeps reading the stub. ✕ (row and
album), Revert, rename (import and composition) call
`idbDraftDelete/Move` so the store stays in step; an old inline draft
still reads. `saveDraft` no longer throws out of an edit when storage is
full: one ⚠ line per song and an info strip, and the edit is honestly
reported as NOT saved. Test: "big drafts: …" (fakes indexedDB in the vm).

**Super Nintendo import (2026-09-27; Josh from bed with the Chrono
Trigger zip: "can he just get the Super Nintendo stuff merged so I can
test it here").** The third chip behind the same panel, and the first
PER-FILE one: an SNES set is one .spc per track (`CHIPS.spc.perFile`),
so the picker takes every .spc picked, `openChipImport(kind, …, files)`
parses them all, `chipTrackOrder` sorts by `parseTrackName` (disc,
track, part; 99/999 "unlisted" last; unparsable names after), the first
file's game/artist name the album, each row's title is the tag's
(`spc.name`, xid6 over the 32-byte header) and its tagged length sizes
the capture like an m3u length. `rows[n].parsed` is that row's file;
`captureChipTrack` receives it in place of the one parsed NSF. The SPC
runner already reconstructs (`reconstruct(capture)` → events with
voice0–7 channels, noise as `drum`, volumes 0–127, 2 ms ticks), so
`CHIPS.spc.run` returns `events` too and rebins them to 10 ms frames
(the NES loop/tempo stages were tuned for ~60 fps; 2 ms ticks gave them
150 000 frames per 300 s); `captureChipTrack` uses `res.events` when
present; `midiOpts` = `{volMax: 127}`; drums are excluded from the snap
gate like noise. `CHIPS.spc.tagged`: the tag's seconds ARE the length
(intro + one pass), so the capture runs that long, the loop scan is
skipped and the 300 s no-loop retry never fires — measured on the real
Frog's Theme: scan 5.6 s in node (40 s+ in Chrome) for a null result.
Console audio for a per-file set (groundwork 2026-09-27, renderer in
progress): each captured row stores ITS file in the IndexedDB record's
track entry (`tracks[base].bytes`, 64 KB an .spc; `rec.bytes` stays
null), `chipSource` returns that entry's bytes with `n: 1`, album.json
gets `nsf: {vault: "<slug>/", chip: "spc", perFile: true, tracks}`
(`chipVaultMeta`) and Publish uploads one archive file per track
(`<slug>/<base>.spc`, only the missing ones); `chipVaultFile` names a
track's file for the vault fallback. `CHIPS.spc.files` lists
`?spc/apu-render` as OPTIONAL (a failed import is an empty module), so
the app keeps working until tools/spc/apu-render.mjs exists;
`chipRender` returns false without `M.renderApu`, and a chip's `render`
hook adapts the renderer's signature (the SPC one takes the capture). No renderer yet: `nsfSess.bytes` is null, nothing goes
to IndexedDB or the archive, synth voices carry the songs, the panel
status says so, and the "no NSF on this device" warning now needs an
album.json that actually names a console file (`chipAlbumHasSource`).
Verified in Chrome with the real Chrono Trigger set: 92 rows in order
with tag titles, Frog's Theme captured. Test: "SPC import: a Super
Nintendo set…" (synthetic SPC; `chipTrackOrder` on real file names).

**Genesis import (2026-09-27; Josh: "is it gonna download games to test
it with?" — built and verified against the real Sonic 1 set the agents
downloaded).** The fourth chip, second per-file one. `CHIPS.vgm`:
`magic(bytes, name)` — "Vgm " or gzip 1F 8B when the NAME ends .vgm/.vgz
(`chipKindOf` takes the name now; the picker passes it); `parseAsync`
(inflate via DecompressionStream, then `parseVGM`; GD3 track/game/author
become name/game/artist, header samples become `tags.seconds`) — the
per-file loop in `openChipImport` awaits it; `perFile` + `tagged`
(header states total and loop samples, so no scan and no retry). A VGM
is a register log, not a program: `run` calls `reconstruct` directly,
rebins the 44100 Hz sample frames to 10 ms (k = 441), maps `vel/velEnd`
to `vol/volEnd` (volMax 127), keeps `drum` on noise/DAC hits (→ the
"drums" track), and returns `loopFrame` from the header; `captureChipTrack`
turns a stated loop into the same `loop:` annotation the detector would
(`statedLoop`). No renderer, no chip audio: synth voices; nothing here
touches the AudioContext. Verified in Chrome: 19 rows with GD3 titles,
Green Hill Zone captured in 99 ms at exactly 150 bpm, 8 tracks
(fm1–fm5, psg1–2, drums), `loop: 10.2` at bar 34. Test: "VGM import: …"
(synthetic VGM through captureChipTrack; the .vgz sniff by name).

**PlayStation import (2026-09-27; verified on the real Final Fantasy VII
set).** The fifth chip and the first SEQUENCE one: a PSF is a program
image, and the reader yields notes in ticks with a tempo map and meter,
so `CHIPS.psf` has a `capture` of its own and never enters the
frame/loop-scan/tempo-fit path. A set is many `.minipsf` plus ONE
`.psflib` named by every mini's `_lib` tag — `libFile(name)` keeps the
lib out of the rows and in `nsfSess.libs` (by lowercase name);
`parseAsync(bytes, name)` reads the tags (title/game/artist/length) and
keeps the bytes; the panel status names a missing lib; a capture
without it fails with the lib's name in the row. `capture`: inflate the
chain with DecompressionStream("deflate") (`loadPSFChain` with the
session's libs as `readLib`), `assembleRam` (2 MiB, assemble → scan →
drop), `scanMagic` → SEQ/VAB path (`parseSEQ`/`parseVAB`/`seqNotes`)
else `scanAKAO` → prefer the sequence inside the mini's own range →
`akaoNotes`; the PSX `makeMidi(result)` writes the file (conductor
with the tempo map and meters, a track per voice, drums split to
channel 10); bpm = the first tempo, seconds from the tempo map, the
sequence's loop → `loop:` annotation in the sequence's meter; the
reader's warnings go to the row's tooltip, the console and a "· N
notes" suffix. `keepBytes: false` (no renderer, nothing stored or
uploaded); `parseMidi(buf, {trust: true})` for imports (and for
`albums/imports/**` on load) turns off the corrupt-file guards that cut
FF7's 41-bar rests. Verified in Chrome: 90 rows with tag titles,
Prelude 2836 notes / 13 tracks / `loop: 17.2.25`, Tifa 536 notes, Main
Theme 2238 notes with 11 tempo points and `loop: 19.1`, ~1.1 s each.
Test: "PSF import: …" (synthetic minipsf + lib; the missing-lib error;
the trust flag on a 41-bar rest).

**Nintendo 64 import (2026-09-27; verified on the real Super Mario 64
set).** The sixth chip, the second sequence one. A USF set is many
`.miniusf` (a save-state word or two each) plus ONE `.usflib` carrying
the game's sparse ROM and RDRAM; `CHIPS.usf` sniffs PSF version 0x21,
`libFile` keeps the lib beside the rows, `parseAsync` reads the tags
(title/game/artist/length). `capture`: `loadUSF([mini, ...libs])` (the
lib objects persist across captures, so their parse is cached on them),
`gameOfSet` → manifest (abi, sequence-id rule), `locateEAD` (tables in
ROM for SM64, in RDRAM for OoT/MM), `miniSequenceId` from the save
state, the sequence bytes from ROM pages or the RDRAM cache with a
presence mask, `parseSequence` (stop at the loop jump, 600 s cap),
`toMidi` (a track per channel, `inst N`/`drums` names, the tempo map);
bpm = the first tempo, seconds from the interpreter, the loop jump →
`loop:` annotation in 48-tick beats (4/4 assumed — the format carries no
meter); truncation, self-modification, io-port reads and ignored
sound-shaping ops become the row's tooltip notes. `keepBytes: false`, no
renderer. Verified in Chrome: 38 rows with tag titles, Title Theme 4008
notes / 13 tracks / 6 tempo points / `loop: 5.1`, Main Theme 1419 notes
at 113 bpm, Dire Dire Docks 390 notes, ~150 ms each. Test: "USF import:
…" (sniff, lib file, capture presence); the real-set run is the browser
check and tests/n64-real.test.mjs with N64_USF_DIR.

**Chip render in a Worker (2026-09-27, afternoon).** The console render
ran on the page's thread in 35 ms slices: the first Play after opening a
song stuttered over it, the Fall view starved the scheduler, and on the
iPad a long render could take the audio session down. `chipRender` now
hands the work to `tools/chip-worker.mjs`, a module worker that imports
the same chip modules (relative to tools/, with the page's `?v` buster),
parses, emulates and renders per chip (`RUNNERS`: nsf/gbs/spc), drops
silent voices, and posts `{pcm, sampleRate, leadSec}` back as
transferables, with `progress` messages feeding `chip.progress`. One
worker at a time (`chipWorker`); a song change terminates it within
250 ms ("stale render stopped"); a worker failure logs and falls back to
the inline path once, and an environment without module workers
(`chipWorkerAvailable.broken`) stays inline. `chipPublish` is the one
place a finished render (worker or inline) becomes `chip.pcm`. Verified
in Chrome: Overworld (NES, 3 voices) and Frog's Theme (SNES, 8 voices)
render in the worker with the page idle; the vm keeps the inline path
(no Worker there). Not verified on the iPad yet.

**Chip audio** (2026-08-17, `chip` button in the transport during an
import session): the captured APU register log rendered through a
pure-JS 2A03 DSP (tools/nsf/apu-render.mjs — duty sequencers, hardware
envelope units, length/sweep/linear counters, noise LFSR, Nesdev
output curves, console RC filters). This is the console's own voice:
a 33ms arpeggio run is one pulse wave changing period, not N oscillator
attacks — built after oscillator-per-note rendering could not do MM2's
fast sections justice. Renders ~400x realtime, per-channel buffers so
mute/solo gains still work; loop points honored via buffer looping;
speed slider acts tape-style (pitch follows). Re-capturing invalidates
the render. All async yields (emulation, loop scan, render) use
MessageChannel, not setTimeout — background tabs throttle setTimeout
to ~1/sec.

Chip audio is per chip since 2026-09-27: `chipSource()` returns `chip`
(live session → IndexedDB record → album.json `nsf.chip` → the vault
extension), `chipRender` parses/runs through `CHIPS[kind]` and builds one
buffer per name in `CHIPS[kind].channels` — a Game Boy song gets
pulse1/pulse2/wave/noise buffers matched to its tracks by name exactly
like the NES four; missing channels are skipped.
Chip audio is the DEFAULT wherever a source resolves (Josh: "a million
times better... always use this if possible"; the chip button is the
opt-out, preference in ff1roll-chip). Source chain, honoring the
*.nsf gitignore (ROM music never enters the public repo): live import
session → this device's IndexedDB cache → **joshcough/nsf-archive**,
Josh's PRIVATE repo, fetched via the GitHub API with the same token
Sync uses, then cached. album.json carries only metadata: `nsf:
{vault: "<file>.nsf", tracks: {<base>: {n, secs}}}` — Commit import
writes it and uploads the album's NSF to the archive; FF1's album.json
maps all 19 tracks to ff1.nsf, so the whole analysis album plays with
the console's own voice on any device with the token.

**Robustness:** MIDI parser finds tracks by MTrk magic scan (the original
ff1battle had corrupt length headers — since rebuilt clean, guard kept),
honors end-of-track, clamps note durations to 8
bars, truncates a track at any internal silence > 32 bars (real tacets max
24 in this catalog). ff1ship.mid was truncated at the source
(thefinalfantasy.net serves a 512-byte file); replaced 2026-07-31 with
vgmusic.com's ff1ship2.mid — same transcription, 5 tracks incl. drums.

## .rollnotes format (the spec)

Sidecar file next to each .mid: `<song>.rollnotes.json`. **JSON since
2026-08-15** (version 1; renamed from bare `.rollnotes` same day — the
extension says what the content is) — the file is a direct serialization of the
app's in-memory note objects, one note per line so git diffs stay
line-per-change:

```json
{ "version": 1, "song": "menu", "notes": [
  {"at":[1,1],"type":"timesig","timesig":"6/8"},
  {"at":[1,1],"type":"key","key":"Bb"},
  {"at":[2,1],"type":"key","key":"A#/Bb?"},
  {"at":[1,1],"to":[4,6],"type":"section","label":"A — home"},
  {"at":[5,3],"to":[5,4],"type":"chord","chord":"G7/B","note":"no 5th"},
  {"at":[3,1],"type":"tempo","bpm":90},
  {"at":[1,1],"type":"track","track":"pulse1","voice":"sine","color":"#0aa2c0"},
  {"at":[2,1],"type":"chop","chop":"start"},
  {"at":[25,1],"type":"loop","loop":"2.1"},
  {"at":[6,2.5],"text":"Plain prose observation."}
] }
```

Source fields only: `at`/`to` are [bar, beat] (beats may be fractional;
`to` beat omitted = end of bar), `type` + its value field(s), free
`text` (or `note` attached to a chord). Derived data (ticks, band
depths, region ends, key sf) is computed at load, never stored. The
semantics of every type are exactly the legacy directives below — both
formats reduce to the same raw shape and run through the same
derivation code, and the format-identity test (text → object → JSON →
object, deepEqual) enforces that they can never disagree. The legacy
TEXT format below parses forever (loading sniffs the first character);
any Sync rewrites a song as JSON.

### Legacy text grammar (still parsed, no longer written)

```
[3.1]              ← anchor: bar 3, beat 1 (beats may be fractional: 2.5)
Free text until the next [anchor]. This is a regular note.

[7.1 - 8.4]        ← range: bars 7–8 inclusive (end beat inclusive)
Range note. Tints its span; active for the subtitle across it.

[1.1 - 4.4]
section: A — G home   ← "section:" prefix = arrangement band in the ruler.
                        Nesting inferred by range containment; same label
                        = same color.

[5.1 - 5.2]
chord: Gm          ← "chord:" prefix = chord band. Renders and nests exactly
                     like a section band (containment = depth; same label =
                     same color) but is a distinct type: grouped separately
                     in the ☰ Notes list, entered via the chord widget.
                     Symbol standard = the lasso chord namer's vocabulary:
                     bare root = major (C), m = minor (Gm), then 7/maj7/m7/
                     m7b5/dim/dim7/aug/6/m6/sus4/sus2/5/9/m9/maj9/add9/7b9,
                     slash bass as /E, "(no 5th)" allowed as qualifier.

[5.3 - 5.4]
chord: G7/B        ← lines after the symbol = attached note (shows as ✱ on
no 5th — bass has it   the band, previewed in the ☰ list, kept on round-trip).

[9.1]
key: Bb            ← "key:" prefix = key directive. Open-ended: applies
                     until the next open key directive.

[2.1 - 4.4]
key: Db            ← ranged key: applies bars 2–4, then the surrounding
                     key resumes (score draws cancellation naturals).

[1.1]
timesig: 6/8       ← meter directive. Until one exists the app runs on a
                     neutral 4/4 ruler — the MIDI's meter meta drives
                     nothing visible (meter is analysis, like keys).
                     Declaring one re-bars the song; the editor converts
                     existing anchors through absolute time (two-tap
                     warning) so annotations keep their musical positions.
                     One per song. Beats in anchors count the DENOMINATOR
                     note: under 6/8, [1.4] = the fourth eighth, and the
                     first half-bar chord is [1.1 - 1.3].

[3.1]
tempo: 90          ← tempo directive, TWO meanings by song kind (Josh's
                     ruling, 2026-08-15): on an app-created song it
                     AUTHORS — the tempo map rebuilds from the song's
                     base plus every directive, and playback/LCD/Save
                     follow. On an analyzed song it is an OBSERVATION —
                     records that the music changes tempo here and
                     leaves playback untouched (capture timing is
                     measured fact).

[1.1]
track: pulse1 voice=sine color=#0aa2c0
                   ← track directive (2026-08-15): per-track VOICE (auto NES /
                     pulse 50·25·12.5% / triangle / sine / saw) and COLOR
                     override, set from the chip's voice-&-color menu (tap
                     the selected chip again). A synced annotation like any
                     other — song truth, not device preference. Playback
                     only; the .mid is never touched. Tracks matched by
                     name (or trN index). Removing it reverts to defaults.

[3.1]
chop: start        ← non-destructive trim, RAW capture coordinates (the one
                     annotation type that is): hides everything before raw
                     3.1 and renumbers — raw 3.1 becomes displayed 1.1.
                     At most one per song; "chop: end" likewise hides
                     everything at/after its anchor. All OTHER annotations
                     live in displayed coordinates; adding/removing a start
                     chop shifts them through absolute time (two-tap
                     warning), so chords stay glued to their music. The
                     hidden material is gone entirely (no ghost); the .mid
                     is untouched — delete the directive to restore.
                     Editor prefills the cut from the cursor; ☰ list shows
                     chop anchors with a "raw" tag.

[25.1]
loop: 2.1          ← "loop:" prefix = loop directive. The anchor is the
                     jump point: when playback reaches bar 25 beat 1 it
                     returns to the target (here bar 2, skipping ship's
                     pickup-intro bar). An anchor at/before the target
                     means the jump fires at song end. One per song.
```

- `#` lines are comments — **dropped on round-trip** (the app rewrites the
  whole file on Sync). Never store important info in comments.
- Key names: C G D A E B F# C# F Bb Eb Ab Db Gb Cb, plus minor as "Em",
  "Bbm" (minor maps to its relative major's signature).
- Every FF song is a chip capture (2026-08-02, extracted from the NSF via
  tools/nsf/), trimmed to intro + one loop pass at the frame-exact repeat
  point — see albums/final-fantasy-i/CUTS.md for the verified cut/loop table. Songs whose
  loop returns past a once-only intro carry a measured `loop:` directive
  in their rollnotes (battle, gameover, overworld, ship, victory).

## Code map (index.html, section comments mark these)

catalog → CATALOG built from albums/manifest.json at boot (run
tools/build_manifest.mjs after adding music; album.json per album holds
title/order/name overrides) + two-level song picker (groups sheet → songs;
opens into the current song's group) ·
midi parse → parseMidi + tempo maps · rollnotes → parse/serialize/regions/
sfAt/subtitle · lasso/chord id · load song → setSong (computes songEndTick;
loadGen guards stale async loads) · track chips · drawing → draw/drawRuler (roll) ·
score → buildScoreModel (quantize 16ths, chord-group, clip overlaps,
measure split with ties, rest fill) / renderMeasure (LRU 60 cache,
geometry + timeMap per measure) / drawScore · gestures → pointer/pinch/
lasso/cursor drag; iOS page-zoom suppressed · audio → NES voices, drumHit,
per-track gains, loop scheduler · note editor (type-first) · notes list ·
sync (GitHub Contents API, 409 retry) · key dial · help sheet.

## Project conventions that govern this code

- Keys/analyses are Josh's discoveries: never pre-fill answers into the UI
  or seed analysis for unanalyzed songs (see memory + open-items.md).
- Commits auto-allowed in this repo only (.claude/settings.local.json hook,
  gitignored; script at .claude/hooks/allow-git-commit-push.py).
- Docs: open-items.md (questions/tasks), quizzes.md (protocol + bank),
  score-view-plan.md (score history/limitations), supplemental-learning.md
  (session log = quiz source material).

## Tracks/Arrange view (advisor-designed, 2026-08-22)

Third viewMode ("tracks"; viewbtn cycles Roll -> Tracks -> Score, label
shows the NEXT view; View ▾ has direct rows). RULER_W is now a LET —
148 in tracks (the header column), 46 elsewhere — set ONLY in
applyViewMode; every gutter/time consumer keys off it. Time axis is
the roll's shared map, so ruler/sections/cycle/bar-magnet/playhead/
follow-camera come free. laneGeom(ti) = fit-to-count lanes (44-88px),
thumbnails normalized per lane (min one-octave span; drums use
kitSlots rows). Editing: selection is the arrange currency — lasso =
time-span × lane-span across tracks; drags on selected notes GHOST
(tracksGhost {dT, dLane}) and commit on release: dLane 0 ->
selEditApply time slide, else moveSelectionToTrack(target, dT)
(retrack keeps pitch, one group undo; melodic/drums lanes never mix).
Pencil is roll/score-only (no honest pitch in a squeezed lane); erase
works. Headers: M/S chips, fader (live gains, persists via
saveVoices as vol=), tap = selTrack, second tap = voice menu.
Gesture guards: anything assuming ROLL geometry must check
viewMode === "roll", not !== "score".

## Chrome visibility: applyChrome() is the ONE writer (advisor, 2026-08-22)

editrowHidden/footerHidden (device-local; migrated from the old
combined ff1roll-panelhide key, preserving the phones-start-folded
default). editrow shows iff editable (.on class) AND !editrowHidden
(inline style) — never write editrow.style.display anywhere else.
INVARIANT: the header never hides; View ▾ is always reachable, and a
hidden footer always floats the ▴ restore (which shows both). The
View ▾ menu stays open across toggle taps (batch hiding); every item
mirrors an existing button — buttons are the fast path.

### Listener mode (2026-08-23)

Phones (min-dimension < 500) default to a PLAYER: body.listener CSS
hides File/Edit/View, track chips, edit row, footer, ▴ restore,
metronome/record, instrument panel, #subtitle notes strip — leaving
the roll, ⏮ ▶, the LCD, speed % and 🔊. Section/chord bands fold too:
finalizeNotes caps depth at -1 and nulls chord lanes when listenerMode,
so RULER_H = BASE_RULER_H (applyListener re-runs finalizeNotes on
toggle — idempotent, same pattern as setSecDepth). listenerMode is
declared beside editOn/viewMode: lane math runs at song load, before
applyChrome's boot read (the editOn TDZ lesson).
Rationale: shared ?song= links are for listening.
Device pref ff1roll-listener ("1"/"0"; null = phone default). The
never-strand invariant holds via a header **Full app** button that
only renders in listener mode (one tap opts the device out and
persists "0"); View ▾ → 📻 Listener mode folds it back on any device.
applyListener() is the one class writer, called from applyChrome's
boot read and the two toggles; it early-returns when document.body is
absent (vm harness).

## Bassist (advisor-designed, 2026-08-23)

bsGenerate(seed, opts) mirrors the Drummer's contract: seeded takes,
replace-in-range as ONE group undo, per-bar substreams via the shared
sectionLane(bar) (same label = same bassline), labeled-Break silence,
meter-change refusal, strictly monophonic output (post-sort duration
clamp). Pitch truth ladder: declared chord bands (bsChordTimeline —
slash basses honored, N.C. = key-root pedal, gaps ride the last chord,
unreadable labels ride root+fifth) > INTERNAL melody inference
(bsInferTimeline: per-bar duration+metric-weighted PC census over ALL
sounding voices (one voice alone misreads multi-voice songs), scored
against the declared key's diatonic triads PLUS harmonic minor's
V-major and vii° when the declared key is minor (the graveyard-B
failure: an E# over F#m had no candidate, so every seed shuffled
equally-wrong diatonic picks), an additive mass-scaled smoothness
prior strong enough to hold a pedal (multiplicative ×1.15 amplified
negative scores and let solo lines read as a new root every bar), a
sounded-root bonus, seed draw squared-biased to the best reading and
gated to candidates ≥55% of the top score; a bar where every candidate
scores negative RIDES the previous chord instead of committing to a
confident wrong root. Seeds give different harmonic READINGS
— never displayed, never annotated: naming chords is Josh's; this is
his explicit melody-only "idea machine" case, overriding the
advisor's doctrinal rejection with the display boundary) > key-root
pedal > honest refusal. Styles chug/pump/arp/walk/riff per the spec;
constant rng draws per bar per style (liked-bar stability). Target
track picker never defaults onto a track with notes in range.

## Drummer parts scoping (advisor round 3, 2026-08-22)

parts = chips {kick, snare, hats, fills}. kick/snare/hats scope by
PITCH GROUP; fills is a ROLE (fills contain snares and kicks), scoped
by BAR: the bar before each declared boundary + the boundary/arrival
downbeat crash ticks. Semantics: all four = the literal v1 "all" path,
bit-identical (asserted in vm); groove-only = union of pitch groups,
fillAmt forced 0, no crashes; fills-only = whole-kit rewrite of fill
bars alone (fills knob "off" here = a DE-FILL: strips fills, lays
plain groove); combos = union. DOCUMENTED DECISION: a fills-only
reroll re-seeds the fill bar's groove too, so an identically-labeled
section's restated bar may diverge from its twins there — fill bars
are statement bars and vary on purpose (fills key on absolute bars).
ZERO new rng draws in any pre-existing path — the bit-compat guarantee
is what keeps takes replaying.

## UI convention: menu/row parity (Josh's rule, 2026-08-20)

Every command in the Edit ▾ menu has a corresponding icon button in the
edit row, and vice versa — the menu is the labeled version of the row,
never a superset. Shipping a new edit command means shipping both.
## Drummer (branch `drummer`, awaiting field test)

drGenerate(seed, opts) in index.html: deterministic kit generation.
v2 knobs (advisor-designed from Josh's Logic screenshot, 2026-08-22):
busy (density), hard (velocity — ONE choke point in put(), so hard=3
is bit-identical to v1; hats floored at 40), fills (band + odds),
follow (bass probabilistic / chords deterministic-on-declared-starts
capped 4/bar / off), feel (normal / half = mid-bar backbeat + thinner
hats / double = skank: kick every beat, snare every offbeat 8th,
bass-follow disabled). Legacy positional signature still works and
maps energy -> busy = hard.
Consistency (advisor round 2, 2026-08-22): the GROOVE substream keys on
(fnv1a32(section label) + bar offset in section) for the deepest section
containing the bar's downbeat — sections with an EXACT matching label
restate bar-for-bar (no stemming: "A repeat" != "A1"; renaming is the
manual signal, and it also merges their ruler colors). Bars outside any
section key on the absolute bar — unsectioned songs are bit-identical
to the old engine. Fill + arrival-crash substreams stay absolute-keyed
on purpose (fills are commentary on what comes NEXT). Fill vocabulary:
weighted pick at fills >= 4 (kitfall 3, tomrun/doublekick/buildup 2,
run/tomdrop 1); the metal tier (tomrun, kitfall, doublekick) is 16th-
rate and DENSER than the busy-5 groove it interrupts — the old max-
settings fills were sparser than their surroundings, which is why five
rolls all felt lackluster (7 toms in a whole song; now ~50+/roll). Design invariants (advisor-reviewed, 2026-08-20):
every generation is the same idempotent operation — erase all kit
notes in the bar range + add the new take, pushed as ONE
group{eraseBatch, addBatch} undo entry (no generation-identity
bookkeeping exists to go stale). Randomness is per-bar substreams
(drumRng(seed, barIndex)), so extending the range never reshuffles
bars already liked. The skeleton (kick on 1, meter-table backbeat) is
fixed; seeds only vary hats/ghosts/extra kicks/fill choice. Breaks =
bars where nothing but the bass SOUNDS (sustain-aware), or a section
labeled "break" — the drummer lays out. Fills own their window (the
skeleton yields inside it) and fire on 75% of section/loop boundaries,
crash on the arrival downbeat. Velocity table keeps hats ≥25 under
the bar's backbeat snare (cap 76). Take chips are session-ephemeral UI
snapshots of (seed, energy, from, to) — the winning take IS the notes.

## Perf HUD + session recorder (?perf=1)

The iPad has no Activity Monitor and WebKit has no longtask
attribution, so the app profiles itself. `?perf=1` mounts a HUD
(fps / worst frame / event-loop lag / hot functions / build stamp) and
a `⏺ rec` button. Recording accumulates a session and prints a report
into a copyable sheet — the intended workflow is: reproduce the
stutter, stop, Copy, paste the report into a session.

The whole thing lives in one guarded block near the audio section and
costs nothing without the query param. It never touches app code:
hot-function timing wraps `globalThis[name]` (classic-script function
declarations are global properties, so internal call sites re-resolve
through the wrapper), and the audio-node census patches
`BaseAudioContext.prototype` + `AudioNode.prototype.disconnect`,
listening for `ended` via `addEventListener` so an app-side `.onended`
assignment is never clobbered.

Two experiment flags ride alongside it, off by default, added because
Josh's iPad blocks the main thread 100-220ms repeatedly while app JS
accounts for under 2% of wall clock and nothing in the heap grows:

- `?dpr=1` — render at 1x. Overrides `window.devicePixelRatio` with a
  getter rather than editing the eight call sites, so every consumer
  (roll, scene cache, score, instrument panel) picks it up. On a 2x
  iPad this cuts the roll canvas from ~14MB of backing store to ~3.5MB.
- `?scene=0` — skip the playback scene cache entirely: one canvas
  instead of two, paying a full redraw per frame. The cache was added
  as a CPU win (39c551a); on a memory-tight WKWebView that trade can
  invert, which is the shape of regression Josh remembers ("older
  versions did not have this problem").

Both print into the report's `flags` line, so a pasted report is never
ambiguous about which build produced it.

What the report carries, and why each part is there:

- **`shape`** — the discriminator. A blocked main thread makes the
  50ms probe timer AND the frame late together; a throttled rAF
  starves frames while the timer stays on schedule. These have
  completely different causes, and fps alone cannot tell them apart.
- **frame-delta histogram** — uniform throttling piles into one
  bucket; "mostly fine with spikes" is bimodal.
- **attribution** — session ms + call counts per wrapped function.
  `drawFull` nests inside `playbackFrame`, so percentages overlap;
  the report says so rather than pretending they partition.
- **audio-node census** — created vs ended/stopped/disconnected, live
  estimate and peak. A leaked graph burns time in the realtime render
  thread, which no page-side profiler can see and which outranks the
  UI thread in priority.
- **context** — canvas dimensions, dpr, `instOpen`/`fall` (both add a
  full canvas repaint per playback frame), audio sample rate, and
  localStorage size. Chrome negotiating 96kHz doubles WebAudio render
  cost against a 48kHz device on the same code.

## Query tools (tools/*.mjs — deterministic, facts only)

For any session (web sessions especially) that needs to READ music
without eyeballing dumps. All load through the app's own parser via
tests/harness.mjs (one parser, no drift), de-duplicate stacked notes by
default, and take `--json`. They report what IS in the file — never a
chord name, key inference, or note classification; findings are Josh's.

    node tools/at.mjs <song> <bar.beat> [--span <bar.beat>]
    node tools/span.mjs <song> <from> <to>        # + pitch-class set (no drums)
    node tools/pitch-census.mjs <song> [--track T] # PCs present/absent, duration-weighted
    node tools/song-diff.mjs <old.mid> <new.mid>
    node tools/annotations.mjs <song> [--type T]   # + anomaly flags
    node tools/loop-targets.mjs <song>|--all       # loop-target methodology

<song> = a bare name (resolved under albums/) or a path.

## Shipping checklist (every user-facing feature, Josh's standing rule)

1. **Help dialog**: add/update the entry in index.html's help sheet
   (#helpsheet — tabbed; put it in the right section, touch gesture
   first, keyboard equivalent after).
2. **Full manual**: run `node tools/build_help.mjs` to regenerate
   HELP.md from the help sheet. Never edit HELP.md by hand.
3. **Drift guard**: add a keyword for the feature to the FEATURES list
   in tests/night-roll.test.mjs (the keyword must appear in the help
   sheet region). A separate test fails if HELP.md is stale — so a
   feature with no help entry, or an unregenerated manual, breaks the
   suite by construction.
4. Tests green: `npm test` (vm suite) and `npm run test:e2e`
   (Playwright gesture suite, chromium + webkit ≈ iPad Safari; WebAudio
   is stubbed in e2e — a real AudioContext stalls 20s in headless).
   Mid-iteration, `npm run test:e2e:smoke` runs the @smoke-tagged
   specs chromium-only (~2s); the FULL suite before every push stays
   mandatory — smoke is for the edit loop, not the ship gate.
   The harness (tests/harness.mjs) records element/document/window
   listeners and exposes dispatchEvent, a fake clock (app.tick(ms)
   drives setTimeout + performance.now — the 230ms dwell is
   deterministic), Set-backed classList, and the e2e suite's inert
   FakeAudioContext, so vm tests drive the REAL pointer handlers with
   plain event objects (pev() in harness.mjs; handlers only read data
   properties). tests/gestures.test.mjs holds these ports. Port
   discipline (advisor, 2026-08-23): a vm port lives alongside its e2e
   twin for at least one commit before the e2e spec retires, and every
   port must fail under a knocked-out gesture (mutation check) before
   it is trusted. Irreducible e2e core stays browser-real on chromium
   AND webkit: boot/viewport/CSS, one real drag + pen dwell + pinch,
   sheet visibility, and the button-wiring sweep (the vm stub has no
   querySelector — a vm test can never prove a button is wired).
   Browser-verify via claude-in-chrome, commit, push with hash check;
   the push-triggered Pages build deploys on its own (manual kicks
   collide with it and email failure noise — only kick if it hangs).

## Shareable links and the document title (2026-09-07, path form 2026-09-14)

**A song's link is its path with no extension**, and the same path with
`.mid` is the file (Pages serves it as audio/midi):

    https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush
    https://joshcough.github.io/night-roll/albums/compositions/nightroll/ambush.mid

Mechanics: `reflectSongURL` puts the path form in the address bar
(replaceState; other query params like `?perf=1` survive). Pages has no
file at the extensionless path, so `404.html` (repo root = the custom 404
for the project site) routes it: it finds `/albums/` in the pathname,
sets the tab title from the slug, and `location.replace`s to
`<root>?song=<path>.mid`. The app reads `songPathFromURL` — `?song=` in
either form (the pre-09-14 links keep working) or the path form — and
then reflects the path form again. One redirect hop per open/reload.

`APP_BASE` is the app directory snapshotted at script start and pinned
as a `<base>` element, so relative loads (vendor/soundfonts, albums/,
the dynamic `tools/nsf` imports, `songsBase` default "") keep resolving
against the app, not the song path, after the address bar changes.

Tab title and `og:title` are "<Song> · Night Roll" (setDocTitle): set
synchronously from the URL at script start, refined by updateSongBtn
once the catalog supplies the display title. Preview fetchers that run
scripts (Messages) see the song on the `?song=` hop; on the path form
they see 404.html's title — whether Messages previews a 404 response is
UNVERIFIED (2026-09-14). If it doesn't, the route is static per-song
stub directories (`albums/…/ambush/index.html`) with their own titles,
which also makes previews work for script-less fetchers — not built.

## Album play (2026-09-14; strip model the same day)

**The album is a strip, the transport is the song.** A second advisor
round after Josh found the first version confusing (a transport button
that meant "Album" idle and "Next" running; ⏮ meaning previous song
mid-run; a silent end that then restarted from the last song; a
three-state repeat button). Rulings, all shipped:

- **Entry only from File → Open… → album → 💿 Play album** (`fsubSongs`;
  "from 12/19" when the open song is in that album). No transport
  buttons, no View toggle.
- **A tinted strip** (`#albumstrip`, under `#trackrow`) exists exactly
  while `albumRun` does: "💿 3/19 Song · next: X", ⏮ Prev, ⏭ Next, ✕.
  `albumStrip()` renders it; `stop()`/`play()` call it so it dims while
  paused. Shown regardless of listener mode.
- **The transport never changes meaning.** ⏮ = bar 1. ▶/■/Space start
  and stop this song; inside a run that is pause/resume — `albumRun`
  stays, `play(fromSec)` recomputes `albumEndAbs` against `playOffset`,
  so the resumed song still ends and advances.
- **Prev/Next always mean songs and wrap at both ends**
  (`albumNextIdx`/`albumPrevIdx`). The list wraps forever; no repeat
  control — "this song forever" is ✕ (plain ▶ already loops).
- **✕ (`albumLeave`)** drops the run and keeps the song playing without
  an ending; with chip audio it restarts in place because the buffer
  source has a `stop()` scheduled that can't be unscheduled.
- **Leaving happens only on actions that change what is loaded:** ✕,
  picking a song in Open…, ● record, Download audio (`albumClear`).
- An armed cycle range makes the song loop the cycle and the album wait
  ("cycling — album waits" in the strip; `play()` sets no end).

**Ending a song (unchanged):** every song wraps forever on its own and
chip audio loops in hardware, so `albumEndSec` supplies the ending —
intro + ALBUM_PASSES (2) of the loop body, once through when nothing
lies inside the segment, capped at ALBUM_CAP_SEC (300). `play()` sets
`albumEndAbs`; the pump schedules nothing past it, `chipStart` adds
`src.stop()` at it, and the pump (the scheduler's setInterval, NOT the
rAF tick — background tabs get no frames) fades the master over
ALBUM_FADE (1.5 s) then calls `albumAdvance()`, idempotent.

**Sequencer:** `albumRun = {album, list, idx, passes, gen}`.
`albumPlayIdx(idx)`: wrap, crumb/URL, `await loadSong`, `await
song.notesReady` (the `loop:` directive must be in before `play()` reads
`currentLoop()` — this also fixed the old `pendingPlay` race), `await
updateChipBtn()` and an in-flight `chip.renderPromise` (15 s cap), then
`play(0, {noCountIn: true})`. A load failure skips the song. `gen`
guards every await. **Never a dialog mid-run:** `loadSongInner` keeps a
dirty draft when the repo is newer and says so in the status line.

Out of v1: shuffle, queue, lock-screen controls (needs a media element;
the silent `<audio>` keep-alive stalled the iPad in August).

## Local folder mode (2026-09-15) — saving without GitHub

Why: Josh's son has no GitHub account (Chrome on a MacBook Pro), and
GitHub removes content on a rights holder's notice, so a recording that
isn't yours needs a home that isn't a repo. Design: `local-folder-
design.md`.

**Model:** a folder on this computer is a fourth data location. Reads
try the folder first and fall back to the configured site (FF1 songs
keep loading from here; a song present in both opens from the folder).
Every write goes to the folder; nothing reaches GitHub and no token is
needed. The folder's layout mirrors the repo exactly
(`albums/<album>/<song>.mid` + `.rollnotes.json` + `.notes.txt`,
`album.json` for titles), so the folder IS a repo without git —
`git init` there and push if the user ever wants GitHub.

**Code (index.html, "local folder backend" after `cfg()`):**
- `fsRoot = {handle, name, mode: "picker"|"opfs", needsGrant}`;
  `folderActive()` is the ONE predicate every seam checks.
- Read seam: `readData(which, path, bust)` — folder first
  (`folderRead` → File), else `fetch(songsURL/analysisURL)`. Returns a
  Response-shaped object (`ok/status/text/json/arrayBuffer/fromFolder`).
  All six repo reads go through it: catalog is separate (below),
  rollnotes load (`loadNotes`, `buildRollnotesFor`), the cross-device
  freshness check, the `.mid` fetch in `loadSongInner`, `albumMetaFor`.
- Write seam: `putMidAt`, `putSongsText`, `putRollnotes`,
  `deleteRepoFile`, `batchCommit`, `renameRepoTitle`,
  `computeImportAlbumJson` each branch on `folderActive()` first.
  `updateManifest` is a no-op in folder mode (no manifest: the catalog
  rescans), and `commitImports` skips the NSF vault upload and the
  manifest rewrite. `writeToken()` returns the stored token or the
  placeholder `"folder"` so every token guard and `ghHeaders()` call
  keeps its shape; `takeToken()` (sync sheet) does the same.
- Catalog: `initCatalog` = site manifest ∪ `folderScanAlbums()` (same
  shape as `tools/build_manifest.mjs`: `albums/*/`, `songs/` subdir,
  subdirectories with their own `album.json`), union by path, folder
  titles win. Either source alone suffices — offline folder users still
  see their songs; the boot error fires only when both fail.
- Persistence: the directory handle is structured-cloned into
  IndexedDB (`ff1roll` v2, store `fs`, key `root`). Boot
  (`restoreFolder`) reloads it and checks `queryPermission`; if Chrome
  wants a fresh grant, `needsGrant` is set, `folderActive()` is false
  (reads fall back to the site), and **📁 Reconnect folder** shows at
  the top of the File menu — `requestPermission` must run in a gesture.
  `navigator.storage.persist()` is requested on first pick.
- UI: Settings sheet row `#folderrow` (`Choose folder…` / `Change
  folder…` / `Reconnect` / `Forget`; on Safari/iPad the row says it
  needs Chrome or Edge on a computer). `renderFolderUI()` also relabels
  File → "Save (to folder)" and "Revert to saved copy…". Status lines
  say "Saved ✓ to <folder>" instead of the Pages wait.
- `?folder=opfs` swaps `navigator.storage.getDirectory()` in as the
  root: same interface, no picker, not persisted. Playwright
  (`tests/e2e/folder.spec.mjs`, chromium only) and browser checks use it.
  The vm test drives the backend with an in-memory fake handle.

**Not done:** Safari/iPad fallback (a downloadable project bundle),
autosave-on-edit in folder mode (explicit Save kept for parity and so
Revert still means something), copying the FF1 corpus into a folder.

## ✦ Ask / ✦ Fill — in-app AI (P1a + P2a + P3 shipped 2026-09-25; design: local-llm-design.md)

The tutor half of the AI plan. `✦ Ask` in the top bar (hidden in listener
mode) opens `#asksheet`: a per-song conversation with any
OpenAI-compatible server. Code lives under `// ---- ✦ Ask (in-app AI)`.

- **Adapter:** `aiRemote()` — `listModels()` (GET `/v1/models`) and
  `chat({system, messages, signal, onDelta, schema})` (POST
  `/v1/chat/completions`, `stream:true`). `aiSSE(state, chunk)` is the
  SSE parser as a named global over STRING chunks so the vm suite can feed
  it; it ignores everything but `choices[0].delta.content`. Qwen-style
  `<think>…</think>` blocks are hidden while streaming and stripped from
  the saved reply. `schema` → `response_format: json_schema` (P2a).
- **Prefs:** flat `cfg()` fields `aiUrl` (default `http://localhost:1234`),
  `aiModel` (blank = the server's first), `aiWindow` (tokens, default 8192
  — LM Studio's usual loaded context; his 35B loaded at 8192). The key
  lives apart under `ff1roll-aikey`, like the GitHub token. One Save.
- **Test connection** (`aiTest`): five outcomes with the fix in the line —
  not a URL · mixed content (https page + http non-local URL, checked
  before any fetch) · HTTP status (401/403 → key) · reachable but CORS off
  (a `no-cors` opaque fetch succeeds where the real one failed) ·
  unreachable · OK + model list into the `<datalist>`.
- **Consent per host** (`aiHostOk`): `localhost`/`127.0.0.1` never prompt;
  any other host gets one `appConfirm` naming what leaves the device
  (annotations + notes), remembered in `ff1roll-ai-hosts`.
- **ONE frame:** every bar/beat in the protocol is the RULER's — display
  (chop-relative) bars, the declared meter's counted beat (`effTs()`,
  `beatTicks()`), durations in the same unit. `askSpanNotes(t0, t1,
  maxChars)` is `notesTxtFor()`'s shape with three deltas: declared meter,
  display beats, one speller — `pitchName(p, sfDeclaredAtRaw(t))` (null →
  sharps; a key-dial preview never leaks: `sfDeclaredAtRaw` is the
  keyRegions scan without `previewSf`, `sfDeclaredAt` wraps it). The key
  header line is conditioned on a key DECLARED over the span, not on the
  album. Committed `.notes.txt` files keep their quarter-based shape.
- **Span** (`askSpan`): the ruler selection (`rangeSel`) if armed, else the
  bars in view (`view.x`, `wrap.clientWidth`, `pxPerTick()`), bar-aligned.
  Frozen at Send (`askSpanFrozen`).
- **Context block** (`askContext`): sent ONCE per request on the current
  user turn, never stored. Song + composition flag (`isComposition() ||
  isLocalDraft() || songKey === null`), meter/tempo/bars, tracks with
  drums/muted flags, view + cursor, the key-state line, lasso pitches,
  annotations (capped), span notes (capped, "cut at bar N").
- **Budget:** `ASK_CPT = 2` chars per token — measured 7.3k chars → 3839
  tokens on Qwen 3.6 (note dumps are digits, not prose). Two profiles by
  `aiWindow`: ≤8k → anno 1000 / span 2000 / history 1000 tokens; larger →
  6000 / 8000 / 3000. Trim order: history (newest-first fill), annotations,
  span last. The status line shows the estimate and flags the small
  profile.
- **History** (`askSave`, rewritten 2026-09-25 — Josh: "I want it to just
  be forever until I save the session"): per song under
  `ff1roll-ask-<songKey>` as `{msgs, saved, trimmed, lastUsed}`, context
  stripped AT SAVE. No turn cap. `saved` counts, from the front, the
  messages the repo file already holds; only those are ever shed — past a
  256 KB soft cap per song, on quota, or (other songs' logs, LRU, 512 KB
  total) when the log has nothing unsaved. `trimmed` makes `askRender`
  show the shed part from the repo file (`askRenderEarlier`, one dim
  `.earlier` bubble). When even the unsaved ones don't fit, the oldest go
  and the status line says so. Every write try/caught.
- **The log file** (`askCommitLog`): the chat is part of the song's Save.
  Both commit doors (`commitCompositionNow`, the analyzed-song `ghsave`
  branch) append `askLogMarkdown(unsaved)` to `<song>.ask.md` — beside
  the .mid in the songs repo for compositions, beside the .rollnotes.json
  in the analysis repo for analyzed songs, in the folder in folder mode —
  then bump `saved`. Format: `### <when> · <bars>` per question,
  `**Josh:**` / `**AI (model):**` lines; messages carry `t`, `at`, `m`
  for this. Commit message "Ask log <path> from Night Roll". The
  contents API omits bodies over 1 MB, so the read falls back to
  `download_url`. The breadcrumb ● lights for unsaved chat
  (`askUnsavedCount`), the Save & Commit sheet lists it per song, the
  commit button reads "⇪ Commit song", and Clear chat asks first only
  when something is unsaved (Clear = new session; the file keeps what was
  saved). `ghsaveall` (annotation sweep) does not carry chat — Save the
  song for that. Purpose: session logs for code sessions — read
  `<song>.ask.md` the way you read a handoff.
- **Prompt** (`ASK_SYS`): a closing paragraph (2026-09-26, from the first
  real .ask.md) tells the model what it is inside the app — the context
  is attached by the app, it sees nothing else, it cannot write
  annotations, ✦ Fill is a separate button, what loop:/key:/section/chord
  lines mean, and to drop the music when the user says they are testing
  or not ready (Qwen kept steering back). Before that: the web-session rules — hints and direction
  first, confirm/refine a guess, one strong hint when asked, tell plainly
  when the user insists or gives up; concepts answered directly; the
  key-state line governs; never invent notes. Same rules on his own
  compositions (his ruling: no flip).
- **Dictation:** segments are joined by `micJoin` (2026-09-26): Safari
  returns one final segment per pause with no space or period and a
  capitalized first word; the join adds a space, and a period first when
  the next segment starts with a capital and the last ended without
  punctuation. vm-tested. Also the shared `micToggle` (🎤 Speak), as the annotation
  editor and ✦ Ask use. `micStop` detaches the recognizer's handlers
  BEFORE `stop()`: Safari delivers one more result after stop, which used to
  refill the Ask box Send had just cleared (2026-09-26). Dictation fires
  `input` on the box, so `askGrow` sizes `#askinput` to its text (CSS cap
  33dvh, the log gives way) and keeps the end in view.
- **Measured (2026-09-25, Mac, Qwen 3.6 35B-A3B via LM Studio):** 17 bars
  of Overworld = 3.8k prompt tokens; reply 39 s of which ~34 s hidden
  thinking at 60 tok/s. Slow but usable; a no-think switch is a candidate.
- **✦ Fill (P2a) — the generator half, under the Bassist's contract.**
  Entries: `#fillbtn` (✦ beside 🎸, behind ⋯) and Edit ▾ → Fill with
  AI… (`emAskFill`) open the same sheet via `openFill()`; on editable
  songs the sheet shows a **target row** (`#asktarget` picker + status)
  and a `✦ Fill` button beside Send. Gates = the Bassist's:
  `editableSong()`, meter change in range, never drums (drum tracks are
  not offered). **The target is chosen in the UI at Send** — the model
  has no track field; `askDefaultTarget` = the first melodic track empty
  in the span, else new; `askTargetStatus` names what a take replaces by
  onset and how many notes sustain in from before the span. The span is
  `askSpan()` (a ruler selection may reach past the song's end so a fill
  can extend an empty song). `askTakePrompt` appends TAKE MODE to the
  system prompt: JSON only, the ruler's bars/beats, pitch as
  letter+accidental+octave (C4 = 60), and the ruling on stacked vs
  one-at-a-time — if unclear, `notes: []` + `question`. Structured
  output: `ASK_TAKE_SCHEMA` via `response_format: json_schema` (LM Studio
  accepted it first try); on an HTTP 4xx the adapter degrades per URL to
  `json_object`, then none (`askSchemaMode`). `askParseTake` takes the
  outermost `{…}` (thinking stripped); `askValidateTake` returns hits in
  display ticks or the first error (bar in span, 1 ≤ beat < beats+1,
  dur > 0, `parsePitch` — pinned to `pitchName`'s octave, double
  accidentals accepted — window 24–108, ≤ 256 notes, onset inside the
  span); velocity = the Bassist's metric rule without bonus/jitter
  (`askTakeVel`: 96/88/78). A rejected take goes back to the model as the
  next user turn, up to three attempts. A valid take applies at once
  through `applyTake(ti, t0, t1, hits)` — extracted from `bsGenerate`
  and pinned by `tests/fixtures/bassist-golden.json` (three seeds → full
  note lists incl. velocities, rawNotes mirror, undo shape) — with a new
  track folded into the same ⟲ via `addTrackUndoable` + `undoTrackAdd`.
  Take chips (`askTakes`, cap 8, session-ephemeral) store the validated
  hits and re-apply on tap. The `why` line is shown only behind a "why?"
  button (Josh's ruling). History records a one-line summary, never the
  JSON. Measured: a 4-bar ask on an empty scratch song → 4 notes in ~65 s
  (all thinking; the JSON itself is ~100 tokens).
- **In-browser backend (P3) — WebLLM.** Settings → AI model → "in this
  browser": `aiBackend = "browser"`, `aiBrowserModel` from
  `AI_BROWSER_MODELS` (curated from WebLLM 0.2.85's prebuilt list, 0.4–3.9
  GB, all 4096-token windows → `askBudget` forces the 4k tier: anno 500 /
  span 1200 / history 300). `aiBrowser()` lazily `import()`s
  `AI_WEBLLM_URL` (jsdelivr, pinned 0.2.85, self-contained ES module —
  the first third-party-hosted runtime dependency, his §10.8 call; weights
  come from HuggingFace and cache in the browser's Cache API), creates one
  `MLCEngine` per model (`aiEngineFor`, progress into the status line),
  streams `chat.completions.create`, maps `schema` to WebLLM's
  `response_format: {type: "json_object", schema}`, sends `extra_body:
  {enable_thinking: false}` (Qwen3 there), aborts via
  `interruptGenerate()`. `aiProvider()` dispatches by backend; the
  browser path skips host consent (nothing leaves the device).
  **`aiBrowserTest` IS the device probe** (no separate probe page): WebGPU
  present → adapter limits (maxBufferSize, storage binding, shader-f16) →
  runtime loads → `hasModelInCache`. Verified on the Mac in Chrome with
  SmolLM2-360M: download + load + reply ≈ 25 s; the tiny model's answer
  was nonsense (it is labeled "for testing"). New web APIs are referenced
  only inside functions (the vm harness has no `navigator.gpu`).
- **Thinking models:** LM Studio streams Qwen 3.6's reasoning as
  `delta.reasoning_content`, apart from `content`; `aiSSE` counts it
  (`state.think`) and the adapter reports "thinking… (N words)" through
  `onStatus` so a 30 s wait is visible. No request-level switch turns it
  off — tried `chat_template_kwargs.enable_thinking`, `reasoning.effort`,
  top-level `enable_thinking`, `think:false`, `/no_think` (2026-09-25, LM
  Studio + Qwen 3.6 35B-A3B: reasoning came back every time). Thinking is
  a model setting in LM Studio, and the status line says so.
- **Settings sheet (rebuilt 2026-09-25 — Josh: "this settings dialog is
  starting to suck").** No Save button: a delegated `change` listener on
  `#settingssheet` calls `settingsPersist(id)` per field (token/key/dev
  topics to their localStorage keys, everything else through `saveCfg`),
  so Close/✕/backdrop/Esc never lose anything. AI section first (`runs` /
  `server` + Test / result line / `model` / `key` + context), then GitHub
  token, folder, and the three data-location rows inside a native
  `<details>`. Test writes to its own line `#cfgaitestout` via `aiSay`
  (✓ → `.ok` gold bold, ⚠ → `.err` red bold), disables the button while
  running, and aborts after `AI_TEST_MS` = 8 s with its own diagnosis (the
  sixth failure class). On ✓ it fills the `#cfgaimodel` `<select>`
  (`aiModelMenu`), picks `aiPickModel(ids, saved)` — the saved id if the
  server still lists it, else the first id without "embed" — and saves
  URL + model at once ("· saved" in the line). The saved model stays in
  the menu when unlisted ("(not on this server)"). Enter in the URL field
  runs Test. The adapter's blank-model fallback survives as a safety net
  but the UI never advertises it. Tests: none reference the sheet's ids
  (2026-09-25); browser-verified on the Mac.
- **Tools (2026-09-26 — Josh: "if I propose putting an F sharp minor
  chord annotation on 21.1, then it should just be able to do it").**
  `ASK_TOOLS` (OpenAI function schemas) ride every ✦ Ask request to the
  remote backend; `aiRemote().chat` runs up to five tool rounds: it
  accumulates streamed `delta.tool_calls` (`aiSSE` slots them by index),
  appends the assistant tool_calls message plus one `tool` result per
  call (`askRunTool`), shows "⚙ name…" in the status line, and continues.
  The APP runs every tool, so they behave identically on LM Studio, the
  Claude bridge, or any OpenAI-compatible server. Tools: `add_annotation`
  (kind chord/section/key/tempo/loop/note, text, bar, beat, optional
  end_bar/end_beat/comment — `askAddAnnotation` builds ONE line in the
  .rollnotes TEXT grammar and runs it through `parseRollnotes` +
  `dropSupersededBy` + `resolveNote`, exactly the editor's path; lands
  `added` = unsynced, with the ✕ in Save & Commit; a loop replaces a
  local loop as the editor does), `list_songs` (CATALOG), `read_song`
  (path/title → `readData("songs")` → `parseMidi` → `notesTxtForDoc`,
  6000 chars, optional bar range), `read_notes` (the .rollnotes.json as
  "[b.q - b.q] type: value — note" lines). `askSongPath` accepts a path,
  a title, or a bare file name. The prompt's closing paragraph limits
  add_annotation to what the user asked for in words — his rule: the
  model never volunteers a reading, it writes what he dictates. Fill's
  schema path sends no tools. The browser (WebLLM) backend ignores them.
- **The AI bridge (`tools/claude-bridge.mjs`, `npm run bridge`; 2026-09-26,
  generalized the same day — Josh: "I want to make sure everybody can run
  this with LM Studio or Claude Code or both, or Ollama").** A
  dependency-free Node server (Node 18+) speaking the OpenAI protocol,
  meant to be THE server Settings points at. Flags/env in the file header:
  `--port/--host/--token`, `--upstream name=url` (repeatable; without any,
  LM Studio :1234 and Ollama :11434 are probed and listed only while
  running), `--no-claude`, `--claude read|full` (default read), `--repo`,
  `--jobs-dir`, `--keep-hours`.
  - **Models:** `GET /v1/models` = `claude-code` when the `claude` CLI is
    installed, plus every model each upstream lists right now (a shared id
    becomes `<upstream>/<id>`); the app's Test/dropdown just work. A turn
    for an upstream model is forwarded with `stream: true` and the app's
    `tools` as-is; a turn for `claude-code` runs `claude -p
    --output-format stream-json --include-partial-messages
    --append-system-prompt …` in `--repo`, with `--tools Read Glob Grep
    WebFetch WebSearch` in read mode and no restriction in full mode
    (full = whatever this machine's Claude Code may do; Josh's global
    permission mode is "auto", so his bridge edits, tests, commits and
    pushes on his "go" — the first session did, c2f0bcf and 9cc232a —
    and the full-mode prompt binds CLAUDE.md: announce first, vm tests
    under an alarm, never Playwright, push and report the hash, never
    touch albums/compositions/ unasked). App tools reach Claude as a
    one-line `{"tool_call":{…}}` convention; the bridge holds the first
    characters until prose and JSON can be told apart and emits OpenAI
    `tool_calls`; `tool` messages return as "TOOL RESULT" lines.
  - **Jobs** (the iPad problem: Safari suspends a backgrounded tab and
    drops the connection): every turn is a job keyed by the app's
    `x-nr-job` header; it runs to the end with or without a listener,
    keeps every chunk, replays them to a second POST with the same id,
    answers `GET /v1/jobs/:id` (status/text/notes/result) and `DELETE`
    (kill → error "stopped"); `GET /v1/jobs` is the capability probe.
    Finished jobs are written to `--jobs-dir` (default
    `~/.night-roll-bridge/jobs`) and kept until fetched + `--keep-hours`
    (24; 7 days unfetched), so a restart keeps answers. Claude's own tool
    uses stream as `reasoning_content` notes (the app's thinking
    counter). 20-minute cap per turn.
  - **App side of a job** (2026-09-26, Josh: "scroll away … work on a
    song … get a notification"): the question is saved at Send with a
    `pending: <jobId>` marker; `askResume` polls `/v1/jobs/:id`
    whether or not the sheet is open (only a hidden tab pauses it);
    `askFinish`/`askFail` take the store key captured at Send, so the
    reply lands in the song that asked even if another song is open.
    `askLanded`: sheet open on that song → `askRender` (the live
    bubble may be a stale node after a close+reopen); otherwise the
    footer's gold `#askreplybtn` ("✦ reply", the ⚠ pattern: stays until
    tapped, opens Ask) plus one info-strip line naming the other song
    when it differs. `openAsk` clears it. Test: "Ask reply badge".
  - **Sessions + the inbox (2026-09-27, Josh: "I can't message you back
    without getting out of bed, which is why I want the bridge to be
    able to have the model then talk to you").** Each song's chat is ONE
    Claude Code session: the app sends `x-nr-song` (song key, or
    `draft:<name>`), the bridge maps it to a uuid in
    `~/.night-roll-bridge/sessions.json`, runs the first turn with
    `--session-id` and every later one with `--resume`, and sends only
    the tail after the last real reply (`flattenTail`: the new question,
    or this round's tool call + results) — Claude remembers the rest. A
    session Claude Code no longer has (stderr mentions session/
    conversation) is started over once with a new id. Proven live:
    a word remembered across two `claude -p` processes. `BRIDGE_SYS_LINK`
    tells that Claude it can reach "the terminal" — with full tools a
    `-p` session HAS ListAgents/SendMessage (restricted `--tools` drops
    them), and its note arrives in the terminal session as a
    cross-session message mid-turn. The way back is the inbox:
    `node tools/claude-bridge.mjs --say "text" [--from who]` posts to
    the running bridge (`POST /v1/inbox {text, from}`, kept in
    `inbox.json`, last 200); the app polls `GET /v1/inbox?since=<id>`
    every 60 s while visible, on Ask open and on visibility change (only
    a host already allowed for Ask; a 404 marks the server inbox-less),
    stores each note in the open song's chat as `role: "note"` (saved
    like any message; the log writes `**Mac (from):**`), shows a gold ✉
    bubble, and lights ✉ on the Ask button until opened. The song's
    session also gets unseen notes at the top of its next prompt
    ("NOTES FROM THE TERMINAL"), so "did the terminal answer?" is
    answerable. `GET /v1/jobs` now says `inbox: true`. Tool rounds get
    their own job id (`<job>-r<round>`) — the same id replayed round
    one's tool call forever through the bridge.
  - **General chat (2026-09-27, Josh via the bridge: "some sort of main
    ask section that's not per song").** `askGeneral` (device pref
    `ff1roll-ask-mode`) is picked by the ♪ this song / ✦ general toggle at
    the top of the sheet. In general mode: store key `ff1roll-ask-general`
    (`ASK_GENERAL_KEY`), bridge session name `general` (so it is one more
    entry in sessions.json), `askContext` is one sentence saying no song
    is attached, `askToolsNow()` drops add_annotation, the span/fill rows
    hide, and the log is the repo-level `ask/general.ask.md`
    (`ASK_GENERAL_LOG`; `askLogPath/askLogHeader/askCommitLog` take a key).
    Publishing: `pendingSongs()` lists "general" when it has unsaved
    messages; the PUBLISH sheet renders it as its own block with a
    Publish chat button, and Publish all ships it first. A song's Publish
    still ships the SONG's chat even while the general tab is showing
    (`askCommitLog` picks the song key unless given the general one).
    Test: the general-chat block in the "Ask: history is whole…" test.
  - **Security:** binds 127.0.0.1 unless `--host`; `--token` requires
    `Authorization: Bearer` (the app's Settings key); CORS open (the app
    is a static page). TLS is someone else's job: Josh uses `tailscale
    serve --bg --set-path /claude 8787` → `https://<mac>.<tailnet>.ts.net/claude`
    (tailnet-only); Caddy or any reverse proxy works the same.
  - **Tests:** tests/bridge.test.mjs runs the bridge with `--no-claude`
    against a fake upstream: model merge with prefixing, a job outliving
    a dropped client, replay on re-attach, tool_calls assembly,
    non-stream on a finished job, kill, 404, the token gate, the inbox
    (POST/GET/since, the `--say` client, token). In `npm test`.
  - **Always on (2026-09-26):** `sh tools/launchd/install.sh --claude full
    --upstream lmstudio=http://localhost:1234` installs
    `~/Library/LaunchAgents/com.nightroll.bridge.plist` (template in
    tools/launchd/, absolute node/repo/PATH filled in, RunAtLoad +
    KeepAlive, log `~/Library/Logs/nightroll-bridge.log`); `--uninstall`
    removes it. Installed on Josh's Mac that night. LM Studio's own
    start-at-login is separate (`lms server start --cors` otherwise).
- **iPad route (P4) — done 2026-09-25.** Josh's iPad asks the Mac's LM
  Studio over Tailscale, verified end to end (Test listed the models,
  ✦ Ask answered). Exact recipe on the Mac: `lms server start --cors`
  (not persistent across reboots); Tailscale on both devices, same
  account; admin console → DNS → MagicDNS + HTTPS Certificates on, and
  Serve approved once from the link `tailscale serve` prints;
  `tailscale serve --bg 1234` (persists; undo with
  `tailscale serve --https=443 off`). That proxies
  `https://<mac>.<tailnet>.ts.net` → `localhost:1234` with a real cert;
  LM Studio's CORS headers pass through the proxy unchanged (preflight
  from the Pages origin returns `access-control-allow-origin: *`).
  Settings on the iPad: URL = that https address, model = the id LM
  Studio loaded (blank picks the server's FIRST listed model, which was
  the wrong one — a Settings redesign is queued in open-items.md).
  Never run the Tailscale CLI without a timeout — it hung the shell
  while the system extension was down.
- **Not yet:** the in-browser path's Test on the iPad (WebGPU limits are
  the unknown), the P0 Safari-on-Mac probe. Tests: SSE
  parser, 6/8 frame + speller + key line, storage caps + quota, host
  classing, `parsePitch`, validator fixtures (one per rule, 6/8 + chop),
  `applyTake` undo/mirror, target default rule, Bassist golden fixture,
  FEATURES keywords `✦ Ask` / `✦ Fill`.

## Publish + share links (Phase 1 of the iPad app plan, 2026-09-26)

**Words (step 1, 5add982):** the one deliberate step that sends a song
to the repo is **Publish** everywhere — File → Publish…, the footer
button (`#syncbtn`, "Publish (N)" when several songs are pending), the
PUBLISH sheet, ⇪ Publish song / Publish all, "Publishing…" /
"Published ✓" ("Save…" wording in folder mode). Drafts still land on the
device by themselves; Revert to repo copy is unchanged. Josh's open
design point: a user who never publishes has no checkpoint — a
Logic-style local Save is queued (open-items).

**Share links (step 2):** a link = this player + the song + where the
song lives. `?songs=owner/repo` (or a full base URL) puts the page in
**link mode** for that load only: `LINK_SONGS` (declared beside
`APP_BASE`; `linkSongsBase` parses, `linkRepoLabel` shortens a raw
GitHub base back to owner/repo) overrides the songs AND analysis bases
(mirror tree), `readData` skips the folder, `initCatalog` skips the
folder scan, `loadSongInner` skips this device's drafts, `loadNotes`
skips the local notes stash and the last-sync bridge, `setSong` skips
the meter stash, `rememberLastSong` (every last-song write) is a no-op,
`editableSong()` is false, `openEditor` and `askAddAnnotation` refuse,
the Publish sheet says whose songs these are and disables publishing,
the breadcrumb starts "🔗 owner/repo ›". Nothing is written, nothing is
remembered: a listening room. Path-form URLs keep the param
(`reflectSongURL` preserves every param but `song`; 404.html and the
service worker's offline redirect both keep the query), so the address
bar is the link. **🔗 Share link** in the Publish sheet → `shareLinkFor`
(path form; `songs=` only when the song lives elsewhere — a followed
link or a custom `songsBase`) → `navigator.share` on the iPad, else the
clipboard. Test repo: `joshcough/night-roll-test-songs` (a generated
scratch song; safe to delete). vm-tested: parse, label, link building;
browser-verified against the test repo over raw.githubusercontent.com.
Not yet: `analysis=` as a separate base (the mirror tree makes it
unnecessary so far); opening a link in the installed app offline
(cross-origin, so the SW passes it through).

**Connect GitHub (step 3):** Settings → GITHUB is a two-step setup —
"1. repo" (`#cfgsongsrepo`, promoted out of the advanced rows, with a
"create one ↗" button to github.com/new) and "2. token" (`#ghtoken`,
"make one ↗" to the fine-grained-token page, and **Check**). `ghCheck`
GETs `api.github.com/repos/<repo>` with the token; `ghCheckMessage`
maps 200+push / 200 read-only / 401 / 404 / 403 to one line each with
the fix in it, shown gold/red via `aiSay` in `#ghcheckout`; it runs by
itself when the sheet opens with a token stored. Defaults: a new user's
`analysisRepo` follows `songsRepo` (`cfg()` falls back to it, and
`settingsPersist("cfgsongsrepo")` moves analysisRepo along whenever the
two were equal — a deliberate split in the advanced rows stays split).
The Publish sheet's no-token line now says "Connect GitHub first". Josh
generated a new token for the home-screen app the same evening (the
installed app has its own storage; a token is never shown twice).

**The repo's song list (step 4):** after the manifest update,
`commitCompositionNow` calls `writeSongsReadme(h)`: GET the manifest
through the API, `songsReadmeBlock(albums, repo)` renders every album's
songs as player links (`shareLinkFor(path, repo)`; `APP_REPO` =
`joshcough/night-roll` needs no `songs=`, any other repo gets it),
`spliceReadme(existing, block)` creates the README, appends the block to
one without markers, or replaces only what sits between
`<!-- night-roll:songs -->` and `<!-- /night-roll:songs -->`, and a PUT
follows only if the text changed (one stale-sha retry). Never fatal: a
failure is a parenthetical on the "Published ✓" line. This repo's
README was seeded with the block (84 songs) so the first real publish
just refreshes it. Not run live yet (needs a publish); the block and
splice are vm-tested. Folder mode skips it.

**Settings, simplified (step 5a, same evening — Josh: "do we have a
reason for it to even exist?"):** the "data locations (advanced)"
rows are gone from the sheet. Songs are read from the site (other repos
arrive through links), annotations follow the songs repo, and the
**NSF repo** is now a visible optional field under GITHUB: chip audio
plays the original NSF, so publishing an imported album uploads its
.nsf there (a separate repo keeps game files out of the songs repo — a
takedown cannot touch the songs). Defaults in `cfg()`: `nsfRepo` is
Josh's public archive only when the songs repo is this site's; anyone
else starts with none, and `nsfBase` derives from `nsfRepo` when set.
With no NSF repo the import publish keeps the file on the device and
says so in the status line instead of failing. The cfg keys
`songsBase`/`analysisBase`/`analysisRepo` still exist for stored
values and the mirror-tree fallbacks; nothing writes them from the UI
any more.

## Installable app — PWA (Phase 0 of the iPad app plan, 2026-09-26)

`app.webmanifest` (NOT `albums/manifest.json`, the song catalog) +
`icons/` (generated by a dependency-free PNG writer — dark tile, three
note bars in the track colours, gold playhead; 192/512/maskable/
apple-touch) + `sw.js`, registered at boot from `APP_BASE` (scope =
the app directory, so `/night-roll/` on Pages). Head carries the
manifest link, `theme-color`, the `apple-mobile-web-app-*` metas and
the touch icon; header/footer already pad by `env(safe-area-inset-*)`.

**sw.js strategy** (same-origin only; GitHub's API, model servers, the
WebLLM CDN pass through untouched):
- navigations: network-first with a 4 s timeout, else the cached
  index.html — so a stale page can never stick while a network exists.
  The network fetch is `cache: "no-cache"` (revalidate): the browser's
  own HTTP cache answered a plain fetch and a reload showed the previous
  build (found 2026-09-26 while checking Settings at iPad width).
  A **path-form song URL offline** is redirected to `./?song=…` (what
  Pages' 404.html does online); serving index.html AT that path made
  the app take the song's directory for `APP_BASE` and every relative
  fetch missed (found in the first browser check).
- `vendor/vexflow.js`, the manifest, icons: cache-first, precached.
- `vendor/soundfonts/*`: cache-first, cached on first use — 83 MB is
  never precached (iOS quota, slow installs).
- `albums/**` incl. the catalog: network-first with cache fallback; the
  `?t=` buster is stripped from the cache key, so cross-device freshness
  keeps working online. **Every catalog song is warmed into the cache**
  (`warmSongs`: on activate and on a "warm" message the page posts at
  every online boot) — all albums together are ~1.2 MB of .mid +
  .rollnotes.json + album.json, so any song opens offline, not just the
  ones opened before (Josh's first airplane-mode test: a fresh song
  "just hangs"). Soundfonts stay cache-on-first-use. Two footguns met on
  the way: the manifest Response must be cloned BEFORE `.json()` reads
  it, and `readData` now aborts a fetch after 12 s (`AbortSignal.timeout`)
  so a hung CDN or a dead network cannot lock `songLoading` for good —
  `loadSong` catches, says "couldn't open <song> — offline and not on this
  device yet" in the info strip, and returns false (the old CDN-blip hang
  in open-items is closed by this).
- `sw.js`, `404.html`: never intercepted.
One cache, `night-roll-<SW_VERSION>`; a new version drops the old
cache on activate (`skipWaiting` + `clients.claim`). Kill switch:
`?sw=0` unregisters and clears (the PERF_FLAGS reader). The File menu's
build line says "· installed" in standalone mode and "· offline" when
the browser reports no network. Tests: tests/pwa.test.mjs (manifest
valid + icons exist + not the catalog's shape; head links; sw.js parses,
precache entries exist, soundfonts never precached, cross-origin passes
through). Browser-verified on the Mac: install, precache, song cached on
open, server stopped → page and song load; path-form URL offline →
redirect → song loads. Josh's iPad: Safari → Share → Add to Home Screen.

## Dev channel — removed 2026-09-26

The `?dev=1` in-app dev channel (💬 Feature request → ntfy request
topic, 🛰 replies via EventSource, history sheet, two Settings fields)
is gone: the AI bridge in full mode does the same job synchronously
from the ✦ Ask sheet and the conversation lands in `<song>.ask.md`
(Josh: "absolutely the dev channel is gone"). Code lives in git history
(last at 88b83b0). The deploy-notice ntfy topic used by terminal
sessions is unrelated and stays.

## Recording past the end (2026-09-26)

Josh's son (MIDI keyboard, arpeggiator) recorded into a fresh two-bar
song and the take looped onto bars 1–2. `playSec()` maps transport time
back into `loopSeg` (0 → song end) and the scheduler re-arms a pass at
the end. While `recording`, `play()` now replaces the segment with
`recOpenEnded(seg)` (same start, `end: Infinity`): `playSec` stays
linear, the wrap loop breaks on a non-finite end, chip-buffer loop
points clamp to the buffer, and `recFinish` → `computeSongEnd` grows the
song to the take's last bar. `recFinish` also writes the draft, so the
take is in the working copy immediately. ● can only be armed from a
stop (● while rolling = stop), so the check in `play()` covers every
path.

## Compare with repo (2026-09-25)

Josh: "I have seven songs where it says the notes are changed, but I
don't know what things have changed." Option 3 of three (the others,
queued: a what-changed list in Save & Commit; an undoable Revert).

- **Entry:** View → "⇄ Compare with repo" ("saved copy" in folder mode;
  dimmed unless the open song is a composition with a key), or the
  **Compare** button on the open song's "♪ music edited" line in Save &
  Commit. `cmpEnter` reads the saved .mid through `readData("songs", key,
  bust)` (folder first, then the site — the same door every load uses),
  `parseMidi`s it, rescales ticks if the ppq differs, and stores `cmp =
  {repo, diff, showing: "mine", mine: null}`. Refuses with a chop applied
  (`chopS > 0 || chopE !== null`; `appliedChop` is a string key, truthy always) and on a song with no save behind it (404 → "no saved
  copy … yet"). `setSong` clears it: compare belongs to one song.
- **Diff** (`cmpDiff`, pure, vm-tested): tracks matched by name, unnamed
  ones by position (`cmpTrackKey`); a note's identity is tick+pitch
  (tools/song-diff.mjs's rule); `gone` notes count as removed; a changed
  note = same tick+pitch, different `d` or `v`. Result: per-track
  `{name, ti (current index or -1), added, removed, changed:[{was, now}]}`
  plus totals.
- **Roll:** `drawCompare` runs inside `drawFull` after the note loop (so
  the scene cache holds it): red outline = the saved copy's note, gold =
  yours, both on a changed note; **dashed = absent from the version you
  are hearing**. Tracks with no current counterpart are counted in the
  bar, not drawn (nowhere to put them).
- **Swap** (`cmpShow`): "hear the saved copy" stops the transport,
  remembers `song.tracks[i].notes` in `cmp.mine`, swaps copies of the
  saved notes into the SAME track objects (voices, gains, mute/solo,
  lanes keep working), clears selection and the lane/32nd caches,
  recomputes the song end, and resumes from the same second with no
  count-in. Swapping back restores the original arrays (undo entries
  keep their indices). While `cmp.showing === "repo"`: `editableSong()`
  is false (every edit path and the edit keymap go quiet), `saveDraft`
  returns without writing (the one way this could have destroyed his
  edits), and `commitCompositionNow` refuses with a message. Leaving
  compare always swaps back first.
- **Bar** `#cmpbar` above the roll: what you hear, +yours-only (gold),
  −saved-only (red), ~changed, the swap button, ✕. Help: Views → "⇄
  Compare with repo". FEATURES keyword "Compare with repo".
- `let cmp` lives with the early editor state (next to `multiSel`), not
  in the compare chapter: `setSong`, `editableSong` and `renderViewMenu`
  read it, and the phone-folded boot renders the View menu before the
  script's tail has run — b590306 bricked that boot (TDZ), the e2e
  "phone-size boot … (no TDZ bricks)" caught it, 060a491 fixed it. Any
  new `let` that boot-path code reads goes up there too.
- Not done: playing a track that exists only in the saved copy (no
  track object to play it through); compare under a chop.

## Audio tracks — recordings as tracks (branch `audio-tracks`, 2026-09-15)

Josh's son: "I wouldn't use it unless it supported waves." Design and
the advisor review that reshaped it: `wave-tracks-design.md`. Depends
on local folder mode (above) for a home that is not GitHub.

**Model.** An audio track is an ORDINARY empty track in the .mid (what ＋
creates) plus one `audio:` annotation naming it. Caveat found on the
first round trip: `parseMidi` keeps only tracks that have notes, so a
song reloaded from its saved .mid arrives WITHOUT the clip's track;
`applyAudioDirs` recreates it by name on editable songs (the
`addTrackUndoable` shape, so trackState/rawNotes stay in step). In
practice, then, the annotation is the track's identity and the .mid
entry is a courtesy for Logic:
`audio: <track> file=<slug> offset=<sec> local=1` /
`{"at":[5,1],"type":"audio","track":"guitar","file":"take.m4a","offset":0.25}`.
`applyAudioDirs()` (from `finalizeNotes`, right after the `track:` pass)
derives `tr.kind = "audio"` and `tr.clip = {file, at (tick), offset,
local, dur, buffer, peaks, status, where, note}` onto the named track,
last-wins per name, and clears them when the annotation is gone — the
voice/color mechanism exactly. The text form is canonical (every type
round-trips through text; `saveLocalNotes` persists text). Moving a clip
changes the note's identity, so `setClipDir()` tombstones the old note
and pushes a fresh `added` one (one `anno` undo entry). `renameTrack`
migrates the directive. `serializeNotesList` dedupes `audio:` per track
like `track:`. Filenames are slugified (`slugFile`) — the kv grammar is
`\S+`.

**Pieces (same day, Josh: "trim, cut, and move").** A track holds
`tr.clips[]`, one per `audio:` note; `len=<sec>` joins `offset=`. A piece
spans `[at, at + len]` in song time and plays the file from `offset`
(nothing sounds before its anchor — the earlier "file head before the
anchor" reading is gone). `clipLen(c)` = `len` or the rest of the file.
Dedupe is exact-twin only (anchor + text), not per track. `writeClips(ti,
clips)` rewrites all of a track's audio: notes in one `anno` undo step;
`setClipDir(ti, ci, patch)`, `moveClip`, `trimClip(ti, ci, "L"|"R",
dTicks)` (left keeps the sound in place: anchor and offset move together),
`splitClipAt(ti, ci, tick)`, `deleteClip(ti, ci)` all go through it.
`selClip = {ti, ci}`. `hitTracksClip` returns `{ti, ci, zone}` with
finger-sized edge zones (`clipL`/`clipR`, only on an already-selected
piece); the ghost carries the zone so the waveform's visible window
stretches with a trim. The edit row's ✂ splits a selected piece when no
notes are selected; Erase tap removes a piece. Files decode once per
file (`audioEnsureFile`), shared by every piece; upload is per file.

**Bytes.** `audioBytesFor(key, file)`: this device's IndexedDB
(`ff1roll` v3, store `audio`, key `<songKey>|<file>`, written at import
BEFORE decode — Safari detaches the buffer) → `readData("songs",
<song>.audio/<file>)` (folder, then site). `uploadAudioClips()` runs
inside `commitCompositionNow` after the three text files: device-only
clips go up via `putMidAt(path, h, bytes)` (folder write or Contents
PUT), then `clip.where` flips to folder/repo. `local=1` ("someone
else's recording") is never uploaded — the DMCA rule, design §14.

**Decode.** `decodeAudioBytes()` uses an `OfflineAudioContext(1, 1,
48000)`: no user gesture needed (the main context can't exist at page
load), and an AudioBuffer plays in any context. Downmixed to mono inside
the callback; `peaksOf()` = min/max per 256 samples. `audioBufCache`
(songKey|file) survives `finalizeNotes` re-runs; `audioEnsure(ti)` is
idempotent per file and re-applies onto whatever track object holds
that file now. `audioReady()` is what album play awaits (15 s cap, like
the chip render).

**Playback.** `buildSchedule` pushes one event per clip: `{ti, n: {ch:
0, _clip}, sec: tickToSec(at) − offset/playRate, dur: clip.dur/playRate}`
— sec/dur are WALL seconds like every event (`tickToSec` already divides
by playRate); buffer offsets are file seconds. `scheduleNote` dispatches
`n._clip` → `scheduleClip(ti, clip, when, durSec − (when − when0))`
right after its now+3ms bump, so the bump advances INTO the file rather
than delaying it. `scheduleClip`: offset = `clip.dur − durSec·playRate`,
a gain per pass with 5 ms ramps (a pass boundary cuts and restarts
mid-waveform), `playbackRate = playRate` (tape-style, as chip audio),
node tracked in `audioSrcs` and pruned `onended`. The pump clamps a
clip's duration to the pass end and to `albumEndAbs` (`clipClamp`) —
MIDI notes never needed that. Both chase loops now run for clips even
while cycling (`cycling && !e.n._clip → continue`): a clip is the
track, not a tail. `stop()` calls `audioStopSrcs()`. `albumLeave`
restarts in place when a clip is playing (its stop() can't be
unscheduled); `computeSongEnd` includes `clipEndTick()`.

**Guards (`kind === "audio"`):** `voiceType` counts MIDI tracks only for
"last = triangle" (an added take used to demote the bass to a pulse);
`trackIsDrums` → false ("drums-di.wav" is a take); `drBassTrack` skips;
the tracks-view retrack guard and `moveSelectionToTrack` refuse a clip
lane; `buildScoreModel` draws no staff; both pencil paths refuse.

**Display.** Tracks view: `drawClipLane` (peaks per pixel column,
edges, gold outline when `selClip === ti`), `hitTracksClip`, tap =
select + `clipLabel` in the status line, second tap = play from the
clip's start, hold-and-drag = `pendingEdit {kind: "clip"}` → ghost via
`tracksGhost.dT` → `moveClip` on release. Every view: `drawAudioStrip`,
an `AUDIO_STRIP_H` (18 px) band folded into `RULER_H` when the song has
audio. Chip label and lane header carry " ∿".

**UX.** `＋∿` chip (own `#audioinput`, `accept="audio/*"…` so iOS opens
Files) and File → Import… (`audioMagic` sniff: RIFF/WAVE, FORM/AIFF,
ID3, MPEG sync, ftyp, fLaC, OggS) → `importAudioFiles()`: locked songs
are refused with the Save As hint; > 20 MB (`AUDIO_SIZE_GATE`) asks
"store as 16-bit mono WAV" (`monoWavBytes`) vs as-is; lands at the
cursor's bar as a new track named from the slug; one group undo. The
voice menu becomes the **recording sheet** (`buildClipControls`) for an
audio track: starts ±bar/±beat, offset ±10/±100 ms, ⇤ Align first sound
(first peak bucket over 0.02), Replace file…, ☐ someone else's
recording, m4a caveat; rename/fader/color/delete stay.

**Tests.** vm: annotation identity, derivation, guards, schedule
event math at two speeds, song end, move-rewrites-annotation,
serialization dedupe, sniff/slug/WAV encoder. Playwright
(`tests/e2e/audio.spec.mjs`, chromium, `?folder=opfs`, fixture
`tests/e2e/fixtures/tone.wav` — 1 s, 250 ms leading silence): import →
decode → schedule → align → Save beside the .mid → reload from the
folder.

**Pitch-preserving slowdown (2026-09-17, Josh: "Amazing Slow Downer keeps
the pitches"; plan B of two).** `wsolaStretch(input, rate)` — WSOLA:
1024-sample Hann grains at a 512 synthesis hop, each analysis grain
chosen within ±128 samples of its nominal spot by best correlation with
the previous grain's natural continuation (decimated ×4), overlap-added
and normalized. Runs in an inline Blob worker (`stretchInWorker`; falls
back to inline where there is no Worker, e.g. the vm). `stretchCache`
(songKey|file|rate → {status, buffer}); `stretchEnsureAll()` on
`applySpeed`, at `play()`, and when a decode lands at a non-native rate;
other rates are evicted, `setSong` clears. `scheduleClip` uses the
stretched buffer at playbackRate 1 (offset ÷ rate) when `keepPitch()`
(device pref `ff1roll-tapestyle` absent = keep pitch), else tape-style
as before; a piece whose stretch is still rendering is silent for that
pass and the lane says "⏳ preparing 50% (pitch kept)…". `audioChaseNow
(file)`: a buffer that lands MID-PASS (decode or stretch) is scheduled
from the current position at once instead of waiting for the wrap. Cost:
~1 s per 3-minute take on a Mac (worker warm ≈ 160 ms for 6 s); RAM = one
stretched copy per file at the current rate. Quality: fine to ~40%.

**Beat mapping (tempo level 2, 2026-09-17; Josh: Logic's Smart Tempo
is automatic).** `onsetCurve()` (unit-variance rises of the peak
envelope; the first frame compares against the bucket before the window
or silence, else beat one lands late), `beatTrack(on, period)` — the
Ellis 2007 DP: `score[t] = on[t] + max_g(score[t−g] − 100·ln²(g/P))` over
gaps P/2..2P, backtrace from the strongest recent frame (negative running
scores allowed so the chain reaches the first beat). `clipBeatMap(c,
shift)`: period from `tempoFromPeaks`, downbeat phase = beat 0 unless
another class is clearly more accented (+0.35σ), `± shift` for the
user's correction, then per bar `bpm = quartersPerBar·60/D` to two
decimals (one decimal drifted ~0.1 s over 100 bars), plus `offBars`
(bars > 35% off the median: a slipped beat). `applyBeatMap(ti, ci, map)`
requires the piece's anchor on a bar line, replaces `tempo:` notes over
bars b0..b0+N−1 and writes one per bar; one anno undo; the map is
rebuilt by `finalizeNotes` (compositions author tempo through
annotations, captures refuse). Test: a synthetic 100→112 BPM take maps
to rising per-bar tempos with bar 2 within 15 ms of its downbeat.

**Not in v1:** mic recording, per-piece looping, fades,
a waveform in the roll, a dedicated audio repo (bytes go
where the song goes: folder or songs repo — Josh's ruling pending),
Save As / Move to… carrying `.audio/` along (they copy the annotation;
the bytes must be re-imported until that lands), orphan cleanup.
