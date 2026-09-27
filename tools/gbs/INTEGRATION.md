# Wiring GBS import into Night Roll — what index.html would need

Status: the offline pipeline (`tools/gbs/`) is complete and tested
(`tests/gbs.test.mjs`); nothing in index.html has been touched. This note
maps each piece of the existing NSF import onto its Game Boy twin so the
app change is a translation, not a design. Line numbers are from
index.html at main `6a3905e` (2026-09-26) and will drift — search the
quoted identifiers.

## 0. The shape of the NSF import today

1. **Sniff** — `File → Import…` handler (~line 10095): every picked file is
   byte-sniffed; `"NESM\x1a"` in the first 5 bytes routes to
   `openNsfImport(bytes, name, m3uNames)`.
2. **Modules** — `nsfModules()` (~12278) dynamically imports
   `tools/nsf/{nsf,notes,midi-write,apu-render}.mjs` off Pages with a
   `?v=` cache-buster and merges their exports into one object `M`.
3. **Panel** — `openNsfImport` (~12340) fills `#importsheet`: title from
   `nsf.name/artist`, one row per song (name input, status, capture, open),
   `nsfSess = {M, nsf, bytes, rows, trackList}`.
4. **Capture** — `captureNsfTrack(M, nsf, track, seconds, onProgress)`
   (~12296): `runNSFAsync` → `reconstruct` → shift to first onset →
   `detectLoopAsync` → `backportTiming` + trim → `fitBpm` → snap-residual
   gate → `makeMidi` → bytes, bpm, secs, loop anchors. `impCapture` (~12430)
   parses the MIDI, stores a LOCAL draft under `albums/imports/<slug>/
   track-NN.mid`, keeps `row.secs`, and `idbNsfPut(slug, bytes, {base:
   {n, secs}})` persists the ROM bytes on the device.
5. **Commit** — `commitImports` writes .mid + loop rollnotes + `album.json`
   (`nsf: {vault: "<file>.nsf", tracks: {...}}`) + manifest, and uploads the
   .nsf to the NSF repo (`cfg().nsfRepo`, public archive `nsfBase`).
6. **Chip audio** — `chipSource()` (~7011) resolves bytes+track from the
   live session / IndexedDB / vault; `chipRender()` (~7066) runs
   `parseNSF → runNSFAsync → reconstruct` (for the lead-in) → `renderApu`,
   makes one AudioBuffer per channel name in the literal list
   `["pulse1", "pulse2", "triangle", "noise"]` (~7080); `chipStart` matches
   buffers to tracks BY TRACK NAME and skips tracks with an explicit voice.

## 1. What changes, piece by piece

### Sniff (one line)

```js
const gbss = rest.filter(x => String.fromCharCode(...x.bytes.subarray(0, 3)) === "GBS");
```

Route `gbss[0]` like `nsfs[0]`. The two are mutually exclusive by magic;
keep the same "one chip file per pick" message.

### Modules — a chip descriptor instead of a second copy of every function

The GB module exports were named to line up with the NSF ones:

| role | tools/nsf | tools/gbs |
|------|-----------|-----------|
| parse header | `parseNSF` | `parseGBS` |
| run + log | `runNSFAsync` / `runNSF` | `runGBSAsync` / `runGBS` |
| log → events | `reconstruct` | `reconstruct` (GB semantics) |
| loop, timing, tempo | `detectLoopAsync`, `backportTiming`, `fitBpm` | re-exported from nsf/notes.mjs — same functions |
| events → MIDI | `makeMidi` | `makeMidi` (wraps the NSF writer with the GB channel/drum maps) |
| events → .notes | `toNotesTxt` | `toNotesTxt` (GB wording) |
| log → audio | `renderApu` → `{pulse1,pulse2,triangle,noise}` | `renderApu` → `{pulse1,pulse2,wave,noise}` |

So the cleanest app change is a small descriptor:

```js
const CHIPS = {
  nsf: {magic: "NESM\x1a", ext: ".nsf", channels: ["pulse1", "pulse2", "triangle", "noise"],
        files: ["nsf/nsf", "nsf/notes", "nsf/midi-write", "nsf/apu-render"],
        parse: M => M.parseNSF, run: M => M.runNSFAsync},
  gbs: {magic: "GBS", ext: ".gbs", channels: ["pulse1", "pulse2", "wave", "noise"],
        files: ["gbs/gbs", "gbs/notes", "gbs/apu-render"],
        parse: M => M.parseGBS, run: M => M.runGBSAsync},
};
```

