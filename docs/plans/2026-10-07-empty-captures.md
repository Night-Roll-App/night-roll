# Empty captures: five published songs with no notes (2026-10-07)

Josh, Terminal #207–#209: "The Hyrule field main theme on Ocarina of Time has
no notes"; Hyrule Field Battle and Waiting's console voice "came out silent"
on the iPad; "I think several songs from ocarina of Time are busted".

Investigation only. No app code, album or test changed. Scratch work
(probes, the throwaway prototype, sweep output) is in `/tmp/ec/`.

## 0. Summary

| Song | Why it is empty | Console voice today | Can a generic fix capture it? | Result with the fix |
|---|---|---|---|---|
| OoT Hyrule Field Main Theme | Seq 2 is a **controller**. It copies other sequences into its own memory (`ldseq`, B0), and the parser leaves B0 as a stub. The script then waits for a load that never finishes. | Silent (same parse) | Yes: B0 + testchan fix + random-choice policy + io ports from the rip's RAM | Piece 3, then pieces 4–14 in turn: 154 s, loops back to 13.0 s |
| OoT Hyrule Field Battle | Same seq 2. The rip sets io port 2 = 1 | Silent (#208) | Yes, the same fix | Piece 3, 0x0F, then 0x10–0x13 in turn: 77 s, loops back to 25.8 s |
| OoT Hyrule Field Waiting | Same seq 2. The rip sets io port 2 = 2 | Silent (#209) | Yes, the same fix | Piece 3, 0x14, then 0x15–0x17 in turn: 69 s, loops back to 26.8 s |
| MM New Wave Bossa Nova with Lulu | Seq 0x68 is 7 bytes: `ldi 1; stio 4; runseq ff 0x4D; end`. The parser leaves runseq (C4) as a stub. | Silent | Yes: C4 on its own player swaps the sequence and keeps the io ports | Seq 0x4D with port 4 = 1: 190 notes, 7 channels, 27.4 s |
| EarthBound Giygas' Static | The capture is right: two held notes. Their pitch works out **below MIDI 0** (−3, −4) because the sample's root estimate is a "low"-confidence 28.6 Hz. midi-write drops out-of-range notes without saying so. | **Plays** (the static; loudness measured −17 LUFS) | Yes: fall back to the default root when a low-confidence root puts notes out of range, and warn | 2 held notes (voices 2, 3) for the whole 12 s, about 1 semitone apart |

Every fix below is about how the driver works or what the file contains.
None of them needs a game's name. The one place a layout is used is the
OoT-generation `SequencePlayer` struct (where the io ports sit). That is
engine-dialect data. CLAUDE.md allows it: it tells the code WHERE to look.

The sweep in §6 found one more broken song: **MM Staff Roll is cut short**.
The published file is 126.9 s. The rip tag is 398 s. Its sequence ends in
a C4 runseq to 0x7F, which the capture drops. With C4 it runs 379.6 s and
has 6035 notes. No other N64 song is empty, silent or cut short.

## 1. Ocarina of Time: the three Hyrule Field songs

### 1.1 What the rips are

All three minis play **sequence 2** (`NA_BGM_FIELD_LOGIC`). Each mini's
save state changes only two places:

| mini (ripper's track) | state chunk @0xBB320 | state chunk @0x129574 (RDRAM 0x128E18) |
|---|---|---|
| hyrule-field-main-theme (19a) | `addiu a1,zero,2` | io = 0,−1,**0**,−1,−1,−1,0,3 |
| hyrule-field-battle (19b) | same | io = 0,−1,**1**,−1,−1,−1,0,3 |
| hyrule-field-waiting (19c) | same | io = 0,−1,**2**,−1,−1,−1,0,3 |

The CPU is parked on `lbu a0,1(s0); addiu a1,zero,2; jal
AudioLoad_SyncInitSeqPlayer`. `s0` points at command bytes `82 01 22 00`,
so a0 = **player 1**. RDRAM 0x128E18 is the last 8 bytes, offset 0x158, of
the struct at 0x128CC0. That struct is `gSequencePlayers[1]`: its
`channels[16]` pointers sit at +0x38 (0x801AEBE0, stride 0xE0), and
player 0 is at 0x128B60, 0x160 bytes below. Offset 0x158 is `soundScriptIO[8]`. So
**the ripper chose main / battle / waiting by writing io port 2 in the save
state**. That value is in the file. Today's capture passes `io: null`
(every port −1) and never reads it.

The engine does not reset those ports when a sequence starts. In
scratch/mm-src/seqplayer.c only `AudioScript_InitSequencePlayer`, at
boot, sets `seqScriptIO[j] = SEQ_IO_VAL_NONE`.
`AudioLoad_SyncInitSeqPlayer` leaves them alone. That is why the rip
works in a USF player.

### 1.2 What sequence 2 does (its 268 bytes; the other 9204 are buffer space)

Seq 2's table size is 9472 bytes. The rip holds only 0x000–0x10B, which is
the script. 0x110–0x1307 and 0x1308–0x24FF are **two load buffers**. The
game fills them with other sequences, so the ROM never had to supply those
bytes. That is the "9204 bytes not in the rip".

```
0000 mutebhv 20; mutescale 70; initchan ffff
0007 ldi 0; stio 3; stio 6; ldi -1; stio 5
000e ldio 0; sub 1; rbeqz → play 0x31 ; else play 3   (call 00c4)
001f ldi 0; stio 4                                     ← MAIN loop
0022 ldio 2; rbltz rnd; subio 3; rbeqz rnd; ldio 2; stio 3
     sub 1 → rbeqz 0050 (battle) ; sub 2 → rbeqz 0086 (waiting)
0033 rnd: rand 11 (re-rolled if equal to io5) → io5; +4 → call 00c4; rjump 001f
0050 BATTLE: io4=1; io5=-1; play 0x0F; loop: rand 4 (+16) → pieces 0x10–0x13
0086 WAITING: io4=2; io5=-1; play 0x14; loop: rand 3 (+21) → pieces 0x15–0x17
00bc dyncall tables: [00e8, 00f6] (load into buffer A/B), [0110, 1308] (call buffer A/B)
00c4 play(v): stio 7; ldi 0; stio 0; ldio 6; dyncall 00bc   ; load piece v into buffer io6
00cc   delay1; testchan 0,6,9,10,12,14 — wait until all are disabled
00df   ldio 6; dyncall 00c0                                  ; CALL the loaded piece
00e3   io6 = 1 - io6; end (return)
00e8 ldio 7; stseq 0 → 00f1 (patch ldseq's id byte); io1=-1; ldseq io1 seq=?? dst=0110
00f6 … same with dst=1308
0102 delay1; ldio 1; rbeqz end; rbltz 0102 (still loading); end
```

The pieces are seqs 3–0x17, the album's `hyrule-field` and
`hyrule-field-2 … -21`. They are written so they work at any address.
Each starts its channels with `rldchan` (relative). Its own script then
`delay`s for the piece's length (1562 ticks at 150 bpm = 13.0 s) and
`end`s, which returns to the controller. Example from seq 3:
`initchan 5ef7; rldchan 0 +0x31 … ; vol 65; tempo 150; delay 1562; ldio 0;
rbeqz end; delay 30; freechan; end`.

### 1.3 Why the capture is empty (seq-libultra.mjs)

1. **B0 `ldseq` is a stub** (`stub("sequence ldseq 0xBn")`, line ~597). io1
   stays −1. The script loops at 0x102 (`delay1; ldio 1; rbltz`) on every
   tick until the 600 s cap: 57,602 io reads, 0 notes, `[truncated]`.
2. **`testchan` reads the wrong flag.** The parser returns
   `C.finished ? 1 : 0`. The engine returns `channel->enabled ^ 1`
   (mm-src seqplayer.c, `ASEQ_OP_SEQ_TESTCHAN`). `initchan ffff` creates
   channels that are not enabled and not "finished", so the wait at 0xCC
   would never end even after a load. (An unallocated channel also has to
   read as 1, because the engine's `sequenceChannelNone` is disabled.)
3. **`rand` (CE) is a stub that returns 0.** Even with 1 and 2 fixed,
   "rand 11, re-rolled if equal to the last" with a constant 0 alternates
   pieces 4 and 14 forever.
4. **The io ports are not read from the rip** (§1.1), so Battle and
   Waiting would play the Main path.
5. **Where it stops.** The parser takes the first backward top-level jump
   as the song's loop (`rjump 001f` after the first random piece). That is
   the controller's loop, not the music's.

The console voice (`CHIPS.usf.run` → `sequenceOfSet` → `renderN64`) renders
those same 0 notes. That is the "chip render came out silent" in #208 and
#209. tools/measure-loudness.mjs measured every N64 song except these four
(§6), which agrees.

### 1.4 The generic fix and what it produces

- **B0 ldseq**: copy sequence `id`'s bytes (from the set's sequence table:
  ROM, or the RAM cache) into this sequence at `dst`. Mark them present and
  set io[lo] = 1 (done; `AudioLoad_SlowLoadSeq` sets `*isDone = 1`). Use 0
  if the sequence isn't loadable, and add a warning.
- **testchan**: `C && C.enabled ? 0 : 1` for the OoT generation. Keep SM64's
  own rule.
- **io ports from the save state**: read the playing player's
  `soundScriptIO`. Find the player array by its structure (16 channel
  pointers at +0x38, stride 0x160, io at +0x158; OoT-generation layout).
  The player index is the parked call's a0: execute the one load at the PC,
  here `lbu a0,1(s0)`. These are dialect offsets (WHERE), not per-game
  data. MM's struct offsets are different and need checking against
  mm-src before use.
- **rand**: the game's value is `(audioRandom >> 2) % n`, and audioRandom
  is stirred with `osGetCount()` each audio frame. Without emulating the
  CPU clock it cannot be reproduced. The proposed rule for every game:
  **each `rand` site returns 0, 1, 2, … in turn** ("every choice once, in
  order"), plus a warning: "this song picks sections at random in the game;
  the capture plays each choice in turn". It is deterministic, it leaves
  out no piece, and it needs no game knowledge.
- **Loop for a game-steered script**: a loop is where the whole state
  repeats: pc, call stack, io ports and every rand site's counter mod n.
  Under the in-turn rule that happens exactly after one full round.

Prototype (a throwaway copy of tools/n64 in /tmp/ec/proto: B0, testchan, CE
in-turn, C4; io read from player 1's struct; capped at the tag length of
283 s):

| mini | pieces loaded (start time) | notes / channels at 283 s | proposed loop |
|---|---|---|---|
| main (io2=0) | 3@0, 4@13.0, 5@25.8 … 0xE@141.1, 4@153.9 … | 7992 / 14 ch | 153.9 s → 13.0 s (piece 4) |
| battle (io2=1) | 3@0, 0xF@13.0, 0x10@25.8, 0x11@38.7, 0x12@51.5, 0x13@64.3, 0x10@77.1 … | 10952 / 13 ch | 77.1 s → 25.8 s |
| waiting (io2=2) | 3@0, 0x14@13.0, 0x15@26.8, 0x16@40.9, 0x17@54.8, 0x15@68.7 … | 3239 / 13 ch | 68.7 s → 26.8 s |

With io = −1 everywhere (today's default), all three play the Main path.
The console render of the prototype's Battle (30 s) is audible: 12 of 13
channel groups, peaks 0.09–0.35. Font 3 is shared by seq 2 and its pieces.

Side effect to check when building: the piece minis (`hyrule-field`,
`-2 … -21`) end with `ldio 0; rbeqz end; delay 30; freechan`. Today
io0 = −1, so they run 30 ticks (0.2 s) longer. With ports read from RAM,
io0 = 0 for those minis too, and each would end 0.2 s sooner. Treat that
as a MOVED verdict in recapture, not a regression.

## 2. Majora's Mask: New Wave Bossa Nova with Lulu

Seq 0x68 is 16 bytes (8 present):
```
0000 cc 01      ldi 1
0002 74         stio 4
0003 c4 ff 4d   runseq player=ff (this player) seq=0x4D
0006 ff         end
```
Seq 0x4D is the same piece as the album's "Get New Wave Bossa Nova". Its
script steers by port 4:
```
0023 ldio 4; sub 255; rbeqz 0030   ; port −1 → every channel
0028 ldio 4; rbeqz 002e            ; port 0 → stopchan 13, 14
002b stopchan 1                    ; port 1 → stopchan 1
0030 delay 1536; freechan 603f; end
```
C4 is a stub (`stub("sequence runseq C4")`), so the capture ends at once:
0 notes, 0 ticks, album secs 0, and a silent console voice. Engine rule
(mm-src seqplayer.c `ASEQ_OP_SEQ_RUNSEQ`): 0xFF means this player.
`AudioLoad_SyncInitSeqPlayer(player, id)` restarts the player on `id`,
keeps the io ports, and returns.

**Fix**: C4 on its own player swaps in the target sequence (bytes + presence
mask), frees the channels, restarts at pc 0 and keeps io and tempo map
continuity. C4 on another player is still a stub with a warning.
**Result** (prototype): runseq 0x4D at 0.0 s, port 4 = 1, so channel 1 is stopped.
190 notes on channels 0,2,3,4,5,13,14, 27.4 s (last note ends 24.4 s), no
loop. Compare "Get New Wave Bossa Nova" (port −1): 212 notes, channels
0–5,13,14.

## 3. EarthBound: Giygas' Static

The capture is not wrong. The notes are lost when the MIDI is written.

- The SPC's dumped KON = 0x0C, so voices 2 and 3 are already sounding when
  the dump starts. Both use sample #24 @$92C5 (1168 samples, loop 1120 @48,
  looped). Their PITCH is 0x3E1 (993) and 0x3A9 (937). NON = 0, so it is a
  BRR sample, not the noise generator.
- In 12 s the driver makes 59,995 DSP writes, all to global registers:
  KON 0 / KOFF 0 ×6000 each, FLG, EON, EFB, EVOL L/R, plus 0x2D, 0x3D. It
  writes **no** voice register: no new pitch, volume or key-on. The song
  is those two held voices for its whole length. The SPC tag comment says
  "Giygas Defeated (part 2)". There is no sequenced music beyond that.
- `reconstruct` gives 2 events: voice 2 MIDI −3 (+13 c) and voice 3 MIDI
  −4 (+12 c), both 0 → 384000 samples (12 s), vol 61 and 62. The root
  estimate for sample #24 is 28.6 Hz, confidence "low". The sample is
  static, so there is no period to find. 12·log2(993/4096) = −24.5
  semitones below that root lands below MIDI 0.
- tools/nsf/midi-write.mjs:331 `if (p < 0 || p > 127) continue;` drops both
  notes without a warning. The result is a 41-byte .mid with only the tempo
  track. The `.notes.txt` shows `NaN` for the pitch name.
- **Console voice**: the SPC chip render emulates the file, so it plays the
  static. album.json has `loud: {lufs: −17, peak: −12.6}` and no `synth`
  figure because there are no MIDI notes. Josh hears the static on the game
  voice, and the synth voice is empty.

**Fix (generic, SPC pipeline)**: when an instrument's root confidence is
"low" or "none" and any of its notes would fall outside 0–127, use
`DEFAULT_ROOT_MIDI` (72, the documented fallback) for that instrument.
Add a capture warning naming the instrument. Separately, midi-write should
count the notes it drops and pass that up as a warning, so an empty .mid
never ships silently. **Result**: 2 notes, about MIDI 48 and 47, 1.0
semitone apart (12·log2(993/937)), each held 0–12 s, on two tracks.
Pitches stay relative to the estimated root, as with every SPC note. (It
can't be marked "unpitched": that flag is for one-shot samples, and this
one loops.)

## 4. Recommended order

1. seq-libultra.mjs: B0 ldseq (with a `loadSeq` callback from capture.mjs),
   C4 runseq on its own player, OoT-generation testchan = `!enabled`, CE
   in-turn with a warning. One hand-assembled test each in n64.test.mjs, plus
   a real-rip test: Battle loads 3, 0x0F, 0x10.
2. capture.mjs: io ports from the playing player's `soundScriptIO` (struct
   found by layout; player = parked a0). Loop = full-state repeat for a
   script that read io / rand / loaded sequences.
3. SPC: low-confidence root fallback + midi-write drop warning.
4. Recapture (tools/recapture.mjs dry run, then `--apply`) of OoT, MM and
   EarthBound. Expect: the 5 songs ADDED, MM Staff Roll grows from 126.9 s
   to about 380 s, the OoT field pieces MOVED by 0.2 s. Then run
   measure-loudness for the four N64 songs that have no `loud` entry.
5. Browser check: Hyrule Field Battle plays notes and the console voice.

## 5. Not verified

- The OoT rand rule is an assumption that `(audioRandom >> 2) % n` matches
  mm-src. oot-src isn't in scratch, and what the real console picks in a
  given second can't be reproduced anyway.
- The prototype's runseq doesn't reset tempo or transposition. The target
  sets its own tempo here, but check the engine's
  `AudioSeq_ResetSequencePlayer` before building.
- No lazyusf ground-truth render was made. lazyusf2 gives no audio on the
  OoT set (INTEGRATION.md §11.5), and kode54's lazyusf would need a build.

## 6. Sweep: every N64 song (and the cause when flagged)

Method: for each rip in /tmp/recap/rips/n64/<album>/, run today's
`sequenceOfSet` with the app's defaults, then parse the published .mid
(note count) and read album.json's `loud` (present = the console render
was measured and was not silent).

| Album | Songs | Empty .mid | Console render not measured (silent) | Capture cut short | Notes |
|---|---|---|---|---|---|
| ocarina-of-time | 109 | 3: hyrule-field-main-theme, -battle, -waiting | the same 3 | the same 3 (600 s cap, 0 notes) | Every other song has notes and a `loud` entry. Few-note songs are real: the ocarina songs (11–20 notes), seal-of-six-sages (7 held notes over 28.1 s on ch 1, 2) |
| majoras-mask | 103 | 1: new-wave-bossa-nova-with-lulu | the same 1 | **staff-roll**: stops at its C4 runseq to 0x7F, 126.9 s of a 398 s tag | mikau-s-cry-ending has 7 notes in 4.5 s, which is real |
| super-mario-64 | 38 | 0 | 0 | 0 | none |
| goldeneye-007 / banjo-kazooie / diddy-kong-racing / donkey-kong-64 / jet-force-gemini (Rare driver) | 58 / 257 / 103 / 178 / 78 | 0 | 0 (every song has `loud`) | none found | Few-note songs are short SFX/jingles (BK collect-*, sfx-*; DK64 pause). My raw `sequenceOfSet` counts come out *below* the published ones because the sweep ran without the app's tag-length sizing. That is a difference in method, not a defect. |

Every OoT song that isn't flagged stops at its loop jump (intro + one
pass), so its secs is about half its tag. That is expected, not truncation.
The only stubbed op found on the non-flagged OoT/MM songs is the channel
sound-shaping 0xE9, which doesn't affect notes.

**Regression check of the prototype** (B0 + C4 + testchan + CE in-turn,
io still null, the app's stopAtLoop). Over all 250 OoT/MM/SM64 songs, only
these 5 change: the three Hyrule songs (0 → 755 notes, stopping at 25.8 s on
the controller's first backward jump, which is why the loop rule in §1.4 is
needed), Bossa Nova (0 → 190 notes, 27.4 s) and MM Staff Roll (1652 notes /
126.9 s → 6035 / 379.6 s). Every other song comes out identical.

EarthBound wasn't swept. A cheap follow-up is to have midi-write's drop
counter (§3) flag any other SPC song that loses notes the same way.
