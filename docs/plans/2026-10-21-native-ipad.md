# Native iPad Night Roll: plan

Josh #871: "If you run out of things to do, start converting Night Roll to a native iPad application." Planner draft, 2026-10-21. Nothing is built yet. This plan builds on docs/plans/2026-10-09-plugins-and-native.md (Stage 3 there, "native audio grown under the web UI").

## 1. What the web app does today (sizes)

| Area | Where | Lines |
|---|---|---|
| UI: chrome, sheets, note editor, windowing, voice menu, mixer, study sheet | `src/ui/` + `index.html` (1.8k) + `css/app.css` (1.3k) | 11.3k |
| Audio: Web Audio voices/soundfonts/SF2 (`voices.js`), transport pump 0.6 s ahead (`transport.js`), chip renders (`chip.js`), stream mode for big PS1/PS2 songs (`chip-stream.js`, 600 MB app budget), clips, bounce, metronome, loudness | `src/audio/` | 4.7k |
| Console emulators + capture (NSF, GBS, SPC, VGM, PSF/PSF2, USF), run in a Worker | `tools/chip-worker.mjs`, `tools/{nsf,gbs,spc,psx,ps2,n64,vgm}/` | ~16k (tools/ total 33k) |
| Ask / Front Desk / Worker: tools registry, context, actions, bridge client | `src/ask/`, `vendor/ai/` | 4.5k |
| Model: song, edits, selection, `.rollnotes.json` v1/v2 (spec: NIGHT-ROLL.md "## .rollnotes format"), versions, provenance | `src/model/` | 3.4k |
| Render: piano roll (canvas), score (VexFlow, `vendor/vexflow.js` 970 KB), tracks view | `src/render/` | 2.1k |
| Input: gestures, keyboard, recording, CoreMIDI (via `CoreMidiPlugin`) | `src/input/` | 2.1k |
| Theory, generators (drummer/bassist), import hub/capture | `src/theory/`, `src/gen/`, `src/import/` | 4.3k |
| MIDI parse/write, session, publish/sync, platform/storage | `src/midi/`, `src/session/`, `src/sync/`, `src/platform/` | 3.1k |

**Data on the iPad (Capacitor app `com.joshcough.nightroll`, origin `capacitor://localhost`):**
- localStorage: `ff1roll-draft-<key>` (working copy; big imports keep a stub here plus `tracksRef`), `ff1roll-notes-<key>`, `ff1roll-ts-<key>`, `ff1roll-versions-<key>` (last 20, Model B), `ff1roll-edits-<key>` / `ff1roll-retired-edits-*`, `ff1roll-ask-*`, `ff1roll-desk`, study drafts, `ff1roll-cfg` (GitHub token), about 40 UI prefs.
- IndexedDB `ff1roll` v6: `drafts`, `audio` (clip bytes), `sf2`, `nsf`, `fs` (folder handle), `repo` (cache only).
- Files mirror (compositions only): `.mid` + `.rollnotes.json` + `.notes.txt` in the app's Documents (`filesMirror`, `src/model/versions.js`).
- Off-device: published songs on GitHub (`albums/`, 3,400 `.mid`, `manifest.json`), Mac copy via bridge `/v1/backup` (`flushBackupNow`, `src/ui/chrome.js`; the open song only).

## 2. Options

**(a) Web core in WKWebView with a native shell and a native audio bridge.** This is what the Capacitor app is today, plus native audio. It keeps all features, but it is not the native app Josh asked for. Clock sync between Web Audio and AVAudioEngine runs across two processes, and the WebContent memory ceiling (~1.9 GB) stays.

**(b) Full SwiftUI rewrite before anything ships.** Clean, but 6–12 months before Josh can use it, and nothing is playable for weeks.

**(c) Hybrid, recommended.** Build a new SwiftUI app with one native AVAudioEngine from day 1, and port the views one at a time. Until a view is ported, Josh uses it in the Capacitor app, which stays installed next to the native one. There is no web view inside the native app's UI. The one exception is a headless chip-render service (Phase 3). The two apps share data as files (`.mid` + `.rollnotes.json`), never web storage.

Why (c):
- It is truly native, and the first milestone is a song playing on the iPad within 1–2 days.
- The known-good audio lesson (memory `ipad-audio-known-good-engine`; WebKit mute switch FAIL in `nightroll-shell-spike/spike-notes.md`) favours one engine that is created once and never rebuilt per tap. Any engine change goes in its own commit with an A/B Josh can check by ear. Native `.playback` also fixes the silent-switch failure.
- The Capacitor app keeps every feature until parity, so nothing is lost and nothing is rushed.
- Most of the audio code can be reused. `night-roll-ear` PulseAudio already plays MIDI through `AVAudioUnitSampler` + `GeneralUser-GS.sf2` (`Sources/PulseAudio/BackingRenderer.swift`, `night-roll-guitar/App/Sources/Backing/BackingRenderService.swift`).