`nsfModules()` becomes `chipModules(chip)` (same `?v=` busting, one cache
per chip). `captureNsfTrack` becomes `captureChipTrack(chip, M, parsed, …)`
with exactly two substitutions: `M.runNSFAsync` → `chip.run(M)`, and the
`ev.channel === "noise"` skip stays (both chips call it noise). Everything
after `reconstruct` is literally the same code path, because the GB
reconstructor emits the NSF event shape (`startFrame/endFrame/midi/vol/
volEnd/duty/channel`).

Note the GB `makeMidi` needs no extra options from the app; it bakes in
`chans = {pulse1:0, pulse2:1, wave:2, noise:9}` and the LFSR-shift drum
map. `parseMidi` then yields tracks named `pulse1, pulse2, wave, noise` —
which is what the chip-audio matcher keys on.

### Panel

`openNsfImport` → `openChipImport(chip, bytes, name, m3uList)`; the fields
it reads (`.name`, `.artist`, `.songs`, `.startSong`) exist on both parsed
headers. `nsfSess` gains `chip`. **The m3u handling needs two changes** —
this note first claimed GBS ships the same playlist convention; the real
rips say otherwise (Josh, 2026-09-26, from the two Uematsu Game Boy
scores on Zophar: `final-fantasy-legend-the`, `final-fantasy-legend-ii`).
Each zip holds ONE .gbs (`DMG-SAJ.gbs`, `DMG-S2J.gbs`) plus one .m3u PER
TRACK — 17 files for FFL, 19 for FFL II, named `02 Main Theme.m3u`:

- `parseM3u` (~10058) matches `::NSF,` only. GBS lines carry `::GBS,`:
  `DMG-SAJ.gbs::GBS,1,Main Theme - Nobuo Uematsu - Final Fantasy Legend -
  ©1989-12-15 Square,01:28,,10`. Widen to `::(?:NSF|GBS),`; the rest of the
  line (`n,title,m:ss`) parses identically, and the ` - `-split title rule
  already yields "Main Theme".
- The Import handler (~10097) reads `m3us[0]` only — fine for a single
  playlist, wrong for 17 one-line files. Every picked m3u must be parsed
  and the results merged (concat, dedupe by `n`, keep playlist order).
  Josh picks them all at once from the iPad's Files sheet.

One extra line of status is worth
showing for GBS: `parsed.timerMode ? "timer " + rate.toFixed(1) + " Hz" :
"v-blank"`, because a timer-driven file (some run PLAY at 256 Hz or more)
produces 4–5× the frames per second, and the capture window (`#impsecs`)
means the same seconds but a longer emulation.

### Draft/commit/persistence

- `impTrackKey`, draft storage, rename, ✕, ⇪: unchanged (they never look
  inside the bytes).
- `idbNsfPut/idbNsfGet`: store the chip id with the record
  (`{bytes, tracks, chip}`); default `chip: "nsf"` on read so old records
  keep working.
- `album.json`: keep the `nsf:` key name for backward compatibility but
  allow `nsf: {vault: "x.gbs", chip: "gbs", tracks}` — or, cleaner, a
  parallel `chip: {kind: "gbs", vault, tracks}` and have `chipSource` read
  either. The vault filename's extension already says which it is.
- `.gitignore` has `*.nsf` (ROM music never enters the public repo); add
  `*.gbs`. The upload path in `commitImports` (~12717) builds the vault
  name from the slug + `.nsf` — take the extension from the chip.
- `nsfRepo`/`nsfBase` settings serve as the archive for both; the UI label
  "NSF repo" could become "chip-music repo" when this ships, with the help
  sheet + HELP.md + drift keyword updated per the shipping checklist.

### Chip audio

`chipRender` (~7066) needs the chip from the source:
`chipSource()` returns `{bytes, n, secs}` — add `chip` (from the live
session, the IDB record, or the album meta). Then:

```js
const M = await chipModules(chip);
const parsed = CHIPS[chip].parse(M)(src.bytes);
const {apuLog, frames, frameSec} = await CHIPS[chip].run(M)(parsed, src.n, secs, …);
const ev = M.reconstruct(apuLog, frames, frameSec);        // lead-in, as now
const r = await M.renderApu(apuLog, frames, frameSec, {sampleRate: audio.sampleRate, onProgress});
for (const name of CHIPS[chip].channels) { … createBuffer … }   // replaces the literal NES list
```

