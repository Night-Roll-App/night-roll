# Open questions: defaults under "Decide; never park work on a question" (2026-10-14)

Source: `open-items.md` (the "QUESTIONS FOR JOSH" list, lines 739–844, plus inline "QUESTION / WAITING ON JOSH / JOSH TO LISTEN / ASK JOSH" lines elsewhere), checked against `git log` and the tree on 2026-10-14. Read-only triage. Nothing was committed and open-items.md was not edited.

Only three things wait for Josh: **(a)** editing his songs (`albums/compositions/`, his .mid / .rollnotes); **(b)** deleting stored data; **(c)** spending his money. A fourth kind is listed apart: **(d) Josh-only action**, meaning something only he can physically do (his credentials, his hardware, his App Store account). It is not a decision, so no default can replace it.

Size: S ≤ half a day · M ≈ 1–2 days · L = a week or more.

## Counts
- Rows: **46** (33 from the numbered list, 13 inline). Grouped rows: Q30–36 and Q40–45 are one row each.
- **Stale / already answered: 21.** Move these to DONE. One of them (Q21) has a **ruling that was not followed** (see the flag below).
- **Truly blocking: 6.** Of these, 3 fall under (a)/(b)/(c) and 3 are (d) Josh-only actions.
- **Non-blocking (decide and build): 19.**

