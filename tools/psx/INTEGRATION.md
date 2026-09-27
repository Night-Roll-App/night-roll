# PS1 import — how it slots into Night Roll

Nothing in index.html changes on this branch. This is the plan for the
wiring, written against the code as it stands (function names are the
app's; line references will drift, names less so).

## 1. Byte-sniff in File → Import…

The picker handler (`#fileinput` change listener, "NSF import" section)
already sorts picked files by magic: `NESM\x1a` → `openNsfImport`,
`audioMagic()` → audio tracks, everything else → `parseMidi` (MThd
found anywhere). Three more sniffs, in the same `rest.filter` style:

| bytes 0..3 | file | route |
|------------|------|-------|
| `pQES` (70 51 45 53) | SEQ (u32BE at 4 == 1) or SEP (u16BE at 4 == 0) | `openSeqImport` |
| `pBAV` (70 42 41 56) | VAB or VH | bank for the SEQ import session |
| `PSF` + 0x01 (50 53 46 01) | PSF1 / minipsf | inflate, scan, then `openSeqImport` on what is found |

`tools/psx/{seq,vab,psf}.mjs` export `isSEQ`, `isVAB`, `isPSF` for
exactly this. `.VB` bodies have no magic; a picked `.vb` is recognised
by extension and by being picked together with a `.vh` (the same
"pick both together" rule the m3u playlist already uses).

A SEQ needs no bank to import — pitch is then the SEQ key as written,
which is right more often than not (RESEARCH.md §3). The panel should
say when no bank is loaded and let one be added later, re-deriving the
drafts, the way re-capture already overwrites NSF drafts.

## 2. The import session

Mirror `nsfSess`: `seqSess = {M, seq: parsed, vab, bytes, rows}`.
Modules load like `nsfModules()` — dynamic `import()` off Pages with the
`?v=` cache-buster, one code path with the CLI:

    import("./tools/psx/seq.mjs"), ("./tools/psx/vab.mjs"),
    ("./tools/psx/notes.mjs"), ("./tools/psx/psf.mjs")

(`notes.mjs` itself imports `../nsf/notes.mjs` for `pitchName` and
`../nsf/midi-write.mjs` for `trackBytes`; both are already served.)

Per row (one per SEP sequence; a SEQ is one row), the recipe is
`dump.mjs` minus the files:

    const seq = M.parseSEQ(bytes).sequences[i];
    const result = M.seqNotes(seq, {vab});
    const mid = M.makeMidi(result);                  // Uint8Array
    stash parseMidi(mid.buffer) as albums/imports/<slug>/track-NN.mid

What the SEQ gives that the NSF path had to fit: **tempo map, meter
map, program per note, exact ticks** — so no `fitBpm`, no snap gate,
no loop detector. The SEQ's own CC99 loop markers become the `loop:`
directive note (`seq.loop.start/end` in ticks → bar/beat via
`M.barBeat(seq, tick)`), same as `loopAnchor`/`loopTarget` today.
Bars are already right: `makeMidi` writes every time signature into
the conductor track, and the app's `parseMidi` returns `timesig` and
`tempos` tables (verified in the vm harness: the psx .mid parses to
`{ppq: 480, tracks: [ch 1 prog 0 ×6 notes, ch 2 prog 1 ×2], tempos,
timesig}`).

Naming: SEQ files carry no title; the row name defaults to the file
name (or `name-N` for SEP blocks) and the panel's rename-in-place
works unchanged. PSF tags supply `title`/`game`/`artist` when the
source was a PSF.

Commit is `commitImports` as-is: .mid + loop rollnotes + album.json +
manifest. album.json's `nsf:` vault block gets a sibling for PS1 data
(see §3) — or nothing, if chip playback is deferred.

## 3. Playback through the decoded bank (the "chip" equivalent)

The NSF path renders the console's own sound (`chipRender` →
`renderApu`) into per-channel `AudioBuffer`s. The PS1 analogue is a
**sample player**, not a register-log DSP, because the SEQ is a score
and the bank is samples:

1. `M.vagPcm(vab, i)` → `{pcm: Int16Array, loopStart, loopEnd, oneShot}`
   per VAG, decoded once per session, into 44.1 kHz `AudioBuffer`s
   (`buf.copyToChannel(Float32 pcm/32768)`; `loop = !oneShot`,
   `loopStart/loopEnd` in seconds).
