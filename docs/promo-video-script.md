# Night Roll — promotional video script

Target: 90–120 seconds for the App Store page, the repo README and social.
Two-column shot list (SCREEN / VOICEOVER), a 15-second cut-down, tagline
options, capture notes, and App Store copy. Every voiceover sentence maps
to something the shipped app does — the source for each line is HELP.md
(the user manual) or README.md; the check table is at the end.

Voice: plain, warm, unhurried. One narrator, no music bed over the parts
where the app is heard — the app's own sound IS the music bed. About 150
words a minute; the main cut is ~300 words, so land it at 1:55–2:00.

## Main cut (1:58)

| # | Time | SCREEN | VOICEOVER |
|---|------|--------|-----------|
| 1 | 0:00–0:05 | iPad, landscape, held in two hands. Night Roll open on the **Bach Prelude in C** (starters album), Roll view. Tap ▶. Playhead moves, notes light as they sound. No UI narration yet — just the music for a beat. | This is Night Roll. |
| 2 | 0:05–0:13 | Tap the 𝄞/▦ toggle: the same bars redraw as an engraved score, playhead sliding notehead to notehead. Tap a single notehead; the inspector shows pitch, bar, beat, and it sounds. | A piano roll and an engraved score, on one timeline. Switch views; nothing else changes. Tap any note and it plays. |
| 3 | 0:13–0:21 | Cut to an **NES song** in the roll (a short FF1 or Mega Man 2 moment, 5 s max). Track chips across the top: tap **M** on the triangle, tap it back; tap **S** on pulse 1. The sound thins and fills instantly. | Game soundtracks play through the console's own sound hardware — the NES chip, and now Game Boy and Super Nintendo. |
| 4 | 0:21–0:31 | File → Import… → pick a chip-music file. The **capture panel** opens; rows fill in track order; on one row the notes appear as the capture runs, then "loop found" and the tempo lands. Quick cut through the SNES `.spc` multi-select and a Genesis/PS1/N64 row (file names hidden). | Import a real rip and watch the notes appear, track by track — loop found, tempo fitted — from NES, Game Boy, Super Nintendo, Genesis, PlayStation and Nintendo 64. |
| 5 | 0:31–0:40 | Back on one of Josh's own songs (e.g. **Threnody**). Drag along the bar ruler, + Note → **section** "A". Drag again → **Chord**, tap chips root · quality → a colored band. Open the **key:** picker; the score's signature previews live as the mode is chosen. A gold **loop:** flag at the jump point. | Your analysis lives with the music. Sections, chords, keys, loop points — anchored to the beat, saved in plain text beside the song. |
| 6 | 0:40–0:49 | **⊞ Lasso** on, drag a box over a chord. Strip shows the pitch names, low to high. Beat. Tap **Chord?** — the name appears. Then tap one of the chord bands in the ruler, tap **Challenge?**: the evidence dialog, gold tones sounding, one red missing. | Lasso a chord and name it yourself first; Chord? is there when you want it. Challenge? weighs your label against what's actually sounding — only when you ask. |
| 7 | 0:49–0:59 | File → **New song** (name/tempo/meter). **Pencil**: tap-drag a few notes, one stretches under the finger. Cut to the Mac: ● **Record** armed, a hand plays a MIDI keyboard, notes land at the playhead. Back on iPad: **＋∿**, a guitar take's waveform appears in the **Tracks** view next to the chip lanes, playing in time. | It's a small studio too: new song, pencil in notes, record from a MIDI keyboard, drop a guitar take next to the chip voices. |
| 8 | 0:59–1:07 | Tap **✦ Ask** in the top bar. The sheet slides up over the song. Hold on the empty chat with the song visible behind it; the cursor sits on bar 9, two annotations in view. | Then there's Ask. A music-theory tutor that sees what you see — the song, your cursor, your annotations, the bars on screen. |
| 9 | 1:07–1:18 | Type "what's happening in bar 9?" → Send. Reply arrives: a question back, not an answer (it points at the bass line). Type "I give up, tell me." → a plain answer. Keep both bubbles short on screen; cut the wait. | It points before it tells — the rule is written in: discoveries are the user's. Ask about bar nine and it asks what the bass outlines. Insist, and it tells you plainly. |
| 10 | 1:18–1:25 | Tap **🎤 Speak**. Josh's voice (on camera or off): "put an F sharp minor chord on twenty-one one." Words land in the box; Send. A new chord band appears in the ruler behind the sheet, with a ✕ in the Publish sheet like any unsynced note. | Say an annotation out loud and it writes exactly that — a chord at twenty-one, beat one. |
| 11 | 1:25–1:37 | File → Settings… → **AI model**. Three quick beats: **In this browser** (small model, Test ✓ WebGPU); **On a server** with LM Studio's URL, **Test** lists models; then the bridge with **claude-code** in the list. Cut to a Mac terminal: `node tools/claude-bridge.mjs --say "…"` → back on the iPad a gold **✉** bubble appears in ✦ Ask. | Run it on the model you choose: in the browser, LM Studio or Ollama on your own Mac, or Claude Code through the bridge — where each song's chat is a session that passes notes to your terminal, and the terminal writes back. |
| 12 | 1:37–1:42 | Tap the **♪ this song / ✦ general** toggle at the top of the sheet. One general question, no song context. | A general chat covers everything that isn't one song. |
| 13 | 1:42–1:51 | Footer **Publish** → the Publish sheet: music line, annotation lines, chat line. **⇪ Publish song**. Cut to the GitHub repo README: the song list of player links. **🔗 Share link** → a phone opens it in **Listener mode**: roll, ⏮ ▶, nothing else. It plays. | When it's ready, Publish to your own GitHub repo. Every song becomes a link, and a phone that opens it simply plays. |
| 14 | 1:51–1:58 | The iPad on a nightstand, Night Roll's home-screen icon, then the app full screen on the Bach prelude, playhead still moving. Title card: **Night Roll** — no tagline text until the last word. Hold 2 s on silence after the music stops. | Night Roll. Study the music you love. Write your own. The discoveries are yours. |