## 3. Data migration (no loss, web keeps working)

1. **Export everything, on the web side first (Phase 0).** Add File → "Export everything…" in the app edition. It writes `Documents/NightRoll-Export-<date>/` with three parts:
   - `raw/localStorage.json`: every `ff1roll-*` key, verbatim.
   - `raw/idb/<store>/<key>`: `drafts`, `audio`, `sf2`, `nsf`. The `repo` store is skipped because it is only a cache.
   - `songs/<key>.mid` + `.rollnotes.json` per song with a draft, using the existing `writeMidi` / `serializeRollnotesStamped`. Each entry carries its `musicSig`, note count and SHA-256 in `manifest.json`.

   The export only reads storage. It deletes or rewrites nothing, and a second copy goes to the Mac through the bridge (new `POST /v1/backup-all`).
2. **Verify.** A new `tools/verify-export.mjs` checks the manifest's hashes and counts on the Mac copy. The native importer re-checks the hashes, parses each song, and compares note counts and signatures against the manifest. Any song that does not match is listed in an import report ("212 songs, 31 versions, 4 clips; 0 mismatched"). It is never silently dropped.
3. **Native store.** Songs are files in the native app's `Documents/Songs/` (visible in the Files app), and Versions go in `Documents/Songs/.versions/`. The raw dump stays on disk forever.
4. **Running in parallel.** The native app is play-only until Phase 4. From Phase 4, editing a song in either app goes through re-export/import. Imports are idempotent: the newer `stamp` wins, and the older copy becomes a Version, never deleted. The Capacitor app is retired only when Josh says so.

## 4. Phases

New repo `/Users/joshuacough/work/night-roll/night-roll-ipad`, using xcodegen `project.yml` like the guitar app. The app is "NR Native", bundle `com.joshcough.nightroll.native`, so it can never overwrite the Capacitor app's container. Shared code: `night-roll-ear` (PulseAudio, PulseCore, NightRollUI), plus copies of `night-roll-guitar/vendor/BridgeChat` and `Resources/GeneralUser-GS.sf2`. A new local package `night-roll-ipad/Core` (NightRollCore) holds the MIDI, rollnotes and model code.

**Phase 0: Export everything (½ day, web).** Deliverables are in §3, steps 1–2.
- Acceptance:
  - A vm test round-trips a fake store (each key ends up in the dump exactly once, and the hashes match).
  - On the iPad, the export folder appears in Files.
  - `verify-export.mjs` passes on the Mac copy.

**Phase 1, milestone M1: open and play (1–2 days).** A SwiftUI album and song list, loaded from the Pages `albums/manifest.json` and cached on disk. Tapping a song plays its `.mid` with one `AVAudioUnitSampler` per track (GM program from the MIDI). Controls: Play/Stop, a seek slider, and the time.
- Audio rules:
  - One `AVAudioEngine`, created at launch.
  - The session is `.playback`.
  - Background audio is on.
  - Interruptions resume the music.
- Reuse: `BackingRenderer`'s sampler and sf2 loading, and `NightRollTheme`.
- Acceptance (Josh on the iPad):
  - FF1 Overworld plays.
  - Ten Play/Stop cycles and five song switches work with no silence.
  - Music plays with the silent switch on.
  - Music keeps playing while the iPad is locked.
- Acceptance (simulator): a UI test covering launch → song → playing.

**Phase 2: piano roll plus annotations (~1 week).**
- Port `src/midi/parse.js` (331 lines) and the rollnotes v1/v2 reader (from `src/model/rollnotes.js`) to NightRollCore.
- Apply tempo annotations, and map `track:` voices to GM programs.
- Add mute/solo, a read-only roll drawn with SwiftUI Canvas (sections and chords lanes, a playhead that follows playback), and pinch zoom.
- Acceptance:
  - Golden tests: a new `tools/dump-song.mjs` writes the JS parse of all 3,400 `.mid` files as JSON, and the Swift parse must equal it.
  - The rollnotes golden test is the same, run over the `.rollnotes.json` files.
  - Native and web roll screenshots look alike, checked side by side in the simulator.

