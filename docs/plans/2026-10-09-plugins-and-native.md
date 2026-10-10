# Plug-ins (AUv3) and a native Night Roll — options and a staged path

Advisor plan, 2026-10-09, for Terminal #337 ("plug-in support like AUv3s /
VSTs") and #338 ("I don't wanna leave out the possibility of completely writing
a native program… a web version and [a] native"). Nothing built.

## 0. Where we stand (facts this plan leans on)

- The iPad app is a Capacitor 8 shell (`night-roll-app/package.json`) around
  the packaged web app (`build-www.sh` → `tools/package.mjs`). There is already
  native Swift in `ios/App/App/AppDelegate.swift` (279 lines): AVAudioSession
  `.playback` + `.mixWithOthers` (L18), a `ScreenshotPlugin` (L62) and a
  `CoreMidiPlugin` (L116). Swift Capacitor plugins are a path we already walk.
- All sound today is Web Audio inside WKWebView: synth/soundfont/SF2/game
  voices (`src/audio/voices.js`, `scheduleNote` L951), console renders in a
  Worker (`tools/chip-worker.mjs`, `src/audio/chip.js`, stream mode in
  `src/audio/chip-stream.js`), offline bounce via OfflineAudioContext
  (`src/audio/bounce.js` `renderSongOffline` L120). The pump schedules notes
  0.6 s ahead (8 s hidden) in AudioContext time (`src/audio/transport.js:361`).
- Known WKWebView pain: the content process dies near ~1.9 GB (FFX "Challenge",
  NIGHT-ROLL.md "Render memory, measured"), hence the 600 MB budget and stream
  mode; aborted fetches after long PS1 album play (open-items.md ~L698);
  background audio needed `navigator.audioSession` on top of the native session
  (NIGHT-ROLL.md "Background playback").