Voiceover: 299 words. Ask segment (shots 8–12): 38 s, 119 words — about
a third of the runtime.

Optional swap if a shot runs long: drop shot 12 (general chat, 5 s) and
fold its idea into the capture of shot 11's toggle. Optional add if the
cut runs short: **✦ Fill** — "Stuck on a few bars? Fill asks the tutor
to write notes into a range; the app checks every one, and they land as
a single undo." (28 words, ~10 s; place after shot 10.)

## 15-second cut-down (4 shots)

| # | Time | SCREEN | VOICEOVER |
|---|------|--------|-----------|
| 1 | 0:00–0:04 | Bach prelude playing; Roll → Score toggle mid-phrase. | Piano roll, engraved score, one timeline. |
| 2 | 0:04–0:08 | Import capture panel: notes appear on a row; the NES song plays. | Real game soundtracks, through the console's own chip. |
| 3 | 0:08–0:13 | ✦ Ask: "what's happening in bar 9?" → a question back. | And a tutor that points before it tells. |
| 4 | 0:13–0:15 | Title card. | Night Roll. The discoveries are yours. |

## Tagline options (pick one)

1. The discoveries are yours.
2. Study the music you love. Write your own.
3. Hints before answers.
4. Game music, note by note.
5. Hear it. Mark it. Understand it.

## B-roll / capture notes

**Songs on screen**

- Lead with the **Bach Prelude in C (BWV 846)** from the starters album
  (branch `overnight-2026-09-26`, commit 0eb48ad — merge or film from that
  branch). Public domain, fully annotated, and it looks good in both views.
- Josh's own compositions for the annotation, editing and Ask shots —
  **Threnody**, **Ambush**, **Night Black**, **Carnival** — with his OK per
  song; they are his. Nothing gets edited on them for the shoot: pencil and
  record shots go on a **New song** or a scratch draft, and the dictated
  chord in shot 10 goes on a scratch copy (Save As) so it can be discarded.
- Copyrighted game music only briefly: one NES moment in shot 3 (5 s max,
  Final Fantasy I or Mega Man 2 from the existing albums) and the capture
  panel in shot 4. Keep imported file names out of frame (they name the
  game); crop or blur the picker row if it shows.
- The 15-second cut uses the same footage; no new captures.

**Views to cover**

Roll, Score (scroll fully left once so the clefs and key signature show),
Tracks (for the audio-take waveform), the capture panel, ☰ Notes, the
lasso strip with Chord?, the Challenge? dialog, the key: picker's live
signature preview, ✦ Ask (both chats), Settings → AI model, the Publish
sheet, the GitHub README song list, and a phone in Listener mode.

**Devices and setup**

- iPad Pro in landscape for everything except shot 7's MIDI recording,
  which needs Chrome/Edge on the Mac (Safari/iPad has no Web MIDI — HELP.md
  "● Record"); the on-screen 🎹 works on the iPad if a second device is
  too much.
- Record the iPad screen over cable (QuickTime) or with iOS screen
  recording; hands-on-glass shots on camera are optional but sell the
  touch-first design (hold-to-grab, two-finger pan).
- Silent Mode off (Control Center bell) or Web Audio is muted; volume up.
- Hide anything that isn't the product: no perf HUD (`?perf`), no GitHub
  token or repo URL fields in frame while typing, Dark Reader off, ⚠
  messages log cleared, drafts list tidy.
- Ask replies through the Claude Code bridge take 10–30 s; for shots 9–12
  either point Settings at a fast local model or cut the wait. Do the
  bridge round-trip in shot 11 for real (terminal `--say` → ✉ bubble); it
  is the one moment that needs the Mac and iPad in the same frame or a
  clean cut between them.