**Phase 3: chip audio (~1–2 weeks).**
- Default design: a headless WKWebView "render service" runs the bundled `tools/chip-worker.mjs` in stream-mode chunks and writes CAF files to `Caches/`. The native engine plays them on `AVAudioPlayerNode`, on the same clock as the sampler tracks.
- PCM goes to disk, not into WebContent memory.
- Native C cores (game-music-emu) are a later swap that can be A/B'd against this.
- Acceptance:
  - Josh A/Bs the spike list by ear against the web app: NES Overworld, SNES Corridors of Time, TMNT2 and a Game Boy song.
  - A large PS1 song plays without being killed.
  - 30 minutes of album play passes with no aborts.

**Phase 4: import, edit, save (~2–3 weeks).**
- Native importer and report (§3), plus Versions, Save Version (⌘S), basic note edits (add, move, delete, velocity) and undo.
- The save path writes `.mid` + `.rollnotes.json` atomically.
- Acceptance:
  - The import report shows 0 mismatched.
  - Device persistence test: edit, force-quit, relaunch, compare.
  - A unit test round-trips rollnotes byte-identically to the JS serializer.

**Phase 5: parity, in slices of 1–3 days.**
- Publish to GitHub (port `src/sync/publish.js`).
- Ask and Front Desk through BridgeChat (`AIWindow`, `BridgeClient`), keeping the bridge's `/v1/desk` contract.
- Mixer, metronome (PulseAudio `Metronome`), CoreMIDI input, recording and the score view.
- Each slice ships on its own build.
- A parity checklist made from NIGHT-ROLL.md "## Feature inventory" decides when the Capacitor app can be retired.

## 5. Risks and open questions

Risks:
- **Silent engine.** One engine, changed one commit at a time. If sound dies after a change, revert first.
- **Chip sync.** The WKWebView render service and native playback are kept in sync by sample offsets from the same engine. If they drift, the fallback is to pre-render the whole song before Play.
- **Two editors diverging.** Handled by the stamps and by "the older copy becomes a Version" in §3.
- **Doubled feature cost.** No new web features are built for areas that have already been ported. Fixes still go to both.
- **Native score engraving is hard.** Default: score stays in the web app until Phase 5's last slice.
- **Ask registry is JS-only (4.5k lines).** Phase 5 reaches the same tools through the bridge instead of porting them.
- **Token storage.** The GitHub token moves to the Keychain, never into the export's `manifest.json` in clear. Default: the export leaves `ff1roll-cfg`'s token out, and Josh pastes it once.

Open questions, each with the default already chosen (none blocks work):
- Q-a, name/bundle: "NR Native" / `com.joshcough.nightroll.native`.
- Q-b, repo location: a separate repo, `night-roll-ipad`.
- Q-c, chip engine: the headless WKWebView service first, C cores later.
- Q-d, score view: stays web until the end of Phase 5.
- Q-e, native song home: the app's `Documents/Songs` (visible in Files).
- Q-f, Capacitor app retirement: only when Josh says so.

## Revision after Fable review (wins over the sections above)
1. **P3 chip audio:** a hidden WKWebView stops running JS ~30 s after the app backgrounds/locks. No stream mode: pre-render each chip song to a CAF file in the foreground (chunk only for first-sound latency), then the native engine plays the file (locked playback works). Spike 1 h first: lock mid-render, measure. Bundled `.mjs` workers over file:// need a `WKURLSchemeHandler`; JSContext has no JIT (too slow).
2. **Secrets:** redact `ff1roll-ghtoken`, `ff1roll-aikey`, `ff1roll-ai-hosts` (not `ff1roll-cfg`) from the export; native keeps them in the Keychain; Josh re-enters once.
3. **P0 serializer:** never cycle songs through global `S`. Use `serializeNotesList` on the stored `ff1roll-notes-<key>` lists and `draftRead` (inflates `tracksRef` stubs from IDB `drafts`). Verify by content: JS re-parse of each written `.mid` note count == draft notes; rollnotes item count == stored list length.
4. **Sharing:** the native importer opens the Capacitor app's Documents via `UIDocumentPicker` (security-scoped bookmark). No App Group.
5. **Export memory:** write entries one at a time (Filesystem plugin is base64); record size + hash each; mark vault-fetched nsf entries as re-downloadable instead of copying.
6. **P1 playback:** `AVAudioSequencer` + one `AVAudioUnitSampler` per track (`AVMusicTrack.destinationAudioUnit`), GeneralUser-GS sf2 program loading as in night-roll-ear BackingRenderer.swift:93 — but one long-lived live engine (not BackingRenderer's per-render offline engine).
7. Label chip albums "approximate until P3"; encode `/` and `|` in IDB key filenames; P0 and P1 run in parallel.