- Code size: ~35.6k lines in src/, ~32.3k in tools/*.mjs (emulators, capture,
  instruments) — what a native rewrite would face.

## 1. What hosting AUv3 on iOS takes — and why VST is out

**VST is out on iPad, permanently.** VST3 plug-ins are desktop code libraries;
iOS forbids loading third-party code at runtime. The only way another maker's
instrument runs inside our app is as an app extension — AUv3. (A *Mac* version
could host VST3 — Option B2.)

AUv3 hosting pieces (all Apple frameworks, all Swift):
1. **Find**: `AVAudioUnitComponentManager.shared().components(matching:)` for
   type `aumu` (instruments), `aufx` (effects), `aumf` (MIDI effects).
2. **Load**: `AVAudioUnit.instantiate(with:options:)`. On iOS third-party AUv3s
   run **out of process** — a plug-in crash or memory blow-up doesn't kill us,
   and its memory isn't ours. Cost: a little IPC latency per render.
3. **Engine**: an `AVAudioEngine` with the AU attached → per-track mixer → main
   mixer → output. Engine lives in the app process, not WebContent.
4. **Notes in**: `auAudioUnit.scheduleMIDIEventBlock` (sample-accurate: events
   tagged with a sample time). Hosts also supply `musicalContextBlock` /
   `transportStateBlock` so arpeggiators and delays lock to our tempo.
5. **UI**: `auAudioUnit.requestViewController` returns a native
   UIViewController; we present it as a native sheet over the web view.
6. **State**: `auAudioUnit.fullState` (a property-list dictionary, can be KBs
   to MBs — sampler plug-ins can be large) and `currentPreset` / factory + user
   presets. Restoring = set `fullState` after load.
7. **Offline**: `AVAudioEngine.enableManualRenderingMode(.offline, …)` for
   bounce. Most AUv3s honour `renderingOffline`; some don't (they assume real
   time) — must be tested per plug-in.

## 2. Option A — host AUv3 inside today's Capacitor app

A new `AudioUnitHostPlugin` next to `CoreMidiPlugin`: `list`, `load(track,
component)`, `showUI(track)`, `getState/setState`, `notes([...])`,
`transport(play|stop|seek)`, `setGain/pan/mute`, `levels`, `bounce`.

**Notes from the web transport to the AU.** Two designs:
- **A1, pump batches (recommended for the spike):** the existing pump
  (`transport.js:361`) already hands every note to `scheduleNote` with a future
  `when`. For a track whose voice is an AU, send the note to native instead
  (one batch per pump tick). Native converts `when` to its own clock and calls
  `scheduleMIDIEventBlock`. Reuses every transport feature as-is: loops, seek,
  play rate, album play, edits while playing; background throttling is already
  covered by the 8 s hidden lookahead.
- **A2, native sequencer:** send the AU tracks' whole note list once; native
  plays them itself, JS only sends play/stop/seek/loop. Rock-solid timing and
  background play, but duplicates transport semantics (loops, glides, play
  rate, edits mid-play) in Swift — a second transport.

**Mixing with Web Audio.** Not mixed — two engines, two processes (WebContent's
Web Audio, the app's AVAudioEngine), both feed the iPad's output; iOS sums them
(our session is already `.mixWithOthers`). Volume / pan / mute / solo for AU
tracks have to be mirrored to native mixers; the Mixer window's meters
(`src/audio/levels.js`) need native level reports over the bridge (~20/s).

**Latency and sync — the hard part.** Each engine has its own clock and its own
output latency. Plan: a handshake at Play — JS reads
`AudioContext.getOutputTimestamp()` (context time ↔ wall clock) and native
reads host time ↔ engine sample time; both map to wall-clock ms, so a JS `when`
becomes a native sample time. Expected error: a few to ~20 ms plus slow drift
between the two sample clocks (re-handshake every pump). Uncertain: how
faithfully WKWebView reports `outputLatency` / `getOutputTimestamp` — the spike
must *measure* this by ear and by log (a click on each beat from both engines,
recorded, offset measured). Live playing (tap the on-screen keyboard → AU) adds
the bridge hop (~few ms, async); the hardware MIDI keyboard can go
native-to-native (`CoreMidiPlugin` → AU directly), no JS hop.

**Offline bounce.** JS renders its tracks as today; native renders AU tracks in
manual-rendering mode to a WAV in Documents; one side mixes. Files, not base64
over the bridge (the memory trap we already know).

**Song state.** Voice id rides `track:` like `game:`/`sf2:` do (NIGHT-ROLL
"Game instrument libraries"), e.g. `track: bass voice=auv3:<maker>:<subtype>
fallback=sf-bass`. The plug-in's settings blob is NEW kind of song state; the
"annotations + .mid only" rule needs Josh's ruling (Q4): a sidecar file beside
the song, or a base64 annotation, or device-local presets by name only.

**Web / missing plug-in.** The track plays its fallback voice; a ⚠ line names
the missing plug-in. The web edition never breaks.

**Costs:** first cross-process sync code; plug-in UIs are native overlays we
can't style; Swift has no vm tests; Ask action `setTrackPlugin` + help per the
checklist. **Gain:** plug-in audio/memory live outside WebContent.

## 3. Option B — a native app

**B1, Swift/SwiftUI rewrite.** Everything native: AVAudioEngine for all voices,
AUv3 hosting with no bridge, Metal/SwiftUI piano roll, Files.
**B2, JUCE (C++)**: one codebase for iPad (AUv3 host) *and* Mac/Windows
(VST3/AU host) — the only route to "VSTs" at all; UI in JUCE, licence cost for
closed source. **B3, hybrid** (WebView UI, native audio engine) is really
Option A grown — see §5.

**What carries over from today's JS.**
- *JavaScriptCore:* available, but **no JIT** on iOS (only WKWebView gets it):
  the emulators in tools/ would run interpreted, likely several times slower,
  with no Workers or fetch. Fine for light logic (model, theory, .rollnotes),
  not the capture engines.
- *Hidden WKWebView as a compute engine:* keeps JIT and all the JS — but that
  is today's WebContent memory ceiling again, just moved.
- *Port:* capture/emulation logic is custom JS; porting ~32k lines to Swift/C++
  is months, and every capture fix since August would be redone. C cores exist
  (game-music-emu, lazyusf…), but *capture* is our own code.
- *Formats:* .mid + .rollnotes.json are files — both apps can share them.

**What the web version keeps.** Everything it does now; the native app would
have to chase it. Two codebases = every feature twice, two test suites (the vm
harness is JS-only), two help sheets; the Ask registry and query tools stay JS.
At Josh's pace, doubling is the real cost, not the rewrite.

**What native fixes beyond plug-ins.** Memory: an app process can ask for the
Increased Memory Limit entitlement; WebContent can't. Audio: no
`navigator.audioSession` dance, no WebKit-killed sessions, sample-accurate
scheduling, real background play. Performance: Metal drawing instead of canvas
backing-store juggling (NIGHT-ROLL "Perf HUD"). Loses: push-to-deploy (every
change is an Xcode build).

**Rough effort:** B1 to parity with today: 6–12+ months. B2: similar plus C++.
Neither ships plug-ins sooner than Option A.

## 4. Option C — web-native plug-ins (Web Audio Modules)

WAM 2.0 (webaudiomodules.com) is the open standard: plug-ins are ES modules +
AudioWorklet (often WASM), loaded by URL, with a GUI as a DOM element and
`getState/setState` JSON. Exists: an SDK, a few hosts (WAM Studio, Sequencer
Party), a small catalog of mostly free/open synths and effects (many
Faust-made). Fits our rules (no build step, state is JSON → annotations
possible, works on web *and* iPad, since Safari has AudioWorklet), and bounce
works through OfflineAudioContext. **But** it is not what Josh asked for: none
of the commercial iPad instruments ship as WAMs, the catalog is small, quality
uneven, and AudioWorklet CPU in WKWebView adds to the same memory/CPU ceiling.
Good complement, not the answer to "AUv3s".

## 5. Staged path

**Stage 0 — spike, ~1 week (proves the hard part).** Swift
`AudioUnitHostPlugin` with `list/load/showUI/notes/transport`. Test on Josh's
iPad: pick one AUv3 instrument he owns; one track of a scratch or FF1 song
(never his compositions) plays through it while the rest plays in Web Audio.
Measure: (a) by ear — in time with the drums over 3 min? (b) logged
offset/drift per pump; (c) background play; (d) the plug-in's UI opens and its
sound change survives a reload (state round-trip). Exit gate: Josh says it
sounds in time. If not, try A2 for that one track before anything else. No
help/Ask work in the spike; it lives on a branch.

**Stage 1 — one plug-in per track, ~2–3 weeks.** `voice=auv3:` + fallback,
voice picker section "Plug-ins (this iPad)", mute/solo/vol/pan mirroring, Mixer
meters, state save per Josh's Q4 ruling, ⚠ line when missing, Ask action, help
entry, docs.

**Stage 2 — ~1–2 weeks.** Bounce with plug-ins; hardware keyboard → plug-in
natively while recording; effect plug-ins on a track / master.

**Stage 3 — only if WKWebView stays the bottleneck.** Move more sound to the
native engine one voice kind at a time (console-render PCM playback first — it
is the memory hog; then soundfonts). UI and model stay web. Each move is
reversible and A/B-able by ear: the "native app" grown from the inside; a full
B1/B2 then becomes a UI decision, not an audio one.

**Risks.** Sync across two processes may never be sample-tight (bad for tight
drum/bass doubling); plug-ins that misbehave offline; large plug-in states vs
GitHub/publish; App Store review of a host is fine (many exist), but Capacitor
plugin + audio code has no automated tests; Josh's hands — plug-in UIs are
fiddly touch targets we don't control.

## 6. Recommendation

Do Option A, starting with the Stage 0 spike, design A1. It reuses the whole
transport, keeps one codebase, and the plug-ins' audio/memory live outside the
WebView. Keep the native app open the way Josh asked — as Stage 3: a native
audio engine grown under the web UI, each step measured. Do not start a full
rewrite now: it costs months, doubles every future feature, and doesn't ship
plug-ins sooner. Revisit a full native app (JUCE if he also wants Mac VSTs)
after Stage 1, with real data on how much of the pain is WebView.

*Strongest case against:* every recurring iPad bug (memory kills, silent
sessions, aborted fetches) is the WebView itself; Option A adds a new bug class
(two clocks) on top instead of removing the old ones, and a rewrite pays off
for years. *Tension:* sync quality vs keeping one codebase — A1 may be audibly
loose where B is sample-tight. The spike settles it with his ears in a week,
which is cheaper than arguing.

## 7. Questions for Josh (plain words, one example each)

Q1. Which plug-ins do you want first? *Example: "the Moog synth app I bought"
    or "Korg Module's piano".* Tell me the app names you own.
Q2. Instruments, effects, or both? *Example: instrument = a synth plays the
    bass line; effect = a reverb on the whole song.*
Q3. OK if a plug-in track sounds different on the web/Mac? *Example: on the
    iPad the bass is the Moog; on your Mac browser it plays the normal
    soundfont bass until you open it on the iPad again.*
Q4. Where should a plug-in's knob settings live? *Example: (a) a small file
    next to the song, published to GitHub with it; (b) only on this iPad, the
    song just names the plug-in and preset; (c) inside the .rollnotes file.*
Q5. Live playing or just playback? *Example: play your MIDI keyboard and hear
    the Moog while recording, or only hear written notes through it.*
Q6. Do you need Bounce (save as audio) to include plug-ins? *Example: exporting
    a WAV of Underwater Palace with the Moog bass in it.*
Q7. What would a native app give you that this one doesn't? *Example: "FFX
    songs never crash", "a Mac app with my desktop VSTs", or "just plug-ins".*
    That answer decides between Stage 3 and a rewrite.
Q8. OK to spend about a week on the spike before deciding anything bigger?
    *Example: one plug-in playing one track of Overworld, you listen for
    whether it stays in time.*