## FLAG: Q21's ruling was not followed
Q21 was ANSWERED NO (Josh #224): "static stays out of the MIDI; only Giygas' Static gets its notes. The SPC rootFallback must be narrowed to that before any EarthBound re-capture."
- `tools/spc/notes.mjs:439` `rootFallback()` was **not** narrowed. It still re-pitches every low- or no-confidence instrument whose notes fall outside 0–127.
- The EarthBound re-capture (76ac3539, 2026-10-14) shipped anyway. `belch-s-factory.mid` went from 79,298 to 207,837 bytes, which matches the "6,611 → 20,340 notes" static example that Q21 rejected.
- Fix (non-blocking: these are game captures, replaced in place under the #436/#437 rule, the old files stay in git, and no .rollnotes are touched): narrow `rootFallback` so static samples stay dropped (Giygas' Static excepted), then re-apply `snes/earthbound`. Size S–M.

## Table: numbered list

| id | one-line summary | blocks? | default if not blocking (why) | work it unblocks (size) | dependency |
|---|---|---|---|---|---|
| Q46 | Synth triangle weak on iPad speakers | No | **A as an extra voice "triangle (NES)"**, default voice unchanged (no risk; he A/Bs by ear) | Add a 16-step NES triangle voice to the voice menu (S) | none |
| Q40–45 | Note movement: keep off-grid offset / zoom-adaptive grid / length buttons drive drag step / auto-T on triplet grab / 2nd finger = no grid / vertical drag locks pitch | No | Q1 (a) relative move, but a line "catches" it (the plan's pick). Q2 yes, grid follows zoom (Logic/GarageBand). Q3 separate drag grid ▦ set to "auto" (length buttons only for drawing). Q4 yes. Q5 yes. Q6 no auto-lock (GarageBand/FL don't). Matches the DAWs he asked to be compared with. | Build the docs/plans/2026-10-10-note-movement.md plan (M). Before shipping, run it in the real browser (no-unseen-layout rule) | plan exists; propose ▦ wording first (UI-wording rule) |
| Q38 | FF8 Choir Chant: each recording at its own pitch vs one line | **Stale** | Already built with the default (21790cc: pitch = sample's measured root; melodic copy) | none | the which-copy-to-keep part is I8 |
| Q39 | FF9 Hunter's Chance: drums or a tune | **Stale** | Default (drums) is what shipped; it is not among the §13 melodic copies | none | none |
| Q37 | Plugins (AUv3) + native app: 8 questions, the 1-week spike | No for the spike. **(c)** only if a paid AUv3 is needed | Run the spike with a **free** AUv3 instrument. Plugin settings go in a sidecar beside the song, never inside his .mid/.rollnotes (keeps the song-data rule clean). Playback only, no Bounce in v1 | 1-week spike: one AUv3 plays one track of a scratch/FF1 song, judged in time by ear (L) | Swift plugin in night-roll-app; his ear for the verdict |
| Q30–36 | Coach commentary (7 questions) | No | Doc's option A: review link; her comments come back by message; one-tap import into a **separate comments file** (never his .rollnotes); no GitHub account; she sees his view only; Claude reads comments only when asked | Step 0: no code (send today's 🔗 Share link). Then comments-file import + view (M) | none |
| Q25 | Fix saved PS1 songs' drums in place | **Stale** | Answered yes. FF7, PE, SaGa, FF8, FF9 and CC have all been applied | Dark Cloud is held on the PS2 bank rule (engineering, not a question) | PS2 VAB/HD bank rule |
| Q26 | Drum names guessed from rhythm | **Stale** | Live since 9/27 = the default ("keep") | none | none |
| Q27 | Pedal tones treated as drums until the detector turns them back | No | **Yes** (the default; the detector is the agreed path) | PS1 detector step that returns pedal-tone parts to normal tracks, re-capture in place where the timeline is unchanged (M) | percussion plan §4/§13 rework |
| Q28 | SNES kit: one track or per voice | **Stale** | Answered #429: per voice, final. Shipped in SNES step 2 | none | none |
| Q29 | SNES drum notes to GM keys | **Stale** | Answered #429: GM keys, final. Shipped | none | none |
| Q23 | Nocturno icon pose | No | Keep the current icon. He said "not right now, music first", so build nothing | none until he raises it (S) | none |
| Q24 | Echo: does it appear anywhere yet | No | Answer it as a fact (grep the app), not a decision. Report once in the next note | lookup (S) | none |
| Q21 | EarthBound static notes in the MIDI | **Stale (answered NO), but the ruling was violated** | n/a. See the FLAG above | Narrow rootFallback + re-apply EarthBound (S–M) | none |
| Q19 | NES triangle notes run long (Zelda 439/511) | No | **Yes, shorten** to where the game stops them (the default. Starts/pitches/bars don't move, so it is in-place under #436/#437) | NES capture change + NES re-capture, one album per push (M) | none |
| Q20 | SNES phantom notes (~8%, MMX/SF2) | No | **Yes, remove** (the default. The timeline is unchanged, so in place; old files stay in git) | SNES capture ghost filter + SNES re-capture of the affected albums (M–L) | SNES step 2 done; sequence after the Q21 EarthBound re-apply |
| Q18 | Loudness fix + volume control | **Stale** | Answered #187, shipped | (storage of the measurements is I9) | none |
| Q17 | Cursor position readout | **Stale** | Answered B, shipped 2026-10-07 | none | none |
| Q1 | FFX: published or fresh pitches (4 songs) | No | **Fresh (v2) capture.** The driver's own code shows published is off (Ominous an octave; Hurry/Welcoming 2.66/3.10 semitones). The #436/#437 rule replaces in place where the timeline is unchanged, else `-recapture` copy. .rollnotes untouched. Josh also said of PS2 "just do whatever you think is best" | FFX dry run + apply with PS2 capture v2 (M) | PS2 capture v2 merged; then the console-voice FFX slide-range fix |
| Q2 | Archive move: make a token, say "go" | **Yes, (b) + (d)** | n/a. Needs his token, and the move removes data from this repo | archive-to-joshcough branch (M) | Josh creates the token |
| Q5 | Create the redirect repo (one `gh` command) | **Yes, (d)** | n/a. The permission classifier blocks the agent. Verified 2026-10-14: `Night-Roll-App/night-roll-app.github.io` still does not exist | bare-address redirect (S) | Josh runs the `!` command |
| Q6 | `oldBpb` undeclared in convertAnchors | **Stale** | Fixed: no `oldBpb` left in src (last touched 1c1e617b, 2026-10-07 meter-change fix) | none | none |
| Q7 | Split step 7 audio check | **Stale** | Answered #92, shipped | none | none |
| Q8 | AI library repo name | **Stale** | Answered #93 | none | none |
| Q9 | iPad ear check after module-split steps 3–4c | **Stale** | Superseded by ~10 days of daily iPad use on later builds (known-good engine) | none | none |
| Q10 | Tetris A-Type repair: anything local on the old key? | **Stale** | Repair is deployed: both `a-type-music-version-1-0.mid` and `-1-1.mid` exist | none | none |
| Q14 | Analysis sheet: 16 prompts or fewer | **Stale** | Shipped with the default (16, ids stable). Wording changes only if he asks | none | none |
| Q15 | "File under" chips in the annotation editor | No | **Build it.** The default was "after a week of use", and the sheet shipped ~10-05, so that week has passed | S3 chips row in the annotation editor + sheet lists by type (M) | none |
| Q16 | Show "▸ N chord bands" count | **Stale** | Shipped with the default (keep) | none | none |
| Q11 | Ask feature tier | **Stale** | Default Core is in effect (`act` registry + batches 1–8 built) | none | none |
| Q12 | No-model fast path for play/stop | **Stale** | Default "no fast path" is in effect. Nothing to build | none | none |
| Q13 | Follow-on ("play from bar 9") sends itself after a song switch | No | **Sends itself** (the default) | Verify the behaviour in the current Ask. If missing, wire the follow-on (S) | none |
| Q22 | ✱-note converter on his chord notes | **Yes, (a)** | n/a. Rewrites his .rollnotes (FF1 shop, Graveyard, …) | applier (S) once he says yes | Josh |

## Table: inline items (outside the numbered list)

| id | where | one-line summary | blocks? | default if not blocking (why) | work it unblocks (size) | dependency |
|---|---|---|---|---|---|---|
| I1 | L19 | Guitar app: hardware step 0 (Real Tone cable + interface) + fixture takes | **Yes, (c) + (d)** | n/a. Possibly buying hardware, and only he can play the takes | detector gate (M) | Josh |
| I2 | L20 | Guitar: should speaker+mic (pitch-only) runs unlock the next tempo? | No | **No** (current behaviour. A pitch-only run can't grade timing honestly) | none; keep as is | none |
| I3 | L10 | SNES kit decision facts: where to show them for published songs | No | **The track's ⓘ / track menu**, beside "These are drums / Not drums" (where the decision is acted on). Learning mode: names a drum, never a key | small read-only row (S) | none |
| I4 | L13 | FF5 "The Battle"/"What?" ear check of the kit rule | No (an ear check, not a decision) | Nothing waits on it. If his ear says voice 0 / s32 is wrong, it becomes a failing test then | none | his ear, whenever |
| I5 | L42 | N64 Rare: do hand-drum parts still need the kit lane after the fade? | No | **No flip for now.** Ship the fade (VELOCITY only, no MOVED). The flip has no bank fact to separate percussion from melodic one-shots | Merge the Rare fade branch, then `recapture --apply` per Rare album, one per push (M) | branch merge |
| I6 | L27 | EarthBound root-fallback "DECIDE before --apply" | **Stale** | Decided by Q21 (NO), but see the FLAG | (covered by the Q21 fix) | none |
| I7 | L35 | FFX: re-split Hurry/Welcoming/Pursuit notes at the real bend range? | No | **Don't re-split.** v2's bend carries the difference, so the sound is right and no notes move | none (folds into Q1) | Q1 |
| I8 | L719 | FF8 Choir Chant / FF9 Qu's Marsh / Garnet's Song 1 / Song of Memories: which copy to keep | **Yes, (b)** for removing a copy | Meanwhile keep both (no loss) | delete the losing copy (S) | Josh's ear |
| I9 | L704 | Loudness: ear check owed + store measurements in album.json | No | Store them: `node tools/measure-loudness.mjs --apply --album <console>/<slug>`, one album per push, while the Mac is idle. The ear check is his whenever | per-album apply (S each) | Mac idle (his CPU) |
| I10 | L5814 | untitled-1 recovery "waiting on Josh's say-so" | **Stale** (and would be (a)) | The 10-02 persistence fix folded the overlay on first open. The recovery JSON stays in ~/.night-roll-bridge/recovery (never delete) | none | none |
| I11 | L846 | SPC NON-voice fix "waiting on Josh's apply" | **Stale** | `classifyNoiseVoices` is live in tools/spc/notes.mjs and every SNES album was re-captured through it 10-13/14 | none | none |
| I12 | L682–687 | Weekend to-do: TestFlight testers, App Store privacy labels/listing, screenshots, silent-switch test | **Yes, (d)** | n/a. His App Store Connect account and his device | Build 3 upload (S) | Josh |
| I13 | L688–701 | Weekend listening checks (FFX Aeon Battle, SNES/NES/GB taps, FF4 stray hat, FFX ch30/31 mute test, chip stream A/B) | No | All are ear checks. Nothing is held on them. FFX ch30/31: keep the current no-instrument handling until a report says otherwise | none | his ear, whenever |

## Top non-blocking work by value-to-size (for overnight dispatch)
1. **Q21 fix**: narrow `rootFallback` (static stays out, Giygas' Static excepted) + re-apply EarthBound in place. S–M. It restores a ruling that was broken by today's push.
2. **Q46**: add a "triangle (NES)" voice, default unchanged. S.
3. **I3**: kit decision facts row in the track ⓘ. S.
4. **Q13**: verify/wire the Ask follow-on auto-send. S.
5. **Q40–45**: note movement per the defaults above. M. High value ("I really hate our movement"). Brave check before push.
6. **Q19**: NES triangle note-off fix + NES re-capture, one album per push. M.
7. **Q15**: "File under" chips. M.
8. **I9**: store loudness measurements, one album per push (Mac idle). S each.

Next after these: Q1 FFX v2 re-capture (M), I5 Rare fade merge + apply (M), Q20 SNES phantom removal (M–L), Q27 pedal-tone detector (M), Q30–36 coach import (M), Q37 AUv3 spike (L).

## Side finding (not a question)
Many 2026-10-05/10-07 headers still read "BUILT on a worktree branch, awaiting merge" (PS2/N64/GB/PS1/SNES capture v2, glide, console-voice fixes, AI parity batches, song notes, patches, …), and 30+ `worktree-agent-*` branches are unmerged into main. Some are clearly merged already (e.g. SNES re-capture ran at cap.v 3). Before dispatching Q1, I5 or Q20, check which branches are actually merged, because those items depend on the capture-v2 branches.