- Fall view is parked (hidden) as of 2026-09-27 — don't go looking for it.
  Metronome, circle of fifths, the instrument panel, the Drummer and
  Bassist are good B-roll if a shot needs a cutaway, but they aren't in
  the voiceover.

**Avoid**

- No third-party logos: no Nintendo, Sega, Sony, Apple, GitHub, LM Studio,
  Ollama or Anthropic marks on screen. Platform names in the voiceover are
  plain nominative use; the screen shows Night Roll's own UI only.
- No trademarked game art, box art, sprites or title screens; no game
  footage. The music itself is the only game reference, and it's brief.
- No "revolutionary", no superlatives, no claims the app doesn't make:
  it never names a key you haven't set, and neither does the narration.
- Nothing from `albums/compositions/` gets modified for the shoot.

## App Store copy

**Subtitle (30-character limit)**

- `Study game music note by note` (29)
- `Learn theory from game music` (28)
- `Piano roll, score, chip sound` (29)

**Keyword strings (100-character limit each, comma-separated, no spaces)**

1. `piano roll,sheet music,music theory,chiptune,NES,MIDI,composer,ear training,game music,annotate`
2. `piano roll,music theory,chiptune,8-bit,sheet music,MIDI,songwriting,ear training,harmony,analysis`
3. `midi editor,score,theory tutor,chip music,retro,composition,notation,practice,loop,soundtrack`

Line 1 includes "NES"; App Review sometimes rejects other companies'
trademarks in keywords, so lines 2–3 are the safe fallbacks. Don't repeat
words already in the app name or subtitle — they're indexed already.

## Source check — every voiceover claim and where it's documented

| Claim | Source |
|-------|--------|
| Roll + engraved score, one timeline; switching changes nothing else; tap a note and it plays | HELP.md "𝄞 Score / ▦ Roll", "Tap a note" |
| Game music through the console's own sound hardware (NES); Game Boy and SNES chip audio | HELP.md "File" (Chip audio is automatic — the NES 2A03's actual sound hardware); NIGHT-ROLL.md "Game Boy import", "Super Nintendo import"; open-items.md Phase 0.5 spike (NES/SNES/GB chip audio on the iPad) |
| Import: notes appear track by track, loop detected, tempo fitted; NSF/GBS/SPC/VGM/PSF/USF | HELP.md "File" → Import… |
| Sections, chords, keys, loop points; beat-anchored; plain-text sidecar beside the song | HELP.md "Annotations", "Sections", "Chords", "key: picker", "Loop points"; README.md "Annotations (.rollnotes)" |
| Chord? hidden by default; Challenge? only when you ask | HELP.md "Chord?", "Challenge?" |
| New song, pencil, record from a MIDI keyboard (Chrome/Edge on a computer), audio take as a track | HELP.md "File" (New song), "Pencil drag", "● Record", "∿ Audio tracks (recordings)" |
| Ask sees the song, cursor, annotations, bars in view | HELP.md "✦ Ask" |
| Hints first; tells plainly when you insist or give up; "discoveries are the user's" | HELP.md "House rules"; index.html ASK_SYS: "THE RULE: discoveries are the user's. Default to hints, questions and direction (what does the bass outline? …) … if they insist again, or say they give up, tell them plainly" |
| Dictation; "put an F#m chord annotation on 21.1" writes exactly that | HELP.md "🎤 Speak", "Asking it to act" |
| In-browser model; LM Studio / Ollama; Claude Code via the bridge; per-song session; notes to and from the terminal | HELP.md "Where the model runs", "Notes from the Mac"; README.md "The AI bridge" |
| General chat | HELP.md "General chat" |
| Publish to your own GitHub repo; README song list of player links; a phone opens as a player | HELP.md "Publish", "Share a song", "📻 Listener mode" |
| ✦ Fill (optional line) | HELP.md "✦ Fill" |

## Production — who does what (2026-09-27)

What Claude can make from the Mac, unattended: this script and shot list;
still and animated captures of the app from Chrome (scripted); a rough cut
assembled with ffmpeg from those captures, with a placeholder voice from the
system's text-to-speech (`say`) so timing can be judged. A proof of that
pipeline is `~/Desktop/nightroll-promo-roughcut.mp4` (17 s, three frames,
the first four voiceover lines). It is a timing sketch, not a deliverable:
stills with crossfades, synthetic voice.

What needs a person: the real screen recording of the iPad (QuickTime over
the cable, or iOS screen recording — smooth playback and touch, which
Chrome captures cannot give), the voiceover (Josh's voice, or a paid TTS
voice), and the edit (Final Cut Pro, iMovie and OBS are on this Mac). With
those recordings in a folder, Claude can do the assembly: cut to the shot
list's timecodes, lay the voice, export the 16:9 and the 15-second cut.