2. Per note: the tone (`M.tonesFor(vab, program, key)[0]`) gives the
   sample and `center`/`shift`; `playbackRate = 2 ** ((key − center +
   shift/128) / 12)` — exactly the SPU pitch register in ratio form,
   so **no root-pitch estimate is needed for playback**; the estimate
   only serves the notation. `AudioBufferSourceNode.playbackRate` is
   linear interpolation where the SPU is 4-point Gaussian; close enough
   for auditioning, and the same coarseness the app's oscillator voices
   already accept.
3. Envelope: ADSR1/ADSR2 are SPU register words (RESEARCH.md §5 has
   the bit layout); a `GainNode` with linear/exponential ramps derived
   from attack/decay/sustain/release shifts. First cut: attack from
   ADSR1, release from ADSR2, ignore sustain rate.
4. Volume/pan: tone `vol`, program `mvol`, `masterVol`, CC7/CC11 per
   channel, `pan`/CC10 → a `StereoPannerNode`. Reverb (`mode 4`)
   skipped.
5. Schedule from the note list, not from the MIDI, so the loop and the
   tempo map are honoured for free: `secondsAt(seq, tick)` is the
   clock; mute/solo per channel maps to per-channel gain, as the chip
   buffers do today. The transport's tape-style speed slider becomes a
   tempo scale (pitch does NOT follow — that is a difference from the
   NSF chip mode and the right one for a score).

Where the bytes live: like the NSF vault, the VH/VB (and SEQ) are game
data and stay out of the public songs repo — session → IndexedDB
(`ff1roll` store `audio`-style, keyed by slug) → the private archive
repo. album.json would carry `psx: {seq: "<file>", vab: "<file>",
tracks: {<base>: {seq: n}}}` beside `nsf:`.

Time to build: two evenings for the sample player without envelopes,
one more for ADSR. It is smaller than the 2A03 DSP was.

## 4. PSF

What `psf.mjs` does today: parse the container (header, tags, CRC,
`_lib` list), inflate the EXE (Node zlib in the CLI; the browser passes
its own inflate — `new Response(new Blob([bytes]).stream()
.pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()`),
read the PS-X EXE header, and **scan the image for `pQES`/`pBAV`**.
libsnd-based games (Sony first-party, most licensed titles that did
not write their own driver) keep the SEQ and the whole VAB verbatim in
RAM, so for them a PSF is just a SEQ import with an odd wrapper and
`dump.mjs` already handles it. A **minipsf** needs its `_lib` picked
alongside (the bank is usually in the lib, the SEQ in the mini):
scan both images, take the SEQ from the mini and the VAB from
whichever has it. The panel should ask for the lib by name from the
tag.

What it does not do: play anything. When the scan finds no SEQ, the
driver is not libsnd (AKAO/Square, Konami, Capcom, Namco …) and the
options are a format-specific parser (VGMTrans has readers for several
— porting one is a day or two each and stays emulation-free) or the
R3000 + SPU logger. That logger is costed in RESEARCH.md §5: an R3000
interpreter with interrupts, a BIOS HLE, DMA, the SPU register file
and ENDX tracking; then note reconstruction by KON/KOFF with the
SNES-style root-pitch problem for pitch, tempo and meter *fitted* as
the NSF path fits them because the log has neither. Multi-week,
comparable to the whole NSF pipeline plus its DSP. Start it only for a
named soundtrack that neither the SEQ scan nor a ported parser reaches.

## 5. Shipping checklist items this would touch

- Help sheet: the Import entry gains "PS1 SEQ/SEP (+VH/VB or VAB), PSF
  (libsnd games)"; drift keyword in `tests/night-roll.test.mjs`.
- NIGHT-ROLL.md: a "PS1 import" paragraph next to "Import" and "Chip
  audio"; WEB-SESSION.md: `node tools/psx/dump.mjs` beside the NSF
  dumper (it writes the same `.notes.txt` shape).
- Tests: `tests/psx.test.mjs` already covers the pipeline; the
  in-app wiring gets a vm test that feeds `makeTestSEQ()` bytes through
  the picker path, as the NSF import has.
- Approximations to state in the panel, not hide: with a bank, notated
  pitch depends on the sample-root estimate (marked "detected" or
  "C4 assumed" per program in the .notes.txt); kits are detected by
  shape (several one-key tones) and can be forced per program; pitch
  bends are counted, not applied.