`chipStart`, mute/solo, the tape-style speed slider, loop-point buffer
looping, "explicit voice overrides the chip" — all keyed by track name,
all unchanged. The GB renderer is `async` and yields on the same 35 ms
MessageChannel budget as the NSF one, so the iPad watchdog story holds.

Synth fallback (no chip source): `voiceType(ti)` (~6058) assigns voices by
POSITION (last MIDI track = triangle, others alternate square/square25),
so a GB import with tracks `pulse1, pulse2, wave, noise(drums)` plays its
wave channel on the triangle voice — a fair stand-in for the typical GB
bass/wave patch. No change needed; a future per-name default ("wave" →
triangle) would make it explicit.

### tools/gbs/apu-render.mjs (implemented)

Same contract as the NES renderer: `renderApu(apuLog, frames, frameSec,
{sampleRate, keepFrames, onProgress}) → {pulse1, pulse2, wave, noise,
sampleRate, seconds}`. It models: the four DACs (0–15 → ±1, off = 0),
duty sequencers stepping every (2048−x)·4 T-states, the wave channel's
32 nibbles at (2048−x)·2 with the NR32 shift levels, the 15/7-bit LFSR
at 262144/(r·2^s), hardware envelopes (64 Hz), length counters (256 Hz),
the pulse-1 sweep (128 Hz, with both overflow checks), NR52 power, NR51
routing and NR50 volume folded to mono per channel, and a 20 Hz one-pole
high-pass standing in for the console's AC coupling. Not modelled: CGB
stereo (folded), the wave-RAM read corruption on DMG retrigger, the
"zombie mode" envelope tricks, DAC power-on/off pops, the exact mixer
curve. Renders at roughly 300–400× realtime in Node.

## 2. What is approximate in the pipeline (read before trusting a capture)

- **Retrigger vs. software fade.** A retrigger at the same pitch with a
  LOWER initial volume than the note currently has is read as a volume
  step inside one note; equal or higher = a new note. This catches
  drivers that fade by rewriting NRx2 + trigger every few frames, and
  keeps repeated same-pitch notes (bass lines) separate. A repeated note
  played deliberately softer will be merged — visible as a long note with
  `volEnd` < `vol`. Wave-channel retriggers are always new notes.
- **Sweep.** The reconstructor reports the WRITTEN period; a pulse-1
  sweep glide is one note at its starting pitch (the renderer plays the
  glide). Kick drums made from pulse sweeps show as one low note.
- **Sub-frame notes are dropped.** A note that starts and ends within one
  PLAY call (e.g. a 1-tick length of 3.9 ms) has zero frames and is
  filtered — the NSF path's granularity too.
- **Timer-mode files.** `frameSec` is 1/rate, so all frame arithmetic is
  right, but `fitBpm`'s "chip-native family" of candidates (an integer
  number of frames per 16th at 3–18 frames) was tuned for ~60 Hz; at 256
  Hz the seed window (±15 %) does the work instead. Give timer-mode
  captures a sensible seed.
- **CPU.** No interrupt dispatch, HALT/STOP end the current call, DIV/LY
  are derived from the cycle counter (good enough for RNG and wait
  loops), timer registers are write-and-forget, no CGB registers (KEY1,
  VRAM/WRAM banks, HDMA — writes are ignored, reads return the last
  write). Cycle counts are the table's T-states, not bus-accurate.
- **APU reads.** NRxx registers read back the last written byte rather
  than the hardware's OR-masks; NR52 reads power | $0F ("all active"),
  the same white lie nsf.mjs tells for $4015.
- **Wave pitch.** Multiplied by the measured cycle count in wave RAM
  (1, 2 or 4). A table with a non-integer number of cycles, or a
  sample-playback table, is reported at the formula pitch.

## 3. Shipping checklist items this would trigger (CLAUDE.md)

Help-sheet entry for "GBS chip-music file → capture panel" next to the
NSF text (touch first, keyboard after); `node tools/build_help.mjs`; a
drift keyword in `tests/night-roll.test.mjs` FEATURES; NIGHT-ROLL.md
**Import** and **Chip audio** paragraphs (chip descriptor, `.gbs` in the
vault, wave channel); WEB-SESSION.md pointer to `tools/gbs/dump.mjs`;
README's "what the project is" sentence if it names NES specifically;
open-items entry closing the "other consoles" roadmap line for GBS. An
e2e import test can use `makeTestGBS()` written to `tests/fixtures/` at
test time (no ROM data in the repo).
