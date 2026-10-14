# Branch audit, 2026-10-14

Read-only audit of `main` (db3d23ff) against every local and `origin` branch. Nothing was edited, committed or deleted. (The audit's `git merge-tree --write-tree` probes wrote a few unreferenced tree objects; `git gc` clears them.)

## Method

1. `git branch --merged main` (ancestry) for plain merges.
2. `git cherry main <branch>` (patch-ids) for rebased/cherry-picked merges.
3. For every branch cherry still reports as unique: searched `main`'s log for the commit subject, then `git merge-tree --write-tree main <branch>` to see that the branch no longer merges cleanly (conflicts everywhere = the work landed in `main` in resolved form).

## Counts

- 145 branch refs besides main (local + origin) = 127 distinct names (15 exist both local and on origin; tips equal).
- 99 local + 4 origin `worktree-agent-*` branches (the 4 origin ones are also local, merged).
- 112 names fully merged: 81 by ancestry, 31 patch-equivalent (cherry = 0).
- 12 names cherry calls unmerged but whose work IS in `main` under a different commit (conflict-resolved merge, so patch-ids differ). Hashes below.
- 3 names with real unmerged work: `archive-to-joshcough`, `audio-dictation`, `claude-chat`. None of them is one of the `worktree-agent-*` branches.
- 0 `worktree-agent-*` branches have unmerged work.
- 18 `open-items.md` headers say "BUILT on a worktree branch, awaiting merge". All 18 are stale: the code is in main. Two carry genuinely pending follow-ups (see below).

## Headline answers

- **capture-v2** (PS1, PS2, N64, Game Boy, SNES, NES): all merged. PS1 cd3b542c, PS2 a9140e94, N64 51127d50, GB 879bb839, SNES 1276dacf, NES 888d93e2. Re-captures applied for N64 (Rare + EAD), PS2 Dark Cloud, GB, PS1, SNES, NES. Header text is stale; nothing to merge.
- **FFX v2**: the FFX capture code is in main (inside PS2 capture v2, a9140e94). What is pending is the FFX *re-capture apply*, held for Josh's ear check (Q1, "AWAITS JOSH'S EAR: FFX pitches", `open-items.md` L40/L768/L1793). No `Re-capture ps2/final-fantasy-x` commit exists in main. Not a merge: a decision.
- **N64 Rare fade**: merged as ddae9695. The "TO DO after merge" re-captures (DK64, DKR, Banjo, GoldenEye, JFG) are all in main (`Re-capture n64/... (capture v2)` commits 59ae3f08, 3f97d94a, 09695491, 62987458, e717dd91). Header stale; nothing pending.
- **SNES phantom notes (Q20)**: no branch exists; it is an unanswered question (`open-items.md` L760, default "yes, remove"). SNES capture v2 itself is merged (1276dacf). Nothing to merge; needs Josh's ruling and then new code.

## Stale-header table (open-items.md)

| open-items.md line | Header | Branch | Landed in main | Verdict |
|---|---|---|---|---|
| 30 | Empty captures, steps 1-3 | (earlier worktree) | 3ee6f709 | stale |
| 35 | PS2 capture v2 | worktree-agent-a27267bf... | a9140e94 | stale; FFX apply still held (Q1) |
| 45 | N64 Rare: notes fade | (merged worktree) | ddae9695 | stale; Rare re-captures done |
| 238 | Console loudness, song gain (Q18) | (merged worktree) | 8259613f (+ Loudness: stored commits) | stale; one Chrono Cross song left per db3d23ff |
| 245 | N64 capture v2 | (merged worktree) | 51127d50 | stale |
| 255 | Game Boy capture v2 | (merged worktree) | 879bb839 | stale |
| 264 | PS1 capture v2 | worktree-agent-acae8848... | cd3b542c | stale |
| 272 | Glide app layer (CC84) | (merged worktree) | f7f58cba | stale |
| 291 | SNES capture v2 | (merged worktree) | 1276dacf | stale; Q20 phantom notes separate, open |
| 310 | song notes v1 | worktree-agent-ae4258f4... | 2150a671 | stale |
| 321 | song note kinds | (merged worktree) | 8ae806a9 | stale |
| 352 | patches v1 | (merged worktree) | 688b0364 | stale |
| 357 | MIDI playback v2 | worktree-agent-abdb874c... | 100dab3f | stale |
| 362 | in-note volume shape v1 | (merged worktree) | fe40d614 | stale |
| 380 | AI parity batch 8 | (merged worktree) | 872b3810 | stale |
| 417 | AI parity batch 7 | (merged worktree) | ed8e1900 | stale |
| 447 | AI parity batches 4-5 | (merged worktree) | 592fd2ea, 6d721f86 | stale |
| 481 | AI parity batch 1 (act) | worktree-agent-ae7c4048... | a48e46ca | stale |

Also: the `Console voice` branch (worktree-agent-a2608a1b..., SNES stereo + echo, N64 channel bends) landed as 448cbf8e, and a later commit 301d05d4 limits SNES stereo to web (iPad stays mono). The header near L277 mentions it.

## Branches that are NOT in main

| Branch | Where | Tip date | Unique commits | What they do | Verdict |
|---|---|---|---|---|---|
| claude-chat | local + origin | 2026-08-01 | 1 | In-app Claude chat, tutor sheet (index.html +213). Parked per memory (funding decision). Predates the module split, so it would need a rewrite onto src/. | keep; do not delete |
| audio-dictation | local + origin | 2026-09-27 | 1 | "an engine interrupted even once is replaced at the next Play tap" (index.html, 9+/3-). Same family as the audio passes main later reverted (5fc6e795, ac22dd12, cf8e30a1...); known-good engine is f733b42 + 8e1c72d. index.html monolith no longer holds this code. | needs Josh's decision; recommend delete (superseded) |
| archive-to-joshcough | local + origin | 2026-09-30 | 1 | Prepares the game-file archive's move back to joshcough (8 files, tools/instruments/*, 294+/43-). 4 merge conflicts with main. A worktree (agent-a19888223be551020) still has it checked out. | needs merge/rebase review, or confirm the move happened another way |

## Full table (all 127 names)

Status key: NOT IN MAIN / IN MAIN (rebased copy) / merged (patch-equivalent) / merged (ancestor). "Unique" = commits in `main..branch`; "cherry+" = commits not patch-equivalent in main.

| Status | Branch | Where | Tip date | Unique | cherry+ | Worktree dir | main commit / header | Tip subject |
|---|---|---|---|---|---|---|---|---|
| NOT IN MAIN | claude-chat | local+origin | 2026-08-01 | 1 | 1 |  |  | In-app Claude chat (parked): tutor sheet with context injection |
| NOT IN MAIN | audio-dictation | local+origin | 2026-09-27 | 1 | 1 |  |  | Audio: an engine interrupted even once is replaced at the next Play tap, whatever its state says |
| NOT IN MAIN | archive-to-joshcough | local+origin | 2026-09-30 | 1 | 1 | .claude/worktrees/agent-a19888223be551020 |  | Prepare the game-file archive's move back to joshcough (out of Night-Roll-App) |
| IN MAIN (rebased copy, patch-id differs) | overnight-2026-09-26 | local | 2026-09-26 | 8 | 8 |  | 54d7fbcb,6e2a500f,a36161bd,21c27398,2892e260,660b329a; merge 33b185dd | open-items: console import branches started overnight |
| IN MAIN (rebased copy, patch-id differs) | imports-batch-1 | local | 2026-09-27 | 33 | 1 | .claude/worktrees/imports-batch-1 | 08265a78 Secret of Mana; da0e8f39 Wario Land; 32 others patch-equivalent | Import Wario Land: Super Mario Land 3: 48 songs (terminal importer) |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-ab7f470f088110a71 | local | 2026-10-02 | 1 | 1 |  | 7f3fc788 + steps 1-14 | Module split step 0b: index.html's inline script becomes src/ ES modules |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-a2df98a42ea95c8c1 | local | 2026-10-04 | 3 | 2 | .claude/worktrees/agent-a2df98a42ea95c8c1 | b1e48445 + 576b9264 | Game Boy › Tetris: the real v1.1 A-Type (Korobeiniki, from DMG-TRA-1.gbs) joins the album; the mislabelled v1. |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-ae7c4048101970432 | local | 2026-10-05 | 2 | 2 | .claude/worktrees/agent-ae7c4048101970432 | a48e46ca (+ vendor/ai sync) / L481 AI parity batch 1 | act: the one Ask tool every app action lives behind (docs/ai-parity.md §5 batch 1) |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-a4e053104d1d79cb6 | local | 2026-10-06 | 1 | 1 | .claude/worktrees/agent-a4e053104d1d79cb6 | 3defd494 / (none; DPCM) | NES console voice plays DPCM: the sample channel renders from the rip's own banks (capture fidelity audit step |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-abdb874ce202d2c80 | local | 2026-10-06 | 1 | 1 | .claude/worktrees/agent-abdb874ce202d2c80 | 100dab3f / L357 MIDI playback v2 | MIDI playback v2: tr.ctl (bend, CC7/11/64/1/91, pan events, program) owned end to end and played by the synth; |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-ae4258f4d8b4987d2 | local | 2026-10-06 | 1 | 1 | .claude/worktrees/agent-ae4258f4d8b4987d2 | 2150a671 / L310 song notes v1 | Song notes v1: many titled notes per song — All notes, Analysis sheet, the note window's Song chip, Ask song_n |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-a2608a1bfc51b0785 | local | 2026-10-07 | 1 | 1 | .claude/worktrees/agent-a2608a1bfc51b0785 | 448cbf8e / L277-ish (SNES stereo + echo, N64 EAD bends; no own header) | Console voice (capture audit 2 §3.3): SNES stereo + echo, N64 EAD channel bends under held notes; SQ bend byte |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-a27267bfe6f091482 | local | 2026-10-07 | 1 | 1 | .claude/worktrees/agent-a27267bfe6f091482 | a9140e94 / L35 PS2 capture v2 | PS2 capture v2 (capture audit 2 §3.2): the wheel at the driver's own range, glide links, CC7/CC11/CC64, pan, p |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-a48e8e276c03a3ae9 | local | 2026-10-07 | 1 | 1 | .claude/worktrees/agent-a48e8e276c03a3ae9 | efcc8cc9 | Copy/paste annotations on songs whose notes are locked |
| IN MAIN (rebased copy, patch-id differs) | worktree-agent-acae8848de70257e1 | local | 2026-10-07 | 1 | 1 | .claude/worktrees/agent-acae8848de70257e1 | cd3b542c / L264 PS1 capture v2 | PS1 capture v2: glide links, slide bends, levels, programs, reverb, pan fades |
| merged (patch-equivalent) | worktree-agent-af58968239f34c3d7 | local | 2026-10-04 | 1 | 0 | .claude/worktrees/agent-af58968239f34c3d7 |  | docs/daw-inventory.md: Night Roll vs Logic Pro iPad and other DAWs — gaps, strengths, shortlist |
| merged (patch-equivalent) | worktree-agent-a1669e21237a7602c | local | 2026-10-05 | 2 | 0 | .claude/worktrees/agent-a1669e21237a7602c |  | act: the twelve standalone Ask tools folded into the action registry (docs/ai-parity.md §5 batch 3) |
| merged (patch-equivalent) | worktree-agent-a3264cd8f78d04771 | local | 2026-10-05 | 2 | 0 | .claude/worktrees/agent-a3264cd8f78d04771 |  | act: edit_notes — bulk note edits over bars + tracks (docs/ai-parity.md §5 batch 5) |
| merged (patch-equivalent) | worktree-agent-a66dede7857435c9b | local | 2026-10-05 | 2 | 0 | .claude/worktrees/agent-a66dede7857435c9b |  | drummer Ask tool: spoken drum requests run the real Drummer generator |
| merged (patch-equivalent) | worktree-agent-a76cfdb0584a3c389 | local | 2026-10-05 | 1 | 0 | .claude/worktrees/agent-a76cfdb0584a3c389 |  | Analysis sheet S1: storage for `analysis` entries + forward-compatible reader (plan §3a, review fixes 1–3, 10– |
| merged (patch-equivalent) | worktree-agent-a991565da0af96933 | local | 2026-10-05 | 3 | 0 | .claude/worktrees/agent-a991565da0af96933 |  | Drummer B6: the groove loops two bars and varies the fourth (A B A C) |
| merged (patch-equivalent) | worktree-agent-aaf9daad035187a9b | local | 2026-10-05 | 1 | 0 | .claude/worktrees/agent-aaf9daad035187a9b |  | Analysis sheet S2: the per-song window + Check coverage (plan §2/§4/S2, review 6a/6b/9/12/16/18; guide moves i |
| merged (patch-equivalent) | worktree-agent-ab69c000d4d48d346 | local | 2026-10-05 | 1 | 0 | .claude/worktrees/agent-ab69c000d4d48d346 |  | act: edit_notes — transpose, move, copy, to_track over bars + tracks (docs/ai-parity.md §5 batch 6) |
| merged (patch-equivalent) | worktree-agent-ac229a3ffb67e8493 | local | 2026-10-05 | 2 | 0 | .claude/worktrees/agent-ac229a3ffb67e8493 |  | act: song_file, set_pref (docs/ai-parity.md §5 batch 8) |
| merged (patch-equivalent) | worktree-agent-a9be8141cb01769a0 | local | 2026-10-06 | 1 | 0 | .claude/worktrees/agent-a9be8141cb01769a0 |  | Volume shape inside a note v1: n.env as poly aftertouch inside the note, synth ramps, NES capture, Shape prese |
| merged (patch-equivalent) | worktree-agent-acd8a461b0361c5eb | local | 2026-10-06 | 1 | 0 | .claude/worktrees/agent-acd8a461b0361c5eb |  | Patches v1: a track's own instrument — synth wave + ADSR + delayed vibrato, saved in the song; voice menu Patc |
| merged (patch-equivalent) | worktree-agent-a11844b110538a7d3 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-a11844b110538a7d3 |  | Cursor position readout, option B (Q17, Terminal #179): the LCD beat cell counts "2", "2e", "2&", "2a" |
| merged (patch-equivalent) | worktree-agent-a263ec914f6a96ae8 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-a263ec914f6a96ae8 |  | NES capture v2: vibrato as pitch bend, duty changes inside a note as CC70, DPCM hits on a last dpcm kit track  |
| merged (patch-equivalent) | worktree-agent-a2c7ff60258aebd62 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-a2c7ff60258aebd62 |  | Console loudness: one measured gain per song replaces the fixed 0.22 master (Q18, Terminal #183/#186/#187) |
| merged (patch-equivalent) | worktree-agent-a4091a95a680e3901 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-a4091a95a680e3901 |  | SNES capture v2: DSP envelope x VOL as note shapes, L/R as CC10, SRCN as program, pitch wobble as bend, EON x  |
| merged (patch-equivalent) | worktree-agent-a50961151e47e2f01 | local | 2026-10-07 | 2 | 0 | .claude/worktrees/agent-a50961151e47e2f01 |  | DK64 Logo real-rip test: each hit ends where its sample does at its own pitch |
| merged (patch-equivalent) | worktree-agent-a75c2bfb3a9300494 | local | 2026-10-07 | 3 | 0 | .claude/worktrees/agent-a75c2bfb3a9300494 |  | capture-diff: tempo/meter compared as the player reads them (a restated 4/4 or repeated tempo moves nothing);  |
| merged (patch-equivalent) | worktree-agent-aa924b3af0596b794 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-aa924b3af0596b794 |  | Empty captures: N64 ldseq/runseq/testchan/rand, io ports from the save state, SPC root fallback, no silent MID |
| merged (patch-equivalent) | worktree-agent-aadc45b8756ce3b21 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-aadc45b8756ce3b21 |  | Song note kinds: General / ? Open question inside the songnote (kind field, absent = general); ? badge, ? Open |
| merged (patch-equivalent) | worktree-agent-ab0deeac11291d3d6 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-ab0deeac11291d3d6 |  | Game Boy capture v2: envelopes, pan, wave programs, sweep and slide bends, glide links, duty |
| merged (patch-equivalent) | worktree-agent-ae04a05a2d586a32c | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-ae04a05a2d586a32c |  | N64 capture v2: CC7 level, bank envelopes as shapes, bends, glide links, programs, CC91, pan under held notes |
| merged (patch-equivalent) | worktree-agent-afa5ab3b436b6d198 | local | 2026-10-07 | 1 | 0 | .claude/worktrees/agent-afa5ab3b436b6d198 |  | Glide app layer (CC84): a continued note plays on from the one before it |
| merged (patch-equivalent) | dk64-song-pick | local | 2026-10-08 | 1 | 0 | /Users/joshuacough/.claude/jobs/c9506483/tmp/dk64wt |  | N64 Rare: SDK sequence players pick the song and mute channels (DK64 audit) |
| merged (patch-equivalent) | picker-primitives | local | 2026-10-08 | 1 | 0 | /Users/joshuacough/.claude/jobs/c9506483/tmp/pickwt |  | Chord and Roman pickers as primitives (Terminal #287/#288) |
| merged (patch-equivalent) | test-truncation | local | 2026-10-08 | 1 | 0 | /Users/joshuacough/.claude/jobs/c9506483/tmp/truncwt |  | npm test: drop --test-force-exit for night-roll; fail when reported tests < registered |
| merged (patch-equivalent) | worktree-agent-a6d3125c0ee31265d | local | 2026-10-08 | 3 | 0 | .claude/worktrees/agent-a6d3125c0ee31265d |  | "Jump into text boxes": no text box gets focus by itself on touch (Josh, Terminal #251/#253) |
| merged (patch-equivalent) | worktree-agent-a32b030d68755d347 | local | 2026-10-09 | 1 | 0 | .claude/worktrees/agent-a32b030d68755d347 |  | Kit tracks keep channel 10 through every app write: a "kit:1" track marker, not the name (percussion plan fix  |
| merged (patch-equivalent) | worktree-agent-ac7ccd1e64aaf20bc | local | 2026-10-09 | 1 | 0 | .claude/worktrees/agent-ac7ccd1e64aaf20bc |  | Percussion census (plan §6.3): tools/percussion-census.mjs + results for FF7/8/9, Chrono Cross, Dark Cloud |
| merged (patch-equivalent) | worktree-agent-ae76c0cc5d799ee73 | local | 2026-10-09 | 1 | 0 | .claude/worktrees/agent-ae76c0cc5d799ee73 |  | PS1 percussion §13: a drum table used as a melodic bank leaves the kit (n.table, bank rule) |
| merged (patch-equivalent) | worktree-agent-a50c893c1f57940e2 | local | 2026-10-10 | 1 | 0 | .claude/worktrees/agent-a50c893c1f57940e2 |  | Notes keep their spot when dragged, unless a grid line is nearer (movement plan step 1, Josh #360) |
| merged (patch-equivalent) | worktree-agent-a6e801ac157e7bfa1 | local | 2026-10-10 | 1 | 0 | .claude/worktrees/agent-a6e801ac157e7bfa1 |  | A lasso-move carries the bands the lasso took (Josh via Ask, 2026-10-09) |
| merged (ancestor) | midi-input | local+origin (tips differ: local=b05d30c4,origin=0165a0b4) | 2026-08-18 | 0 | 0 |  |  | Web MIDI input: the Jamstik plays straight into ● Record |
| merged (ancestor) | drummer | local+origin | 2026-08-22 | 0 | 0 |  |  | Fix rebase stitch: divsheet closers (drummersheet was nested inside) |
| merged (ancestor) | audio-tracks | local+origin | 2026-09-17 | 0 | 0 |  |  | Audio tracks: ♩ Tempo from this take (level 1 — one steady tempo) |
| merged (ancestor) | time-stretch | local | 2026-09-17 | 0 | 0 |  |  | Audio tracks: slow down without changing pitch (WSOLA in a worker) |
| merged (ancestor) | preview/main | local | 2026-09-17 | 0 | 0 |  |  | Audio tracks: ♩♩ Map the bars to this take (beat mapping, tempo level 2) |
| merged (ancestor) | gbs-import | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a1e2dada80b942084 |  | GBS: INTEGRATION.md — how the Game Boy pipeline slots into Import and chip audio |
| merged (ancestor) | n64-import | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a36d4b9cee5dcfbf2 |  | N64: INTEGRATION.md — ROM sniff, manifest, tables, banks, playback, estimate |
| merged (ancestor) | psx-akao-ff7 | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a2505b6f419a38fad |  | PS1: read Final Fantasy VII's AKAO sequences straight from the PSF RAM image |
| merged (ancestor) | psx-import | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a35f2e07638506818 |  | PSX import: INTEGRATION.md — Import sniff, session shape, WebAudio sample player, PSF plan; psf.mjs inflates l |
| merged (ancestor) | spc-import | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-afb04531752093bf7 |  | SPC import: INTEGRATION.md — how SPC slots into Import and chip audio |
| merged (ancestor) | vgm-import | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a7dcb98e899f44fae |  | VGM import: integration plan (Import flow, PSG + YM2612 renderers) |
| merged (ancestor) | worktree-agent-a08d6775b74a6211e | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a08d6775b74a6211e |  | VGM: pin the real Sonic 1/2 pack shapes as text fixtures; document the survey |
| merged (ancestor) | worktree-agent-a1701ba9dfec9596e | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a1701ba9dfec9596e |  | SNES: an S-DSP renderer — the chip's own voice pipeline, per voice, measured |
| merged (ancestor) | worktree-agent-a1e2dada80b942084 | local | 2026-09-26 | 0 | 0 |  |  | open-items: auto-save switch ruling (off by default; Save is the checkpoint) |
| merged (ancestor) | worktree-agent-a35f2e07638506818 | local | 2026-09-26 | 0 | 0 |  |  | open-items: auto-save switch ruling (off by default; Save is the checkpoint) |
| merged (ancestor) | worktree-agent-a36d4b9cee5dcfbf2 | local | 2026-09-26 | 0 | 0 |  |  | open-items: auto-save switch ruling (off by default; Save is the checkpoint) |
| merged (ancestor) | worktree-agent-a42adbad659dbc46d | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a42adbad659dbc46d |  | SPC import: the real FF4/FF5/FF6/Chrono Trigger/ALttP rips — long-loop roots, the dumped KON, xid6 tags |
| merged (ancestor) | worktree-agent-a7dcb98e899f44fae | local | 2026-09-26 | 0 | 0 |  |  | open-items: auto-save switch ruling (off by default; Save is the checkpoint) |
| merged (ancestor) | worktree-agent-a939cdbdfa166e335 | local+origin | 2026-09-26 | 0 | 0 | .claude/worktrees/agent-a939cdbdfa166e335 |  | N64: sequences come out of USF rips — SM64/OoT/MM catalogues parse; three interpreter bugs |
| merged (ancestor) | worktree-agent-af49dbf3f7510508a | local | 2026-09-26 | 0 | 0 |  |  | Bridge: launchd install script — runs at login, restarts on crash |
| merged (ancestor) | worktree-agent-afb04531752093bf7 | local | 2026-09-26 | 0 | 0 |  |  | open-items: auto-save switch ruling (off by default; Save is the checkpoint) |
| merged (ancestor) | promo-video-script | local+origin | 2026-09-27 | 0 | 0 | .claude/worktrees/agent-af49dbf3f7510508a |  | docs: promo video script (90–120 s) for the App Store launch |
| merged (ancestor) | worktree-agent-a19888223be551020 | local | 2026-09-29 | 0 | 0 |  |  | The Apple Pencil places, grabs and moves notes the moment it touches; fingers still hold to grab |
| merged (ancestor) | offline-export | local | 2026-09-30 | 0 | 0 | .claude/worktrees/agent-aa23c3525fbf8537d |  | Offline export: restore the live audio globals before awaiting the render |
| merged (ancestor) | shared-midi-writer | local | 2026-09-30 | 0 | 0 | .claude/worktrees/agent-a6b3f998c9277390e |  | One SMF writer: writeMidi ports tools/nsf/midi-write.mjs's writer byte-for-byte |
| merged (ancestor) | worktree-agent-af993baf83b7fff5b | local | 2026-10-02 | 0 | 0 | .claude/worktrees/agent-af993baf83b7fff5b |  | Material icons across the app (icon audit's 41 switches) |
| merged (ancestor) | worktree-agent-a2424d6f3f6ac67e6 | local | 2026-10-03 | 0 | 0 | .claude/worktrees/agent-a2424d6f3f6ac67e6 |  | Module split step 9: src/model/{song,selection,provenance,album-order,versions,jobs}.js, src/import/{hub,captu |
| merged (ancestor) | worktree-agent-a2852b81b994e0764 | local | 2026-10-03 | 0 | 0 |  |  | open-items: record module split step 1 (doc sweep) |
| merged (ancestor) | worktree-agent-a3605067fd60df760 | local | 2026-10-03 | 0 | 0 | .claude/worktrees/agent-a3605067fd60df760 |  | Module split step 8: src/audio/{chip,chip-stream,clips,metronome,bounce}.js |
| merged (ancestor) | worktree-agent-a5482c38adf012459 | local | 2026-10-03 | 0 | 0 | .claude/worktrees/agent-a5482c38adf012459 |  | Module split step 10: src/gen/{drummer,bassist,analysis}.js |
| merged (ancestor) | worktree-agent-a59b2f7eab7a92abc | local | 2026-10-03 | 0 | 0 | .claude/worktrees/agent-a59b2f7eab7a92abc |  | Merge main into module split step 7 |
| merged (ancestor) | worktree-agent-a68a9c5079e809ef7 | local | 2026-10-03 | 0 | 0 |  |  | Module split step 6: src/platform/{base,mode,storage,folder,native}.js |
| merged (ancestor) | worktree-agent-a83c6eacb5addd9bc | local | 2026-10-03 | 0 | 0 |  |  | Module split step 2: ui/icons.js + ui/controls.js, one control registry |
| merged (ancestor) | worktree-agent-a9454f25a407fa673 | local | 2026-10-03 | 0 | 0 |  |  | open-items: record module split step 3 (doc sweep) |
| merged (ancestor) | worktree-agent-aa8a747f8ab572357 | local | 2026-10-03 | 0 | 0 | .claude/worktrees/agent-aa8a747f8ab572357 |  | AI integration tests: fake bridge/Ollama/LM Studio servers, real request + reply assertions |
| merged (ancestor) | worktree-agent-ab420f8b09566d0df | local | 2026-10-03 | 0 | 0 |  |  | open-items: record module split step 4 (doc sweep) |
| merged (ancestor) | worktree-agent-ac8e1f7e8f3af24ef | local | 2026-10-03 | 0 | 0 |  |  | Module split step 5: src/model/{catalog,grid,edits,rollnotes}.js |
| merged (ancestor) | worktree-agent-ae6a59166855402f4 | local | 2026-10-03 | 0 | 0 |  |  | Add a playhead strip under the ruler: tap moves the cursor, drag scrubs, never touches rangeSel |
| merged (ancestor) | worktree-agent-ae9f72653386c8d8f | local | 2026-10-03 | 0 | 0 |  |  | open-items: record the e2e devtools-mirror fix (doc sweep) |
| merged (ancestor) | annotate-learning | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a0f29d3aacebd30cb |  | Annotate: AI-tagged annotations are hidden in Learning mode (never deleted) |
| merged (ancestor) | finish | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-ae884e74d443794bc |  | Split phase 2 step 13: docs — the Module map's finished state, the step 11/12/13 write-ups, the morning checkl |
| merged (ancestor) | module-split | local+origin | 2026-10-04 | 0 | 0 | .claude/worktrees/module-split |  | modules.test: skip the real-commit verbatim check in a shallow checkout (CI fetches only the tip) |
| merged (ancestor) | theory-review | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-aea4681db0912a4f4 |  | Theory toolkit review: docs, log, glossary, open-items |
| merged (ancestor) | work | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a879cb76d8599cfe0 |  | Split phase 2 step 10: docs |
| merged (ancestor) | worktree-agent-a0309ea8bf4c644d1 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a0309ea8bf4c644d1 |  | On-screen keyboard: real-piano look, Play/Scroll + two-finger scroll, octave ‹ › with range, lock, Sustain |
| merged (ancestor) | worktree-agent-a08aff8e79f2f8ccf | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a08aff8e79f2f8ccf |  | open-items: record module split step 14 (doc sweep) |
| merged (ancestor) | worktree-agent-a0d1d7e8397227a35 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a0d1d7e8397227a35 |  | docs/plans: Fable review — amended plans + execution order |
| merged (ancestor) | worktree-agent-a0d3e392d9a79e3cb | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a0d3e392d9a79e3cb |  | docs/investigations: GB Tetris — Korobeiniki is in DMG-TRA-1.gbs (v1.1), which the rip import never captured |
| merged (ancestor) | worktree-agent-a0f29d3aacebd30cb | local | 2026-10-04 | 0 | 0 |  |  | DAW F2: touch-and-hold a grabbed note still ~600 ms more → note menu at the finger (cut/copy/paste/duplicate/d |
| merged (ancestor) | worktree-agent-a12033beb48019bc0 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a12033beb48019bc0 |  | Playhead: a tag inside the strip replaces the triangle; drag it to scrub, even while playing |
| merged (ancestor) | worktree-agent-a1bceef2f3d78280d | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a1bceef2f3d78280d |  | Theory facts: docs — docs/theory-toolkit.md (what each function returns and exactly where it would be integrat |
| merged (ancestor) | worktree-agent-a20925efe82cb8d31 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a20925efe82cb8d31 |  | AI library step 2: bridge server lives in claude-bridge v0.2.0; tools/claude-bridge.mjs is a shim with Night R |
| merged (ancestor) | worktree-agent-a2a1738849cd1e788 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a2a1738849cd1e788 |  | CSS moves out of index.html into css/app.css (split step 16) |
| merged (ancestor) | worktree-agent-a36cb2057be1c8d37 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a36cb2057be1c8d37 |  | Split phase 2 step 0: move.mjs/check.mjs/verbatim.mjs fixes, rules 9-10, blockers.mjs |
| merged (ancestor) | worktree-agent-a4b563d26ecc5bee3 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a4b563d26ecc5bee3 |  | Module split step 12: src/input/{gestures,record}.js |
| merged (ancestor) | worktree-agent-a549f69220be81780 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a549f69220be81780 |  | AI box: 📋 Paste puts the clipboard (e.g. a Superwhisper transcript) in the message box without bringing up the |
| merged (ancestor) | worktree-agent-a63ed4df94684cd2b | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a63ed4df94684cd2b |  | Module split step 13: src/ask/{backend,tools,context,bridge,shots,sheet}.js |
| merged (ancestor) | worktree-agent-a76ef57581957a598 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a76ef57581957a598 |  | Publish window: songs-only count, Chats section, dockable (Terminal #111) |
| merged (ancestor) | worktree-agent-a879cb76d8599cfe0 | local | 2026-10-04 | 0 | 0 |  |  | open-items: GB Tetris Korobeiniki investigation queued |
| merged (ancestor) | worktree-agent-a8a6382ba90cd4430 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a8a6382ba90cd4430 |  | AI library step 1: vendor/ai (claude-bridge v0.1.0) synced by tools/ai-sync.mjs; aiSSE imported from it |
| merged (ancestor) | worktree-agent-a97c13b771ba7ebff | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a97c13b771ba7ebff |  | DAW F4: Velocity lane — a strip under the roll; drag a stalk to set a note's velocity, a lasso'd drag scales t |
| merged (ancestor) | worktree-agent-a992c6fa129e77ecd | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-a992c6fa129e77ecd |  | Split phase 2 step 6: docs |
| merged (ancestor) | worktree-agent-aa00535e1a6d8d404 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-aa00535e1a6d8d404 |  | Publish: one song, one motion — dialog + floating window close on success, Retry on failure (Terminal #112) |
| merged (ancestor) | worktree-agent-aa5b9d397172d9afc | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-aa5b9d397172d9afc |  | DAW F6: Export score — printable pages via the share sheet |
| merged (ancestor) | worktree-agent-ab3ed8771bf71f67e | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-ab3ed8771bf71f67e |  | Help text moves out of index.html into help/help.html (fetched on first open) |
| merged (ancestor) | worktree-agent-abaa58acc981cbb11 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-abaa58acc981cbb11 |  | Split phase 2 step 4b: docs |
| merged (ancestor) | worktree-agent-ac21fa04cdb7fc8ff | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-ac21fa04cdb7fc8ff |  | Split phase 2 step 4: transport, voices, clips and chip render move into audio/ |
| merged (ancestor) | worktree-agent-ac7388f4dadc3af51 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-ac7388f4dadc3af51 |  | docs: U4 — docs/quiz.md (what, how to open, where it would plug in), NIGHT-ROLL "Quiz page", README, open-item |
| merged (ancestor) | worktree-agent-ac73b668ccd926f5c | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-ac73b668ccd926f5c |  | DAW F2: touch-and-hold a grabbed note still ~600 ms more → note menu at the finger (cut/copy/paste/duplicate/d |
| merged (ancestor) | worktree-agent-acd929fec9bc01638 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-acd929fec9bc01638 |  | Annotate this song: View ▾ → Mode → ✦ Annotate this song… — AI estimates (sections/chords/key) as tagged annot |
| merged (ancestor) | worktree-agent-adb89985f77bd4a28 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-adb89985f77bd4a28 |  | Split phase 2 step 8: docs |
| merged (ancestor) | worktree-agent-adcc69226ff13f458 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-adcc69226ff13f458 |  | Module split step 11: src/render/{roll,tracks,score,instrument,cof,compare}.js |
| merged (ancestor) | worktree-agent-adf893af37ddee64d | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-adf893af37ddee64d |  | Theory harmony: docs — docs/theory-harmony.md (each function, EXACTLY where it would be integrated, the Normal |
| merged (ancestor) | worktree-agent-ae884e74d443794bc | local | 2026-10-04 | 0 | 0 |  |  | open-items: keyboard key stretch on wide windows |
| merged (ancestor) | worktree-agent-aea4681db0912a4f4 | local | 2026-10-04 | 0 | 0 |  |  | Merge branch 'worktree-agent-a0d1d7e8397227a35' |
| merged (ancestor) | worktree-agent-af0614c2688554b3b | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-af0614c2688554b3b |  | Repo tidy U3: README rewritten — what Night Roll is today, run it, repo map, tests |
| merged (ancestor) | worktree-agent-af4c28e085e98ffb2 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-af4c28e085e98ffb2 |  | Split phase 2 step 2: audio engine + chip render + idbDraftPut + jobsNotify move down |
| merged (ancestor) | worktree-agent-afc27315658904c33 | local | 2026-10-04 | 0 | 0 | .claude/worktrees/agent-afc27315658904c33 |  | AI library step 6: the window in adopt mode via the host adapter (claude-bridge v0.6.0); step 7 written up, no |
| merged (ancestor) | worktree-agent-aa61625a3faeaeffa | local | 2026-10-06 | 0 | 0 | .claude/worktrees/agent-aa61625a3faeaeffa |  | Ask: add_annotation's spec stops nudging Publish too — the #492 test was red on 605893d |
| merged (ancestor) | merge-batch | local | 2026-10-08 | 0 | 0 | /Users/joshuacough/.claude/jobs/c9506483/tmp/mergewt |  | Roman numeral picker folds under '▸ Roman numeral' and has a lower-case (minor) row (Josh, Terminal #268; advi |
| merged (ancestor) | worktree-agent-a615a8538612c0063 | local | 2026-10-08 | 0 | 0 | .claude/worktrees/agent-a615a8538612c0063 |  | Chord annotations get a Roman numeral and a 'no 5' mark (Josh, Terminal #228/#230) |

Notes on rebased-copy rows: `imports-batch-1` has 33 unique commits, but 32 are patch-equivalent; the 33rd (Secret of Mana, ad0c318b) is 08265a78 in main. `overnight-2026-09-26` was merged via 33b185dd and cherry-picks (ROADMAP 54d7fbcb, Product build 6e2a500f, Local Save a36161bd, launchd 21c27398, Publish-all 2892e260, Bach starter 660b329a; the two open-items-only commits are doc edits). `worktree-agent-ab7f470f` (module split step 0b) is superseded by 7f3fc788 and steps 1-14; do not merge it.

## .claude/worktrees (and others)


| Directory | Branch | HEAD | Dirty | Note |
|---|---|---|---|---|
| ~/.claude/jobs/c9506483/tmp/dk64wt | dk64-song-pick | 8d546d30 | clean |  |
| ~/.claude/jobs/c9506483/tmp/mergewt | merge-batch | de806413 | 1 untracked: node_modules |  |
| ~/.claude/jobs/c9506483/tmp/pickwt | picker-primitives | f4c83c94 | clean |  |
| ~/.claude/jobs/c9506483/tmp/truncwt | test-truncation | e142c00f | clean |  |
| .claude/worktrees/agent-a0309ea8bf4c644d1 | worktree-agent-a0309ea8bf4c644d1 | 32113faf | clean |  |
| .claude/worktrees/agent-a08aff8e79f2f8ccf | worktree-agent-a08aff8e79f2f8ccf | 24b8425e | clean |  |
| .claude/worktrees/agent-a08d6775b74a6211e | worktree-agent-a08d6775b74a6211e | 060913ad | clean |  |
| .claude/worktrees/agent-a0d1d7e8397227a35 | worktree-agent-a0d1d7e8397227a35 | 40d25221 | clean |  |
| .claude/worktrees/agent-a0d3e392d9a79e3cb | worktree-agent-a0d3e392d9a79e3cb | 54c65cc4 | 1 untracked: tmp/ |  |
| .claude/worktrees/agent-a0f29d3aacebd30cb | annotate-learning | 23f71810 | clean |  |
| .claude/worktrees/agent-a11844b110538a7d3 | worktree-agent-a11844b110538a7d3 | 2d953122 | clean |  |
| .claude/worktrees/agent-a12033beb48019bc0 | worktree-agent-a12033beb48019bc0 | 0f8deebd | clean |  |
| .claude/worktrees/agent-a1669e21237a7602c | worktree-agent-a1669e21237a7602c | 9477341f | clean |  |
| .claude/worktrees/agent-a1701ba9dfec9596e | worktree-agent-a1701ba9dfec9596e | 3339cce4 | clean |  |
| .claude/worktrees/agent-a19888223be551020 | archive-to-joshcough | e23a2bf4 | clean |  |
| .claude/worktrees/agent-a1bceef2f3d78280d | worktree-agent-a1bceef2f3d78280d | d67f38a1 | clean |  |
| .claude/worktrees/agent-a1e2dada80b942084 | gbs-import | f4217b92 | clean |  |
| .claude/worktrees/agent-a20925efe82cb8d31 | worktree-agent-a20925efe82cb8d31 | a057552e | clean |  |
| .claude/worktrees/agent-a2424d6f3f6ac67e6 | worktree-agent-a2424d6f3f6ac67e6 | 7594eab9 | clean |  |
| .claude/worktrees/agent-a2505b6f419a38fad | psx-akao-ff7 | ad520c7e | clean |  |
| .claude/worktrees/agent-a2608a1bfc51b0785 | worktree-agent-a2608a1bfc51b0785 | 9bee593e | clean |  |
| .claude/worktrees/agent-a263ec914f6a96ae8 | worktree-agent-a263ec914f6a96ae8 | 986e9e38 | clean |  |
| .claude/worktrees/agent-a27267bfe6f091482 | worktree-agent-a27267bfe6f091482 | 1eb96b22 | clean |  |
| .claude/worktrees/agent-a2a1738849cd1e788 | worktree-agent-a2a1738849cd1e788 | 666424dc | clean |  |
| .claude/worktrees/agent-a2c7ff60258aebd62 | worktree-agent-a2c7ff60258aebd62 | 435ba663 | clean |  |
| .claude/worktrees/agent-a2df98a42ea95c8c1 | worktree-agent-a2df98a42ea95c8c1 | 0c7d7618 | clean |  |
| .claude/worktrees/agent-a3264cd8f78d04771 | worktree-agent-a3264cd8f78d04771 | 7cb0440e | clean |  |
| .claude/worktrees/agent-a32b030d68755d347 | worktree-agent-a32b030d68755d347 | cc3432d5 | clean | LOCKED by live claude pid 1397; leave |
| .claude/worktrees/agent-a35f2e07638506818 | psx-import | c981ba08 | clean |  |
| .claude/worktrees/agent-a3605067fd60df760 | worktree-agent-a3605067fd60df760 | 82095916 | clean |  |
| .claude/worktrees/agent-a36cb2057be1c8d37 | worktree-agent-a36cb2057be1c8d37 | c14d495f | clean |  |
| .claude/worktrees/agent-a36d4b9cee5dcfbf2 | n64-import | 7c76c502 | clean |  |
| .claude/worktrees/agent-a4091a95a680e3901 | worktree-agent-a4091a95a680e3901 | 4fbd7ce4 | clean |  |
| .claude/worktrees/agent-a42adbad659dbc46d | worktree-agent-a42adbad659dbc46d | 86ff68a4 | clean |  |
| .claude/worktrees/agent-a48e8e276c03a3ae9 | worktree-agent-a48e8e276c03a3ae9 | 48f1de7f | clean |  |
| .claude/worktrees/agent-a4b563d26ecc5bee3 | worktree-agent-a4b563d26ecc5bee3 | b92ec10d | clean |  |
| .claude/worktrees/agent-a4e053104d1d79cb6 | worktree-agent-a4e053104d1d79cb6 | 1ec15aaf | clean |  |
| .claude/worktrees/agent-a50961151e47e2f01 | worktree-agent-a50961151e47e2f01 | 396a3312 | clean |  |
| .claude/worktrees/agent-a50c893c1f57940e2 | worktree-agent-a50c893c1f57940e2 | 8677f5c0 | clean |  |
| .claude/worktrees/agent-a5482c38adf012459 | worktree-agent-a5482c38adf012459 | f55b3ebb | clean |  |
| .claude/worktrees/agent-a549f69220be81780 | worktree-agent-a549f69220be81780 | e9833afd | clean |  |
| .claude/worktrees/agent-a59b2f7eab7a92abc | worktree-agent-a59b2f7eab7a92abc | ba19c738 | clean |  |
| .claude/worktrees/agent-a615a8538612c0063 | worktree-agent-a615a8538612c0063 | bcbaab04 | clean |  |
| .claude/worktrees/agent-a63ed4df94684cd2b | worktree-agent-a63ed4df94684cd2b | 868beff8 | clean |  |
| .claude/worktrees/agent-a66dede7857435c9b | worktree-agent-a66dede7857435c9b | d14385c6 | clean |  |
| .claude/worktrees/agent-a6b3f998c9277390e | shared-midi-writer | 255b1f4a | clean |  |
| .claude/worktrees/agent-a6d3125c0ee31265d | worktree-agent-a6d3125c0ee31265d | de7fdd07 | clean |  |
| .claude/worktrees/agent-a6e801ac157e7bfa1 | worktree-agent-a6e801ac157e7bfa1 | a73005ce | clean |  |
| .claude/worktrees/agent-a75c2bfb3a9300494 | worktree-agent-a75c2bfb3a9300494 | 13932083 | clean |  |
| .claude/worktrees/agent-a76cfdb0584a3c389 | worktree-agent-a76cfdb0584a3c389 | b265320f | clean |  |
| .claude/worktrees/agent-a76ef57581957a598 | worktree-agent-a76ef57581957a598 | 71907060 | clean |  |
| .claude/worktrees/agent-a7dcb98e899f44fae | vgm-import | 8c1c9aed | clean |  |
| .claude/worktrees/agent-a879cb76d8599cfe0 | work | c3ec68ce | clean |  |
| .claude/worktrees/agent-a8a6382ba90cd4430 | worktree-agent-a8a6382ba90cd4430 | c97499c8 | clean |  |
| .claude/worktrees/agent-a939cdbdfa166e335 | worktree-agent-a939cdbdfa166e335 | 700f1dbf | clean |  |
| .claude/worktrees/agent-a97c13b771ba7ebff | worktree-agent-a97c13b771ba7ebff | aed4e05e | clean |  |
| .claude/worktrees/agent-a991565da0af96933 | worktree-agent-a991565da0af96933 | 44635893 | clean |  |
| .claude/worktrees/agent-a992c6fa129e77ecd | worktree-agent-a992c6fa129e77ecd | 1d20b514 | clean |  |
| .claude/worktrees/agent-a9be8141cb01769a0 | worktree-agent-a9be8141cb01769a0 | 18407fee | clean |  |
| .claude/worktrees/agent-aa00535e1a6d8d404 | worktree-agent-aa00535e1a6d8d404 | f8305764 | clean |  |
| .claude/worktrees/agent-aa23c3525fbf8537d | offline-export | ba5d0e0f | clean |  |
| .claude/worktrees/agent-aa5b9d397172d9afc | worktree-agent-aa5b9d397172d9afc | d72c83a4 | clean |  |
| .claude/worktrees/agent-aa61625a3faeaeffa | worktree-agent-aa61625a3faeaeffa | c9573311 | clean |  |
| .claude/worktrees/agent-aa8a747f8ab572357 | worktree-agent-aa8a747f8ab572357 | 61db6117 | clean |  |
| .claude/worktrees/agent-aa924b3af0596b794 | worktree-agent-aa924b3af0596b794 | 55e7402a | clean |  |
| .claude/worktrees/agent-aadc45b8756ce3b21 | worktree-agent-aadc45b8756ce3b21 | 9861d0a3 | clean |  |
| .claude/worktrees/agent-aaf9daad035187a9b | worktree-agent-aaf9daad035187a9b | 70d34746 | clean |  |
| .claude/worktrees/agent-ab0deeac11291d3d6 | worktree-agent-ab0deeac11291d3d6 | 40cb2ed3 | clean |  |
| .claude/worktrees/agent-ab3ed8771bf71f67e | worktree-agent-ab3ed8771bf71f67e | 9c6eadf4 | clean |  |
| .claude/worktrees/agent-ab69c000d4d48d346 | worktree-agent-ab69c000d4d48d346 | 6055521e | clean |  |
| .claude/worktrees/agent-abaa58acc981cbb11 | worktree-agent-abaa58acc981cbb11 | e7de00ab | clean |  |
| .claude/worktrees/agent-abdb874ce202d2c80 | worktree-agent-abdb874ce202d2c80 | 7fab52bf | clean |  |
| .claude/worktrees/agent-ac21fa04cdb7fc8ff | worktree-agent-ac21fa04cdb7fc8ff | ca0817a8 | clean |  |
| .claude/worktrees/agent-ac229a3ffb67e8493 | worktree-agent-ac229a3ffb67e8493 | 0af0b74d | clean |  |
| .claude/worktrees/agent-ac7388f4dadc3af51 | worktree-agent-ac7388f4dadc3af51 | fbaa6f1e | clean |  |
| .claude/worktrees/agent-ac73b668ccd926f5c | worktree-agent-ac73b668ccd926f5c | 364a23c3 | clean |  |
| .claude/worktrees/agent-ac7ccd1e64aaf20bc | worktree-agent-ac7ccd1e64aaf20bc | 215a955e | clean |  |
| .claude/worktrees/agent-acae8848de70257e1 | worktree-agent-acae8848de70257e1 | 1aac7cc4 | clean |  |
| .claude/worktrees/agent-acd8a461b0361c5eb | worktree-agent-acd8a461b0361c5eb | b1df2461 | clean |  |
| .claude/worktrees/agent-acd929fec9bc01638 | worktree-agent-acd929fec9bc01638 | 6fd4c4e7 | clean |  |
| .claude/worktrees/agent-adb89985f77bd4a28 | worktree-agent-adb89985f77bd4a28 | 302fa52c | clean |  |
| .claude/worktrees/agent-adcc69226ff13f458 | worktree-agent-adcc69226ff13f458 | d7afc1e2 | clean |  |
| .claude/worktrees/agent-adf893af37ddee64d | worktree-agent-adf893af37ddee64d | 67ed4737 | clean |  |
| .claude/worktrees/agent-ae04a05a2d586a32c | worktree-agent-ae04a05a2d586a32c | eef65c8f | clean |  |
| .claude/worktrees/agent-ae4258f4d8b4987d2 | worktree-agent-ae4258f4d8b4987d2 | 16436f12 | clean |  |
| .claude/worktrees/agent-ae76c0cc5d799ee73 | worktree-agent-ae76c0cc5d799ee73 | 8d3b1069 | clean |  |
| .claude/worktrees/agent-ae7c4048101970432 | worktree-agent-ae7c4048101970432 | 67cbbe9e | clean |  |
| .claude/worktrees/agent-ae884e74d443794bc | finish | 44e60859 | clean |  |
| .claude/worktrees/agent-aea4681db0912a4f4 | theory-review | bd4a2f14 | 1 untracked: tmp/ |  |
| .claude/worktrees/agent-af0614c2688554b3b | worktree-agent-af0614c2688554b3b | ac9db359 | clean |  |
| .claude/worktrees/agent-af49dbf3f7510508a | promo-video-script | 20e4342b | clean |  |
| .claude/worktrees/agent-af4c28e085e98ffb2 | worktree-agent-af4c28e085e98ffb2 | e014498b | clean |  |
| .claude/worktrees/agent-af58968239f34c3d7 | worktree-agent-af58968239f34c3d7 | 2e9c7798 | clean |  |
| .claude/worktrees/agent-af993baf83b7fff5b | worktree-agent-af993baf83b7fff5b | d5a88186 | clean |  |
| .claude/worktrees/agent-afa5ab3b436b6d198 | worktree-agent-afa5ab3b436b6d198 | e710b535 | clean |  |
| .claude/worktrees/agent-afb04531752093bf7 | spc-import | c53cf97e | clean |  |
| .claude/worktrees/agent-afc27315658904c33 | worktree-agent-afc27315658904c33 | 489d1556 | clean |  |
| .claude/worktrees/imports-batch-1 | imports-batch-1 | 49707c3c | 1 untracked: node_modules |  |
| .claude/worktrees/module-split | module-split | 287e33a8 | clean |  |

95 worktrees under `.claude/worktrees/` (all branches already merged; only 3 have untracked files: agent-a0d3e392... `tmp/`, agent-aea4681d... `tmp/`, imports-batch-1 `node_modules`). 4 more worktrees live outside the repo under `~/.claude/jobs/c9506483/tmp/` (dk64wt, mergewt, pickwt, truncwt; branches dk64-song-pick, merge-batch, picker-primitives, test-truncation). Of those, `dk64-song-pick`, `picker-primitives`, `test-truncation` show cherry+ = 0 (merged); `merge-batch` is an ancestor. Branch names for the 4 outside-the-repo branches were not in the unique list, so they carry no unmerged work.

## Lists

### Needs merge / decision
- None of the worktree-agent branches. 
- archive-to-joshcough: review (4 conflicts); the only real code candidate.
- FFX re-capture apply: not a branch; blocked on Josh's ear (Q1).
- SNES phantom notes (Q20): not a branch; blocked on Josh's ruling, default "yes".
- claude-chat: parked, keep.
- audio-dictation: Josh decides; recommend drop.

### Stale header (edit open-items.md, 18 headers)
All 18 in the table above: change "BUILT on a worktree branch, awaiting merge" to "MERGED <hash>".

### Safe to delete (branches, once Josh approves; this audit deleted nothing)
- All 99 local + 4 origin `worktree-agent-*` branches, EXCEPT remove worktree first (`git worktree remove`) and skip locked `worktree-agent-a32b030d68755d347` until pid 1397 exits.
- Merged named branches: annotate-learning, audio-tracks, drummer, finish, gbs-import, merge-batch, midi-input (local and origin), module-split, n64-import, offline-export, promo-video-script, psx-akao-ff7, psx-import, shared-midi-writer, spc-import, theory-review, time-stretch, vgm-import, work, dk64-song-pick, picker-primitives, test-truncation, imports-batch-1, overnight-2026-09-26 (after the node_modules/tmp untracked dirs are discarded).
- Deleting a branch with a worktree needs `git worktree remove` first; the 3 dirty worktrees hold only untracked tmp/node_modules.
