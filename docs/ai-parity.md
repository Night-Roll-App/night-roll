# AI parity — what Ask can do, what it should do, how to ask

Josh, 2026-10-05: "tell the AI to go do stuff and it can do everything."
This file is the inventory CLAUDE.md's shipping checklist (step 5) points
at: every user-facing feature, whether the in-app AI ("Ask") can drive it
today, whether it should, and the tool that would let it.

Read it in this order: §1 the inventory, §2 the token cost and the one
`act` tool that keeps it flat, §3 the phrases you can say, §4 how "open
graveyard" switches songs and chats, §5 what gets built first.

## 0. The rules every Ask tool keeps

These hold for every proposal below. A tool that can't keep them doesn't
get built.

- **Learning mode is the law.** A tool never names a key, a chord, a meter
  or an analysis on its own. Fact tools (like "where does B♭ appear?") run
  only when you ask, and report facts, not verdicts. Ask writes an
  annotation only when you dictate it.
- **Your songs are yours.** Anything under `albums/compositions/` changes
  only when you ask for that change, that time. Your request in the chat
  *is* that approval; Ask never acts on its own initiative.
- **Every change is one undo step**, and the reply says in one line what
  changed ("deleted 12 notes on pulse1, bars 5–6").
- **Captures and locked songs refuse edits** with the fix named ("✎ Edit
  makes an editable copy"). This is `askWritableGate()` in
  src/ask/tools.js — every new editing tool reuses it.
- **No native dialogs.** Anything that needs a confirm uses the in-app
  sheet (`appConfirm`).
- **Cheap, and it stays cheap** (Josh, #435). New features become new
  *actions* inside one `act` tool (§2), never new tools: the menu sent
  with every message must not grow with each feature, and "go to bar 13
  and play" must cost one short model reply, not three.
- **Ask never writes code.** The bridge/iPad session queues work; the
  terminal session builds it.
- **Some things need your tap**, because the browser won't let code do
  them: choosing files (Import, audio tracks, the save folder) and
  downloads on the iPad. For those, Ask opens the right sheet and you tap.

## 1. Inventory

### Ask's original twelve (src/ask/tools.js — since 2026-10-05 all of them are `act` actions, batch 3)

The functions are the same; each is an `ASK_ACTIONS` entry now (§2), `ASK_TOOLS` is empty, and the "general" column is the entry's `song: false` flag.

| action (was a tool) | what it does | song chat | general (Ask tab) |
|---|---|---|---|
| `add_annotation` | writes one chord / section / key / tempo / loop / note at a bar.beat | yes | — |
| `edit_annotation` | changes an existing annotation's text or position | yes | — |
| `delete_annotation` | removes one annotation | yes | — |
| `publish_song` | the footer's Publish, for the open song | yes | — |
| `list_songs` | lists albums, titles, paths | yes | yes |
| `read_song` | reads another song's notes (bar range optional) | yes | yes |
| `read_notes` | reads another song's annotations | yes | yes |
| `read_bars` | reads more bars of the open song (live, unsaved edits included) | yes | — |
| `write_notes` | writes dictated notes onto a named track (optional replace range) | yes | — |
| `copy_bars` | repeats bars: inserts a gap and copies the music into it | yes | — |
| `insert_bars` | inserts empty bars; everything later slides right | yes | — |
| `delete_bars` | deletes bars; everything later slides left | yes | — |

The general chat gets only the read-another-song actions (and open_song,
help). Since batch 3 add_annotation also writes `meter` (3/4) and `chop`
(start|end), and delete_annotation takes a dictated one back; edit still
refuses structural directives, and track settings are not annotations Ask
writes (set_track, §1 below).

### Every feature against Ask

Every name in the "proposed action" column is an action inside the one
`act` tool (§2), not a separate tool. Actions marked *quiet* in §2 finish
without a second model reply.

Effort: **S** = an afternoon (wraps one existing function), **M** = a day
(several functions, or new validation), **L** = a design piece.
"have" = Ask can do it now.

#### Views

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Roll / Tracks / Score switch | — | yes | `show {what:"roll"\|"tracks"\|"score"}` | S |
| Scroll / zoom to a spot ("show me bar 20") | — | yes | `go_to {bar, beat?}` moves the cursor and scrolls there | S |
| 🎓 Learning mode on/off | — | **no** — Ask must never switch you into Normal; that switch is what keeps answers yours | — | — |
| Analyze ▸, ✦ Annotate this song… | — | **no** — Normal-only, and kept out of Ask's toolbox on purpose (NIGHT-ROLL.md "Annotate this song") | — | — |
| Compare with repo | — | yes | `show {what:"compare", on}` | S |
| Hide controls, Edit toolbar, Bottom bar, Listener mode | — | no — screen layout on one device; one tap is faster than a sentence | — | — |
| Grid… | — | no — a finger aid for dragging; Ask's tools take exact beats | — | — |
| VoiceOver labels | — | not applicable | — | — |

#### Playback

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Play / Stop / Back to start | — | yes (see note on iPad sound below) | `playback {action:"play"\|"stop"\|"start", from_bar?, beat?}` | S |
| Cycle a range (ruler selection) | — | yes | `select {from_bar, to_bar, cycle:true}` | S |
| Speed slider, master volume | — | yes | `set_playback {speed?, volume?}` | S |
| ⏱ Metronome on/off, bpm, follow song, count-in | — | yes | `set_playback {metronome?, met_bpm?, met_follow?, count_in?}` | M |
| Play album, next/previous, leave the album | — | yes | `album {action:"play"\|"next"\|"prev"\|"leave", album?, song?}` | S |
| Game order / A–Z | — | yes (a device pref) | `set_pref {name:"album_order", value}` | S |
| Background playing, Silent Mode | — | not applicable (iOS) | — | — |

iPad sound: Safari only starts sound from a finger tap. `playback play`
works once you've pressed Play at least once this session; before that
the tool answers "tap Play once, then ask again" instead of failing
silently.

#### Tracks and mixer

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Mute / Solo / Hide | — | yes | `set_track {track, mute?, solo?, hide?}` | S |
| Volume, pan (mixer faders) | — | yes — writes the same `track:` annotation the fader does | `set_track {track, volume?, pan?}` | S |
| Voice (instrument), color | — | yes | `set_track {track, voice?, color?}` — voice by name from the voice menu's list; unknown name = error listing choices | M |
| Rename track | — | yes, your songs only | `set_track {track, name}` | S |
| Whole-track octave ▲/▼ | — | yes | `set_track {track, octave:+1\|-1}` | S |
| Add / delete a track | — | yes, your songs only; delete is one undo step | `add_track {name, voice?}`, `delete_track {track}` | S |
| Reorder tracks in the mixer | — | no — one drag; rare | — | — |
| ＋∿ audio track (recording) | — | no — needs a file pick, which only your tap can open | — | — |

#### Exploring

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Tap a note (inspector) | have (`read_bars` reads the same facts) | — | — | — |
| Status line | have — every message carries new status lines | — | — | — |
| Lasso (select notes so you see them) | — | yes | `select {from_bar, to_bar, tracks?, from_beat?, to_beat?}` / `select {clear:true}` | S |
| find: (light up one pitch) | — | yes, on request | `find_pitch {pitch \| "off"}` | S |
| ◯5, Instrument panel, Notes strip, Velocity lane, Mixer, Jobs, Messages | — | yes | `show {what:<panel>, on}` | S |
| 8va octave numbers | — | yes (a device pref) | `set_pref {name:"octave_numbers", value}` | S |
| Chord? | — | **no** — it names a chord; you name it first. (In Normal mode the chat can already answer.) | — | — |
| Challenge? (evidence for YOUR chord band) | — | yes, only when asked — facts about your own label | `check {what:"chord", bar, beat}` | M |
| Facts toolkit (repeats, phrases, melody/rhythm/bass/voice-leading facts; theory/facts/) | — | yes, only when asked; facts, never verdicts | `song_facts {kind:"form"\|"melody"\|"rhythm"\|"bass"\|"voices", from_bar?, to_bar?}` | M |
| Harmony verdicts (numerals, cadences; theory/harmony/) | — | not in Learning; Normal-only design is in docs/theory-harmony.md | later, Normal only | — |
| ▼ Fall | — | parked feature | — | — |

#### Editing notes

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Write dictated notes | have (`write_notes`) | — | — | — |
| Insert / delete / repeat bars | have (`insert_bars`, `delete_bars`, `copy_bars`) | — | — | — |
| Undo / Redo | — | yes — "undo that" is the most useful sentence there is | `undo {steps?, redo?}` | S |
| Delete notes | — | yes | `edit_notes {op:"delete", from_bar, to_bar, tracks, pitch?}` | S |
| Transpose (half steps, octaves, in key) | — | yes; "in key" uses YOUR declared key, else says there isn't one | `edit_notes {op:"transpose", …, semitones? \| octaves? \| scale_steps?}` | M |
| Move in time | — | yes | `edit_notes {op:"move", …, beats}` | M |
| Copy / Paste to… (another bar, track, octave) | partly (`copy_bars` does whole bars, every track) | yes | `edit_notes {op:"copy", …, to_bar, to_beat?, to_track?, semitones?}` | M |
| Move to track | — | yes | `edit_notes {op:"to_track", …, to_track}` | S |
| Split / Join / Divide | — | yes | `edit_notes {op:"split"\|"join"\|"divide", …, at_beat? \| parts?}` | S |
| Quantize | — | yes | `edit_notes {op:"quantize", …, strength, ends?}` | S |
| Velocity (slider, velocity lane) | — | yes | `edit_notes {op:"velocity", …, value}` | S |
| Remove duplicate notes | — | yes | `edit_notes {op:"dedupe"}` | S |
| Shape (volume inside a note: Swell / Fade / Swell–fade / Flat, lane points) | have (2026-10-06, docs/plans/2026-10-06-in-note-dynamics.md) | yes | `edit_notes {op:"shape", …, shape \| points}` | S |
| 🎹 Keep that (last minute you noodled) | — | yes — your hands are on the keys, your voice is free | `keep_that {track?}` | S |
| Record | — | no — the take is your playing; arming it by voice would start the count-in while you're still talking | — | — |
| Select / Pencil / Erase, pencil drag, score entry | — | no — finger tools; Ask uses exact-beat tools instead | — | — |
| ♫ Insert chord | — | no — `write_notes` covers dictated chords, and the sheet would also write a chord band (a label) | — | — |
| 🥁 Drum pattern | — | covered by the Drummer tool | — | — |
| **Drummer** | **in progress** (being built now; spec in open-items "Ask tool for the Drummer") | yes | `drummer` | — |
| 🎸 Bassist | — | yes; pitches come from your declared chords, and Ask's reply never names chords it guessed when there are none | `bassist {from_bar, to_bar, track?, style?, busy?, octave?, follow?}` | M |

#### Annotations and keys

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Chord, section, key, tempo, loop, text note (+ attached note) | have | — | — | — |
| Meter (time signature) | — | yes, only when you dictate it | add `"meter"` to `add_annotation`'s kinds | S |
| Chop (trim a capture without touching the file) | — | yes; deleting the chop restores it | add `"chop"` to `add_annotation` (`text: "before"\|"after"`) | S |
| mode? partial key ("B♭?") | have (`key` kind takes "B♭?") | — | — | — |
| Check vs file (key / meter) | — | yes, only when asked; it reports match/mismatch, like the button | `check {what:"key_vs_file"\|"meter_vs_file"}` | S |
| ☰ Notes list, Analysis guide | — | yes (open it) | `show {what:"notes"\|"analysis_guide"}` | S |
| Analysis sheet (planned, awaiting your OK: docs/plans/2026-10-05-analysis-sheet.md) | — | yes, once built: fill a field only with your words | spec with that plan | — |

#### Files, saving, publishing

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Open a song / Open Recent | — | **yes — headline item, see §4** | `open_song {song, then?}` | L |
| ＋ New song | — | yes | `song_file {action:"new", title, folder?}` | M |
| Save Version | — | yes | `song_file {action:"save_version", label?}` | S |
| Versions… (list) | — | yes | `song_file {action:"versions"}` | S |
| Versions… (restore one) | — | Ask opens the sheet; you tap Restore — it replaces your working copy | `show {what:"versions"}` | S |
| Save As…, Rename… | — | yes, your songs | `song_file {action:"save_as"\|"rename", title}` | S |
| Publish (this song) | have (`publish_song`) | — | — | — |
| Publish all / folder publish | — | no — a batch over many songs deserves your tap in the Publish window | `show {what:"publish"}` | S |
| 🔗 Share link | — | yes — the link lands in the bubble, ⧉ copies it | `song_file {action:"share_link"}` | S |
| Download .mid / audio, Export score | — | Ask opens the sheet prefilled; you tap Export (iPad downloads need a tap) | `show {what:"export_score"\|"download"}` | S |
| Import… | — | Ask opens the hub; you pick files | `show {what:"import"}` | S |
| Settings: folder, GitHub token, data locations, AI model | — | **no** — secrets and file pickers | — | — |
| Settings: debug log, chip stream, text size | — | yes (harmless prefs, useful when chasing a bug) | `set_pref {name, value}` (whitelist; Learning mode is NOT on it) | S |
| Help | — | yes | `show {what:"help", section?}` | S |

#### The AI window itself

| feature | Ask today | should Ask have it? | proposed action (inside `act`) | effort |
|---|---|---|---|---|
| Messages for the terminal ("tell the terminal…") | have (bridge notes) | — | — | — |
| Errors and status since your last message | have (sent with every message) | — | — | — |
| Switch to another song's chat | — | yes, through `open_song` (§4) | — | — |
| Switch to the Terminal tab | — | no — the song chat already relays to the terminal | — | — |
| Clear chat, Compact | — | no — Ask erasing its own memory mid-reply breaks the reply; you tap | — | — |
| Screenshot to Claude | — | yes, later — "look at my screen" | `screenshot {}` | M |
| Install now / Not now (update countdown) | — | no — restarts the app under you | — | — |
| Speak, Paste, ⧉ copy, Dock, Move a sheet | — | not applicable (your input and window layout) | — | — |

## 2. Token cost, and the one `act` tool

### What Ask sends today (measured 2026-10-05)

Measured with the vm harness (`JSON.stringify(ASK_TOOLS)`, `askSys()`
in Learning mode, `tools/ai-profile.mjs`). Tokens are estimated at about
3.7 characters per token (English plus JSON); the app's own budget
estimator (`ASK_CPT = 2`) is deliberately pessimistic and would double
these.

| piece | sent when | characters | ≈ tokens |
|---|---|---|---|
| Tool menu, 12 tools, as the bridge writes it (`toolInstructions`, vendor/ai/bridge/server.mjs) | every model round, song chat | 10,919 | ~2,950 |
| …of which `write_notes` alone | | 2,325 | ~630 |
| …`edit_annotation` | | 1,736 | ~470 |
| …`copy_bars` / `add_annotation` / `delete_bars` | | 1,287 / 1,206 / 1,013 | ~350 / 330 / 270 |
| …the other 7 | | 3,352 | ~900 |
| Ask's system prompt (`askSys`, Learning) | every round | 5,345 | ~1,450 |
| Bridge profile prompts (common + read + link) | every round, bridge | 2,642 | ~710 |
| Context block (song, cursor, your annotations, notes in view) | every message | varies; budget caps it at 6k + 8k chars on big windows | ~1,000–4,000 |

Average today: about 900 characters (~245 tokens) per tool. Adding the
~45 actions from §1 as separate tools at that size would add **~41,000
characters, ~11,000 tokens, to every round**. That is the growth Josh
wants avoided.

### How each backend pays for it

- **Claude Code bridge.** The app's tools are not sent as an API `tools`
  field: the bridge pastes them as text into `--append-system-prompt`
  every round (`toolInstructions`), with the rule "call at most one tool
  per reply". Each round is a fresh `claude -p --resume` run. Anthropic's
  prompt cache makes a byte-identical system prompt cheap on a repeat
  (a cache read costs about a tenth of a fresh read), but only within
  about 5 minutes; after a pause the first message pays full price. And
  each round also re-reads Claude Code's own base prompt and the whole
  resumed chat. So on the bridge, **the number of model rounds costs more
  than the menu size.**
- **LM Studio / Ollama** (OpenAI-style `tools` field, backends.js). These
  are free in money but every token is processing time on your Mac, and
  their default 4–8k window is where a big menu really hurts: today's
  ~2,950-token menu is a third of an 8k window. They can reuse an
  identical prompt start, so a stable menu helps here too.
- **In-browser model** (WebLLM): sends no tools at all. Unchanged.

### The design: Ask's proposal (#437), mostly adopted

| # | Ask's proposal | verdict | why / amendment |
|---|---|---|---|
| 1 | One `act` tool, `{action, args}`; the menu is a one-line index per action (name + arg names, ~8 tokens) | **adopt** | Make it a list: `act {do:[{action:"go_to", bar:13}, {action:"play"}]}` (item 5). Realistic size with a 3–6 word gloss on each line: ~12 tokens per action. |
| 2 | `act({action:"help", topic})` returns one action's full spec on demand | **adopt, amended** | A help call is a whole extra model round (on the bridge a full `claude -p --resume`), so it must be rare. The index line must be enough for the common case, and **every rejected call returns that action's spec in its error** — a wrong guess costs the same one round help would, a right guess costs nothing. `help` stays for "what can you do?". |
| 3 | Keep the menu byte-identical every message, no per-message data in it | **adopt** | Build the index from a fixed registry in a fixed order (new actions appended at the end). Two variants only: song chat and general chat (they are different sessions anyway). Mode-specific wording stays in `askSys`, never in the menu. A vm test pins that the menu text doesn't change between two messages. |
| 4 | Terse results ("ok: cursor 13.1") | **adopt** | One line, facts only; the Learning sweep applies to result text too. |
| 5 | Batching: `act` takes a list | **adopt** | Runs in order, stops at the first failure and says which item failed; one undo step per editing action, not one for the whole list (so "undo" undoes the last thing, as you'd expect). |
| 6 | Fold existing tools in over time | **adopt** | Fold the 12 into actions in batch 6 (§5), after the new path is proven. Their long rule texts move into the `help`/error spec; one global line in `act`'s description keeps the law: "Only what the user asked in this message; never on your own initiative." |
| — | **Addition: quiet actions** | add | Navigation, playback and view actions are *quiet*: when every item in an `act` call is quiet and succeeds, the app shows the result line itself ("▶ playing from 13.1") as the reply, and does **not** send it back for another round. The model learns the outcome from the next message's existing "New since your last message" block. Needs a small AI-library change: a tool result `{final: "text"}` ends the exchange (vendor/ai/web/backends.js loop and `aiResume`; the library lives in Night-Roll-App/claude-bridge, synced with `tools/ai-sync.mjs`). |
| — | **Option for Josh: a no-model fast path** | your call | A tiny fixed grammar ("play", "stop", "bar 13", "play from 13", "undo") run by the app with no model call at all: zero tokens, instant. Risk: a sentence that looks like a command but wasn't meant as one. It would show a "(ran here)" tag. Not in the build order until you say yes. |

### What it costs after

| design | fixed menu per round | rounds for "go to bar 13 and play" | output tokens for that |
|---|---|---|---|
| Today | ~2,950 tokens (12 tools) | not possible | — |
| One tool per feature (rejected) | ~14,000 tokens (~57 tools) | 3 (one tool per reply on the bridge) | ~60 |
| `act`, all ~57 actions, existing tools folded in | **~700–1,000 tokens**, +~12 per future action | 2 (call, then a sentence) | ~40 |
| `act` + quiet actions | ~1,000 tokens | **1** | ~30 |
| Fast path (if Josh wants it) | 0 | **0** | 0 |

The `act` menu's size: ~57 index lines × ~45 characters + ~600
characters of header ≈ 3,200 characters ≈ 900–1,000 tokens. Folding the
existing tools in therefore **saves ~2,000 tokens per round** while adding
~45 actions. Each future feature adds one ~12-token line. On the bridge,
cached, that menu costs roughly the price of ~100 fresh tokens per round.

Measure, don't trust these: batch 1 adds a vm test that prints and pins
the menu's character count (song chat and general chat), so every later
batch shows its cost in the test output, and §2's table gets the real
numbers.

**Measured after batch 1 (2026-10-05, the same `toolInstructions` shape,
chars ÷ 3.7):** the `act` tool is 1,202 chars ≈ **325 tokens for 7
actions** (go_to, play, stop, select, undo, drummer, help) — about 70
chars per index line plus a ~700-char fixed header, footer and schema.
The whole song-chat menu is 12,122 chars ≈ 3,276 tokens: 12 tools +
act, against 12,286 (13 tools, the standalone drummer) just before and
10,919 (12 tools) before the drummer existed. So the drummer costs ~60
chars as an action instead of ~1,370 as a tool, and batch 3 (folding the
12 in) is where the big drop is. The general chat's act lists only
`help`. The vm test "act: one tool, one index line per registered action…"
prints both numbers every run and caps act's at 650 + 110 × actions.

**Measured after batch 2 (2026-10-05, open_song added as the 8th
action):** act 1,279 chars ≈ 346 tokens; the whole song-chat menu 12,199
chars ≈ **3,297 tokens** (still the twelve tools beside it).

**Measured after batch 3 (2026-10-05, the twelve tools folded in; same
`toolInstructions` shape, chars ÷ 3.7):** the whole song-chat menu is the
act tool alone — **2,355 chars ≈ 636 tokens for 20 actions** (go_to, play,
stop, select, undo, drummer, help, open_song + the twelve), against 12,199
(~3,297) the hour before and 10,919 (~2,950) before act existed. That is
**~2,660 tokens saved on every round**, ~118 chars (~32 tokens) per action
on average, because the twelve's long rule texts now ride only in `spec`
(help and rejected calls). The estimate of ~400 above was optimistic by
~240 tokens: write_notes' and edit_annotation's index lines carry their
argument shapes (`notes[{pitch bar beat dur_beats vel?}]`, `id|bar beat
match_text? …`), which a local model needs to see without a help round.
The vm test "batch 3: the menu is act alone…" prints this number every run
and fails if the menu ever grows past half the twelve-tool menu.

### Actions (the registry)

"quiet" = ends without a second model round. "edits" = goes through
`askWritableGate()`, one undo step.

| action | args | kind |
|---|---|---|
| `go_to` | bar, beat? | quiet |
| `play` / `stop` / `to_start` | from_bar?, beat? | quiet |
| `select` | from_bar, to_bar, tracks?, from_beat?, to_beat?, cycle?, clear? | quiet |
| `set_playback` | speed?, volume?, metronome?, met_bpm?, met_follow?, count_in? | quiet |
| `show` | what (roll, tracks, score, compare, mixer, instrument, notes_strip, velocity_lane, circle, jobs, messages, notes, analysis_guide, help, import, export_score, download, versions, publish), on? | quiet |
| `album` | play\|next\|prev\|leave, album?, song? | quiet — **done batch 7** |
| `find_pitch` | pitch \| "off" | quiet, on request only |
| `set_pref` | name (whitelist: album_order, octave_numbers, debug_log, chip_stream, text_size), value | quiet — **done batch 8** (Learning mode errors by name, never just an absent whitelist entry; `song: false`) |
| `open_song` | song, then? | quiet; ends the reply (§4) |
| `undo` | steps?, redo? | edits |
| `edit_notes` | op (**delete, quantize, velocity, split, join, divide, dedupe** batch 5; **transpose, move, copy, to_track** batch 6 — all done), from_bar, to_bar \| section, tracks, + op's own (transpose: semitones/octaves or scale_steps; move: bars/beats; copy: at_bar at_beat? to_track? semitones? octaves? labels?; to_track: to_track) | edits |
| `set_track` | track, mute?, solo?, hide?, volume?, pan?, voice?, color?, name?, octave? | edits — **done batch 7** (not conditionally quiet on M/S/H as this row once proposed: `quiet` is a per-ACTION registry flag, not per-call, so a mixed set_track call always goes back to the model, same as every other edit) |
| `add_track` / `delete_track` | name, voice? / track | edits — **done batch 7** (compositions only — the same gate the ＋ chip / voice menu's ✕ Delete track use; `set_track` works on any editable song) |
| `keep_that` | track? | edits — **done batch 7** |
| `bassist` | from_bar, to_bar \| section, track?, style?, busy?, octave?, follow?, seed? | edits — **done batch 4** |
| `drummer` | from_bar, to_bar \| section, energy?, busy?, hard?, fills?, feel?, parts?, follow?, seed? | edits — done (batch 0, folded into `act` batch 1) |
| `song_file` | new\|save_version\|versions\|save_as\|rename\|share_link, title?, label?, folder? | answered — **done batch 8** (`song: false`; its own sub-action arg is also named `action` — a model sends it under `args` to avoid colliding with the item's own, as `album`'s does) |
| `check` | chord\|key_vs_file\|meter_vs_file, bar?, beat? | answered, on request only |
| `song_facts` | form\|melody\|rhythm\|bass\|voices, from_bar?, to_bar? | answered, on request only |
| `help` | action? | answered |
| *(folded later)* `add/edit/delete_annotation` (+ meter, chop), `write_notes`, `copy/insert/delete_bars`, `read_bars`, `read_song`, `read_notes`, `list_songs`, `publish_song` | as today | edits / answered |

"answered" actions return data the model must turn into a sentence, so
they cost two rounds. Edits are answered too (the model confirms what it
did) unless all items in the call are quiet.

## 3. How to ask (plain phrases)

Say it the way you'd say it to a person. Ask maps it to an `act` action
(every one of these is one, since batch 3), does it, and answers in one line. If a name is ambiguous it asks which one — it
never guesses.

### Works today

- "Put an F#m chord on bar 21." — chord band
- "Mark bars 5 to 12 as section A." — section
- "Set the key to B flat at bar 1." / "key B flat, mode unknown" — key
- "Tempo 192 at bar 6." — tempo
- "The loop goes back to bar 2 — mark it at the end." — loop point
- "Write a note at bar 9: this sounds like the opening, inverted." — text note
- "Change the chord at 14.1 to G7." / "Move section B to start at bar 17." — edit
- "Delete the note at bar 16." — delete an annotation
- "On pulse 2, write C5 at bar 3 beat 1, an eighth, then D5 on beat 1.5 …" — write notes
- "Repeat bars 5 and 6 right after themselves." — copy bars
- "Insert two empty bars at bar 9." / "Delete bars 30 to 32." — insert / delete bars
- "What's on the triangle in bars 40 to 48?" — read bars
- "Compare this to Ambush." / "What did I write in Graveyard's notes?" — read another song
- "Publish." — publish the open song
- "Tell the terminal the drummer fills are too busy." — note to the terminal
- "Go to bar 13." / "Go to bar 13 and play." — act: go_to (+ play), one reply (batch 1, 2026-10-05)
- "Play from bar 17." / "Stop." — act: play / stop
- "Loop bars 5 to 12." / "Select bars 5 to 12, no cycle." / "Clear the selection." — act: select
- "Undo that." / "Undo the last three." / "Redo." — act: undo (says what each step was)
- "Drums for bars 5 to 12, a bit less energy, following pulse1 and pulse2." — act: drummer
- "What can you do?" / "Help with drummer." — act: help
- "Open Graveyard." / "Open Graveyard and play it from bar 9." — act: open_song (batch 2, 2026-10-05): the switch waits for the reply to land, the ↪ line and the carried-over request land in Graveyard's chat (§4)
- "Bass line for bars 1 to 16, busy 2, follow the drums." — act: bassist (batch 4, 2026-10-05): the same bsGenerate the Bassist sheet runs, one undo, the reply never names the chord it read or inferred
- "Delete the notes on pulse 1 in bars 5 and 6." — act: edit_notes delete (batch 5, 2026-10-05)
- "Quantize the triangle in bars 1 to 8 to a 16th, 75 percent." — act: edit_notes quantize
- "Make bar 4's notes on pulse 1 softer — velocity 60." / "…louder, +10." — act: edit_notes velocity (absolute or relative)
- "Split the long note at bar 7 at beat 3." / "Divide it into three." — act: edit_notes split / divide
- "Join the two notes on pulse 2 in bar 2." — act: edit_notes join
- "Remove the duplicate notes on pulse 2 in bar 8." — act: edit_notes dedupe
- "Mute the noise channel." / "Solo the triangle." / "Pan pulse 1 left a bit." / "Make pulse 2 a square lead voice." / "Rename track 4 to bass." / "Shift the bass up an octave." — act: set_track (batch 7, 2026-10-05): every field lands through saveTrackDir, the SAME track: annotation the mixer/voice-menu UI writes; one undo for the whole call
- "Add a track called pad." / "Delete the empty track." — act: add_track / delete_track (batch 7): compositions only, one undo each; refuses the song's last track
- "Keep that on pulse 1." — act: keep_that (batch 7): the rolling ~60s capture buffer, written through the SAME captureKeep Record itself uses
- "Play the FF1 album." / "Next song." / "Leave the album." — act: album (batch 7): albumStart/albumNext/albumPrev/albumLeave, the album strip's own functions; an ambiguous or unknown name errors, never guesses
- "New song called Night Rain." — act: song_file new (batch 8, 2026-10-05): creates it and names/folders it in one step, errors on a title collision instead of popping a confirm that can't be tapped
- "Save a version called before drums." / "Versions." — act: song_file save_version / versions
- "Save as Ambush 2." / "Rename it to Ambush 2." — act: song_file save_as / rename: save_as works on anything open, captures included
- "Share link." — act: song_file share_link: a song that only lives on this device says so, instead of a dead link
- "Turn the debug log on." / "Chip stream auto." / "Text size large." / "Album order A to Z." — act: set_pref (batch 8): the same device prefs the Settings sheet/album strip set; Learning mode is never one of them
- Help → AI → **AI commands** lists every one of these with a phrase, generated from the registry.

### Coming (proposed in §1; all of these are `act` actions)

In build order (§5): the tedious things first, the one-tap things
(play, stop, go to a bar, show a panel) last.

- "Back to the start." — to_start (today: "go to bar 1")
- "Slow it to 70 percent." / "Volume 80." — set_playback
- "Metronome on, count me in." — set_playback
- "Move bars 9 to 12 on pulse 2 up an octave." / "…up a step in the key." — act: edit_notes transpose (batch 6, 2026-10-05: `octaves: 1` / `scale_steps: 1` — the second only with YOUR declared key over those bars, else it answers "no key declared" and does nothing)
- "Move the pulse 1 notes in bar 3 two beats later." — act: edit_notes move (`beats: 2`; `bars: -1` = a bar earlier)
- "Copy the pulse 1 line in bar 3 to pulse 2, an octave down." — act: edit_notes copy (`at_bar: 3, to_track: "pulse2", octaves: -1`; `labels: true` brings the chord/section/text annotations over those bars, chord labels transposed with the notes, as Paste to… does)
- "Move the triangle's bars 5 to 8 onto pulse 2." — act: edit_notes to_track
- "Show the score." / "Open the mixer." / "Show the circle of fifths." — show
- "Light up every B flat." / "find off." — find_pitch
- "Challenge my chord at bar 14." — check (facts about your label, only on request)
- "Does my key match what the file says?" — check vs file
- "Which bars repeat?" / "What's the bass doing, as facts?" — song_facts (on request)
- "Meter 3/4 at bar 1." / "Chop off everything before bar 3." — meter / chop
- "Open the export sheet." / "Open import." — show (you tap the last step)

## 4. "Open graveyard" — switching songs and chats

### How chats are kept today

- Each song has its own chat, stored on the device under
  `ff1roll-ask-<song path>` (`askStoreKey()`, src/ask/sheet.js), and on the
  Claude Code bridge its own long-running session named after the song
  (`askSessionName()`, src/ask/bridge.js; Normal mode gets a separate
  `#normal` session).
- The AI window already follows the song: when a song loads, `setSong()`
  re-renders the open AI window with the new song's chat
  (src/session/song.js, near the end).
- So the chat switch comes for free once the song switches. The work is
  in **when** to switch and **what to carry over**.

**Shipped 2026-10-05 (batch 2)** as written below, with Q13's default:
the follow-on sends itself; the chip appears only when the new chat holds
an unsent draft. Code map in NIGHT-ROLL.md "open_song — switching songs
and chats".

### Why the switch must wait until the reply lands

The AI library (vendor/ai/web/client.js, `aiRun`) runs tool calls inside
one exchange: after a tool returns, the model gets another round, with a
fresh context block, and the whole reply is stored under the chat it
started in. If `open_song` switched songs mid-reply, the next round
would see Graveyard's notes but be saved into Ambush's chat and Ambush's
session — the two songs mixed. (`aiResume` already has the same rule:
"a tool round acts on the OPEN chat's subject".)

So `open_song` does not open anything itself. It:

1. Finds the song: the catalog (`askSongPath`) **plus this device's local
   drafts and compositions**. Today `askSongPath` takes the first catalog
   match and misses local drafts; the new lookup lists every match and
   returns an error naming them when there's more than one ("Graveyard
   (FF1) or Graveyard 2 (your compositions)?"). Never a guess.
2. Remembers the switch (`S.askSwitch = {path, then, from}`) and answers
   "Opening Graveyard." `open_song` is quiet (§2) and must be the last
   item in its `act` list; any item after it, or any later call in the
   same reply that touches the open song, refuses: "the song is changing
   — ask again in Graveyard's chat." So opening costs one model round.
3. When the reply has landed (`host.landed`, src/ask/client.js
   `askLanded`), opens the song through the same path File → Open
   Recent uses (`openRecentSong`, src/ui/chrome.js: a local copy wins,
   the album run ends, the address bar updates, `loadSong`).
4. Once `loadSong` finishes and `S.songKey` is really Graveyard, shows the
   ♪ song tab and drops a gold handoff line into Graveyard's chat:
   "↪ from Ambush: *open graveyard and play it from bar 9*".
5. If `then` was given, sends it as your message in Graveyard's chat
   ("play it from bar 9"), so Graveyard's AI does it with Graveyard's
   notes in front of it. `then` must be your words, not the model's
   summary; the bubble shows exactly what was sent.

### What you see

- In Ambush's chat: your message, then "Opening Graveyard."
- The roll changes to Graveyard. The AI window stays where it is (open,
  docked or floating); its tab now says ♪ Graveyard, and you're looking
  at Graveyard's own history.
- At the bottom: the ↪ line, and, if you asked for more, your carried-over
  request and Graveyard's answer.
- Graveyard's AI does **not** remember the Ambush conversation, only the
  ↪ line. To ask it about Ambush, say so ("compare with Ambush"), and it
  reads Ambush with `read_song`/`read_notes`.

### Edge cases

| situation | what happens |
|---|---|
| Ambush has unpublished edits | Nothing is lost: every edit is already kept on the device. The ● stays on Ambush. Ask's line says "Ambush's changes are kept on this device (not published)." |
| A newer save of Graveyard exists from another device | The existing in-app "NEWER SAVE EXISTS" sheet appears (from `loadSongInner`); the handoff waits for your answer. |
| The song can't load (offline, missing) | The switch stops; the status line says why (`loadSong` already does); Ask stays in Ambush's chat. No handoff. |
| You have an unsent draft in Graveyard's message box | Sending would wipe it (`afterSend` clears the box). So the carried-over request is NOT auto-sent: it shows as a chip, "Send carried-over request", one tap. |
| An album is playing | Opening a song by hand ends the album run (the same rule as Open…). Playback stops when the new song loads. Ask says so. "Next song" during an album goes to the `album` tool instead. |
| Graveyard is a capture / locked | Opening is fine (it's just looking). Editing tools in Graveyard's chat refuse as usual, naming ✎ Edit. |
| Graveyard is one of your compositions | Opening isn't editing, so no extra approval. Changes still need your ask, each time. |
| Song viewed from a link to another repo | `open_song` only opens songs from that same repo's list. |
| Asked from the general Ask tab | Same: opens the song and moves to its ♪ chat. |
| Typed in the Terminal tab | That goes to Claude Code in the terminal, not Ask. Nothing opens. |
| It's already open | "Graveyard is already open." No reload. |
| A song is still loading | Refuses: "still opening the last song." |
| A reply in Ambush's chat is still cooking | It keeps cooking on the Mac and lands in Ambush's chat; the ✦ reply badge tells you (already how it works). |
| Learning vs Normal mode | Mode is device-wide, so both chats are in the same mode; nothing crosses modes. |
| Loops | A carried-over request can't itself open another song. Only your next message can. |


## 5. Build order

**Ranking rule (Josh, #441):** what's tedious by hand comes first —
regenerating drums and bass over a range, bulk note edits, multi-bar and
multi-step work, opening and switching songs. One-tap things he can do
himself (move the playhead, press Play, open a panel) come last.

Each batch is sized for one builder. Every batch also does the shipping
checklist: the help sheet's "Asking it to act" entry gets the new phrases,
`node tools/build_help.mjs`, a drift keyword, NIGHT-ROLL.md's ✦ Ask
section, and §3 of this file moves its phrases from "coming" to "works
today". Tests are vm tests (`npm test`) in tests/night-roll.test.mjs; the
write_notes/copy_bars tests are the template (gate refusal, one undo
step, an unknown track name is an error, Learning sweep). New actions are
registry entries in src/ask/actions.js (`ASK_ACTIONS`), never new entries
in `ASK_TOOLS` — the procedure is NIGHT-ROLL.md "act — the action
registry": one entry, `node tools/build_ask_help.mjs && node
tools/build_help.mjs` (the Help sheet's AI commands rows are generated
from the registry), one vm test.

"Menu after" = the always-sent tool text per round once the batch lands
(today ~2,950 tokens). Estimates; batch 1's test pins the real count and
each batch updates this column. "Rounds" = model replies for the batch's
typical request (quiet = 1, edits and questions = 2).

| # | batch | actions | files touched | tests | menu after | rounds | builder |
|---|---|---|---|---|---|---|---|
| 0 | Drummer | `drummer` | — | — | — | — | **done 2026-10-05** — landed as a tool (~370 tokens), folded into `act` as an action the same day (Josh #449). |
| 1 | The `act` tool (foundation) | registry, index builder, `help`, quiet `{final}` results, `undo` | src/ask/tools.js (registry, `act` runner), src/ask/bridge.js (`askToolsNow`), vendor/ai/web/backends.js + client.js (`{final}` ends the exchange — library change, made in Night-Roll-App/claude-bridge and synced) | menu byte-identical across two messages; menu size printed and pinned; a list runs in order, stops at the first failure; a bad call's error carries the spec; an all-quiet call = exactly one request to the fake server; undo reports what it undid | measured **3,276** (act alone 325) | 1–2 | **done 2026-10-05 (Fable)** — src/ask/actions.js; also go_to/play/stop/select from batch 9, `drummer` folded in, 7 tolerance tests for local models (#443), `runActions` with no model (§7), Help → AI commands generated from the registry (#451); library commit dfef7e7 awaits a tag + `ai-sync --ref` |
| 2 | Open a song + chat handoff | `open_song` (§4) | src/ask/tools.js, src/ask/client.js (`askLanded` runs the switch), src/ask/sheet.js (↪ line, carried-over chip), src/ask/context.js (one prompt line) | switch only after landing; nothing after `open_song` runs; ambiguous name lists matches; local drafts found; unsent draft → chip, not send; album run cleared; load failure → no handoff; one hop only | measured **3,297** (act alone 346, 8 actions) | 1 | **done 2026-10-05 (Fable)** — `askOpenSongQueue` (src/ask/actions.js), `askSwitchRun`/`askSend(text)` (src/ask/client.js), `askCarryChip`/`askDraftText` (src/ask/sheet.js), `askSongMatches` (src/ask/tools.js), `openRecentSong` async; Q13's default (the follow-on sends itself; a chip only when the new chat holds a draft) |
| 3 | Fold the old tools in | the 12 tools of §1 + `meter`/`chop` kinds | src/ask/tools.js, src/ask/bridge.js (`ASK_SONG_ONLY_TOOLS` becomes a per-action flag), src/ask/context.js (prompt text naming old tools) | every existing tool test passes through `act`; their rule texts reachable by `help` and in errors; Learning sweep; menu size drops | measured **636** (act alone, 20 actions; 2,355 chars) | as today | **done 2026-10-05 (Fable)** — all twelve are `ASK_ACTIONS` entries over the same src/ask/tools.js functions; `ASK_TOOLS` empty, `ASK_SONG_ONLY_TOOLS` gone (the `song` flag), `askRunTool` dispatches act alone, the prompt's twelve sentences are one paragraph; add_annotation writes `meter`/`chop`, delete_annotation takes them back |
| 4 | Regenerate drums and bass | `bassist` | src/ask/tools.js (`askBassist`, wraps `bsGenerate` + `applyTake`, src/gen/bassist.js; the drummer's shape — `askDrummerRange` reused for bars/section, track creation folded into the same undo via `undoTrackAdd`, same as the Drummer's kit) | says what it replaces and the seed; refuses on captures; one undo; reply never names a chord or key it read or inferred (Learning sweep) | measured **672** (act alone, 21 actions; 2,487 chars) | 2 | **done 2026-10-05 (Sonnet)** — bar range or section label, track by name or "new" or omitted (the sheet's own default: the detected bass track when free in range, else a fresh one), style/busy/octave/follow/seed all validated against the sheet's own knobs |
| 5 | Bulk note edits | `edit_notes` ops delete, quantize, velocity, split, join, divide, dedupe — over bars + tracks | src/ask/tools.js (`askSelectRange`: bars/section + tracks → `S.multiSel`, then the real src/model/selection.js functions read it via `selEditItems()`); src/model/selection.js grew a `scope` param on `removeDuplicateNotes` and a new `setSelectionVelocity`, both thin wrappers over the same undo machinery | one undo step per item; refuses on captures; unknown track errors naming the song's tracks; an empty result answers rather than erroring | measured **703** (act alone, 22 actions; 2,600 chars) | 2 | **done 2026-10-05 (Sonnet)** — grid like "1/16" (temporarily overrides `S.gridDiv`, restored after), strength as a 0–1 or percent, vel absolute or relative (+10/-10), at_bar/at_beat for split else halves, into: N for divide |
| 6 | Moving music over ranges | `edit_notes` ops transpose, move, copy, to_track | src/ask/tools.js (the four ops over `askSelectRange`'s selection, calling the SAME src/model/selection.js functions the ⇅ Transpose sheet / arrow keys (`nudgeSelection`, `diatonicShift`), Paste to… (`copySelection` + `pasteClipboard`) and ⇄ Move to track (`moveSelectionToTrack`) call); src/model/selection.js: `diatonicShift(dir)` takes any whole step count (±1 from the sheet, unchanged), `copySelection(annoSpan?)` lets the named bars stand in for the lasso box's ruler reach | in-key transpose uses the declared key (`sfDeclaredAtRaw` over every selected note) or errors "no key declared" with nothing changed — never estimated, never named; copied chord labels transpose like Paste to… (`labels: true`); one undo per item; refuses on captures; unknown track names the song's tracks; a destination past the end grows the song as Paste to… does | measured **724** (act alone, 22 actions; 2,680 chars — +80 chars for the op list on the index line, so a model finds transpose/move/copy without a help round) | 2 | **done 2026-10-05 (Fable)** — copy's destination is `at_bar`/`at_beat` (copy_bars' names; `to_bar` is the range's own end — the row above had the clash); `askSelectRange` now also clears `S.lassoAnno`, so a leftover UI lasso box can no longer make a batch-5 delete/copy take annotations along |
| 7 | Tracks and albums | `set_track`, `add_track`, `delete_track`, `keep_that`, `album` | src/ask/tools.js (`askSetTrack`/`askAddTrack`/`askDeleteTrack`/`askKeepThat`/`askAlbum`, over `saveTrackDir`/`renameTrack`/`addTrackUndoable`+`undoTrackAdd`/`transposeTrack`/`captureKeep`/`albumStart`/`albumNext`/`albumPrev`/`albumLeave`/`albumEffectiveOrder`) | settings land as `track:` annotations, never localStorage (asserted: no new localStorage key outside the draft/notes layer); voice names matched against the built-in VOICES list, unknown names list every choice; one undo per call (a mixed set_track/add_track call that pushes more than one sub-entry — saveTrackDir's anno snapshot + transposeTrack's note mod, or addTrackUndoable + a voice's own saveTrackDir — folds them into ONE group, `askFoldUndo`); add/delete_track refuse outside `isComposition()` (stricter than `set_track`'s `editableSong()`, matching the real ＋ chip / ✕ Delete track); delete_track refuses the song's last track; album play/next/prev refuse before sound is unlocked, like `play`; an ambiguous album/song name lists every match | measured **3,115 chars (~842 tokens, 27 actions)** | 1–2 | **done 2026-10-05 (Sonnet)** — rename itself pushes no undo (`renameTrack` never did; noted, not "fixed" here); `album`'s own sub-action arg is named `action` too, so a model must send it under the `args` wrapper to avoid colliding with the item's own action name (one of `askActItems`' existing tolerances, not a new one) |
| 8 | Song files and prefs | `song_file`, `set_pref` | src/ask/tools.js (`askSongFile`/`askSetPref`, over session/files.js's `createComposition`/`saveSongAs`/`forkCurrentSong`, import/capture.js's `renameImportDraft`, sync/publish.js's `renameRepoTitle`/`shareLinkFor`, model/versions.js's `pushVersion`/`readVersions`/`filesMirror`, model/album-order.js's `setAlbumOrderPref`, ui/sheets.js's `settingsPersist`) | Learning mode not settable (an explicit refusal, not just an absent whitelist entry); a local-only song's (not in `S.CATALOG`) share link says so instead of a dead one; `new`'s title collision is checked BEFORE calling `saveSongAs` so a would-be `appConfirm()` never has to wait on a tap that can't come; `save_as`/`rename` work on anything open (captures included — reflecting what `forkCurrentSong`/the rename handlers actually gate, not the row's own "your songs" paraphrase); both actions are `song: false` (their own sub-actions check for an open song where they need one) | measured **3,325 chars (~899 tokens, 29 actions)** | 2 | **done 2026-10-05 (Sonnet)** — `song_file`'s own sub-action arg is named `action`, same as the item's own act-level discriminator: a model (or a test) sending both must use the `args` wrapper, one of `askActItems`' existing tolerances |
| 9 | One-tap things (low priority) | `go_to`, `play`/`stop`/`to_start`, `select`, `set_playback`, `show` | src/ask/tools.js | each moves the right state; play before sound is unlocked → "tap Play once"; `show` refuses unknown names listing the valid ones | ~700 | 1 | EASY — Sonnet |
| 10 | Facts on request | `find_pitch`, `check`, `song_facts` | src/ask/tools.js, an adapter from `S` to the theory/facts `doc` shape (docs/theory-toolkit.md §3.0) | tests/theory.test.mjs's word sweep on every result (no key/chord/numeral/meter words); run only when called | ~780 | 1–2 | **TRICKY — Fable** |
| 11 | Later | `screenshot`; analysis-sheet actions once that plan is approved; the no-model fast path if Josh wants it | — | — | — | — | decide then |

Batch 1 is first only because everything else is an action inside it.
Batch 3 is early because it makes every later message cheaper than today.

## 6. Options for Josh

The `act` design makes the menu nearly flat, so the tiers differ by only
a few hundred tokens per round; the big saving comes from batches 1 and
3, not from leaving features out. What every tier shares is the
per-action cost: a quiet action (open a song, go, play, show) is **one**
model reply; an edit or a question is **two**. A multi-step request
("drums for 5–12, then quantize the bass there") is still one call with
two items, so still two replies.

| tier | what Ask can do | menu per round | vs today (~2,950) | batches |
|---|---|---|---|---|
| **Minimal** — the tedious things | today's 12 tools, plus: open a song and switch chats; regenerate drums and bass over a range; bulk edits over bars and tracks (delete, quantize, velocity, split, join, divide, remove duplicates); undo/redo | ~470 | about **−2,500** | 1–5 |
| **Core** | Minimal, plus: transpose / move / copy / move-to-track over ranges; track settings (mute, solo, volume, pan, voice, rename, octave, add, delete); Keep that; albums; meter and chop; save version / save as / rename / new song / share link; device prefs | ~590 | about **−2,350** | 1–8 |
| **Full** | Core, plus the one-tap things (go to a bar, play/stop, loop a range, speed/volume/metronome, show views and panels) and the fact tools on request (find a pitch, challenge a chord, key/meter vs file, form/melody/rhythm/bass/voice facts); later screenshot and the analysis sheet | ~780 (upper bound ~1,000) | about **−2,150** | 1–10 |

Not in any tier (reasons in §1): switching Learning mode, Analyze /
Annotate this song, Chord?, Record, finger tools, file pickers and
secrets in Settings, Clear chat, Install now.

**Recommendation: Core.** Ship batches 1–3 first and measure; that alone
makes Ask cheaper per message than today. Core then covers the work
that's tedious by hand. Full's one-tap actions are cheap (one reply each)
but you can do them faster with a finger, and its fact tools need the
most care with the Learning law — worth building when you want them.

**Your decisions** (for the QUESTIONS FOR JOSH list):
1. Tier: Minimal, Core or Full?
2. The no-model fast path ("play", "stop", "bar 13" run with zero
   tokens): yes or no? (Only matters if you pick Full.)
3. "Open Graveyard and play from bar 9": should the follow-on send
   itself in Graveyard's chat (as designed in §4), or always wait for
   your tap?

## 7. Idea on file: a cheap dispatcher model (Josh, via Ask #446, 2026-10-05)

Josh's idea, to weigh rather than a directive: a cheap model (Haiku, or a
local LM Studio model) holds the full action list and turns Ask's plain
request ("go to bar 13 and play") into actions, so Ask itself carries one
tiny tool. Ask's read: `act` is the same front door, so a dispatcher can sit
behind it later without changing Ask's side. The gain is small while Core
stays around 590 cached tokens. Precise work (write_notes, bar ranges) should
keep going direct. Decision: not in batches 1–3. Revisit after measuring
Core in use. Keep act's registry callable without a model, so a dispatcher
can be added later.
