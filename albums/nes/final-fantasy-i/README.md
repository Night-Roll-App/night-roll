# Final Fantasy I (NES) — Nobuo Uematsu

Track-by-track harmonic and melodic analysis of the FF1 soundtrack. Goal:
extract reusable composition devices — how melody, arpeggio, and bass share
three monophonic channels, and the harmonic moves that make these loops work.

All 19 songs in `songs/` are **chip-true captures**, extracted from the NSF
(the cartridge's actual sound code) by `tools/nsf/` at the repo root:
real channel identity (pulse1 / pulse2 / triangle / noise), true driver
tempos, and frame-exact loop cuts — verified twice, by ear and against the
APU register log. The cut/loop table lives in [CUTS.md](CUTS.md).
Earlier MIDI transcriptions (arrangements, up to 17 simultaneous voices
against the NES's ceiling of three) are gone from the tree; git history
keeps them.

## Method

**The goal is learning composition, not producing documents.** Analyses are
built through conversation: Josh listens (Logic, guitar, piano, Night Roll),
makes observations, and the doc grows from that dialogue — nothing is
pre-analyzed for him. `reference/` holds material kept aside so it doesn't
spoil the discovery process.

## Layout

- `songs/` — `<song>.mid` (chip capture) + `<song>.rollnotes` (in-app
  annotations) + `<song>.notes.txt` (plain-text note dump for LLM reading).
  The .mid and .notes.txt are written directly by the NSF pipeline
  (`node tools/nsf/dump-all.mjs`); rollnotes are never overwritten.
- `analysis/` — the song docs and cross-song references
- `CUTS.md` — the verified cut/loop table; check every regeneration
  against it
- `reference/` — the NSF pipeline plan and spoiler-quarantined material

## Analysis status

| Song | Doc | Status |
|------|-----|--------|
| Cornelia Castle | [analysis/cornelia-castle.md](analysis/cornelia-castle.md) | ✅ full analysis + devices log |
| Overworld | [analysis/overworld.md](analysis/overworld.md) | bass done; melody + counter queued |
| Battle | [analysis/battle.md](analysis/battle.md) | in progress (key found: see doc) |
| Airship | [analysis/airship.md](analysis/airship.md) | in progress |
| Cave (Dungeon) | [analysis/cave.md](analysis/cave.md) | in progress — compound-line finding |
| Chaos Temple | [analysis/chaos-temple.md](analysis/chaos-temple.md) | in progress |
| Gurgu Volcano | [analysis/gurgu-volcano.md](analysis/gurgu-volcano.md) | ✅ full key work — D→F Dorian, channel-swap device |
| Dead Music | [analysis/game-over.md](analysis/game-over.md) | key done (D minor); bass-pattern exercise open |
| Ending Theme | [analysis/epilogue.md](analysis/epilogue.md) | opening key done (G major); 127 bars unanalyzed |
| Floating Castle | [analysis/floating-castle.md](analysis/floating-castle.md) | parked — tonic Bb, mode resists |
| Town | [analysis/town.md](analysis/town.md) | ✅ key + full chord map; 4–3 suspension device |
| Menu Screen | [analysis/menu.md](analysis/menu.md) | in progress — chords through bar 3, no key yet |
| — key sweep — | [analysis/key-sweep.md](analysis/key-sweep.md) | 10 of 19 opened; hypothesis revised to loop-target form |
| — chord charts — | [analysis/chord-charts.md](analysis/chord-charts.md) | grids for analyzed songs + shared templates |

Remaining songs await the sweep. Open questions live inside each song's doc;
cross-song items in the root [open-items.md](../../open-items.md).
