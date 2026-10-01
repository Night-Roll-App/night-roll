# .rollnotes v2 (P3, docs/provenance-plan.md)

Status: **reader + version guard shipped (2026-10-01). Writer still writes
v1** — P4 switches it. This doc defines the v2 shape so every device can
read it before any device ever writes one. JSON Schema:
docs/annotations-v2.schema.json.

## Why

v1 (NIGHT-ROLL.md, ".rollnotes format") is `{version: 1, song, notes: [...]}`
— a flat document, no place for machine-written provenance except an actual
note in the `notes` list (`"forked from <path>"` / `"moved from <path>"`,
`PROVENANCE_RE` in index.html). Josh ruled (2026-09-30, open-items Q8) that
provenance belongs in a header, not the notes a person reads and edits — v2
adds that header. **Rewriting a file from v1 to v2 is a format conversion,
not editing his songs** (his ruling) — no per-song approval needed for the
batch migration (P5).

## Shape

Same top-level document v1 already is, with three more fields. Everything
else — the `notes` array, one entry per line so the file still git-diffs
line-per-change — is byte-for-byte the same per-note schema v1 writes
(`noteToJSON`/`jsonToRawNote` in index.html): `at`/`to` as `[bar, beat]`
(anchors stay bar/beat, never raw ticks), `type` + its value field(s), and
free `text`/`note` exactly as documented in NIGHT-ROLL.md. A v2 file is a v1
file plus a header — nothing about the notes themselves changes.

```json
{
  "format": "night-roll-annotations",
  "version": 2,
  "song": "menu",
  "origin": {
    "kind": "copy",
    "from": "albums/nes/mega-man-2/air-man.mid",
    "movedFrom": "albums/compositions/nightroll/old-name.mid",
    "at": "2026-10-01T04:00:00.000Z"
  },
  "stamp": 1759296000000,
  "notes": [
    {"at":[1,1],"type":"timesig","timesig":"6/8"},
    {"at":[1,1],"type":"key","key":"Bb"},
    {"at":[1,1],"to":[4,6],"type":"section","label":"A — home"},
    {"at":[5,3],"to":[5,4],"type":"chord","chord":"G7/B","note":"no 5th"},
    {"at":[6,2.5],"text":"Plain prose observation."}
  ]
}
```

### Header fields

- `format` — always `"night-roll-annotations"`. Absent in v1 (v1 never had
  one); **required from v2 on** — a v2+ file with a different or missing
  `format` is treated as unreadable (the version guard, below).
- `version` — `2` for this shape. Absent means `1` (v1's own files never
  wrote the field until P1's `saved` stamp was added, and still don't carry
  `format`).
- `origin` — optional. `kind` is one of the five origins
  docs/provenance-plan.md defines: `composition` (made in Night Roll) ·
  `copy` (Save As/Move/"Make it mine") · `import` (a MIDI file brought in)
  · `capture` (the game pipeline) · `starter` (bundled). `from` / `movedFrom`
  are repo paths — the SAME two facts a `"forked from <path>"` /
  `"moved from <path>"` note used to carry, now structured instead of a line
  in the notes a person reads (`hasProvenanceNote`/`originOf` in index.html
  read `origin.from`/`origin.movedFrom` here first, falling back to the
  legacy note text for a file that hasn't been migrated yet). `at` is an
  ISO-8601 timestamp of when that origin was recorded. P3 only *reads* this;
  nothing writes it yet (P4).
- `stamp` — same meaning as v1's `saved`: epoch ms, the cross-device
  freshness beacon (NIGHT-ROLL.md). Writer-only field name kept as `stamp`
  for v2, not `saved`, so a v2 reader never confuses it with v1's.

### `notes`

Unchanged from v1 — see NIGHT-ROLL.md's ".rollnotes format" section for the
full per-type field list (section/chord/key/timesig/tempo/track/loop/audio/
chop/lane/plain text, `note` as the attached-comment field on any of them).
A v2 file's `notes` array round-trips through the exact same deriver
(`jsonToRawNote` → `deriveNoteTypes`) as v1's — by construction, a v1/v2
twin (same `notes`, only the header differs) parses to identical in-memory
notes.

## Reader (shipped, P3)

`parseRollnotesJSON` (index.html) accepts both transparently:

- No `format` field, or `version` ≤ 1 (or absent) → read as v1 always has
  been.
- `format: "night-roll-annotations"` and `version` 2 → header read, `notes`
  parsed exactly like v1's.
- `version` > 2 (ROLLNOTES_MAX_VERSION, index.html), or `version` ≥ 2 with a
  `format` that isn't `"night-roll-annotations"` → **the version guard**:
  the song opens read-only. `rollnotesReadOnly`/`rollnotesLockReason`
  (index.html, set from `loadNotes`) carry the state for the currently open
  song; the message is "⚠ this song's annotations were written by a newer
  Night Roll — update the app before editing". Every write path chokes on
  it before touching a byte:
  - `annotationsFor(key)` — the single merge every publish (`publishSong`)
    and Move read before writing — throws, so Publish/Publish all/Move all
    refuse with that message (surfaced via each flow's existing
    `catch (err) { … err.message … }`).
  - The ✦ Ask tool's `add_annotation`/`edit_annotation`/`delete_annotation`
    refuse the same way for the open song.
  - A tool that would rewrite the file (none does today — P5's migration
    tool will) gets the same signal: `tools/query-lib.mjs`'s `loadSong`
    returns `rollnotesVersion`/`rollnotesReadOnly`/`rollnotesOrigin` on its
    `doc`; check `rollnotesReadOnly` before writing.
  The file still *displays* — notes parse best-effort if the shape is close
  enough, exactly as today — only writing is refused.

`hasProvenanceNote`/`originOf` (index.html) check the open song's
`origin.from`/`origin.movedFrom` first, falling back to the legacy
`PROVENANCE_RE` note-text scan for a file that hasn't been migrated to v2 —
both keep working, on either format, indefinitely (the fallback never goes
away; not every file will ever be rewritten).

## Writer (not yet — P4)

Still v1 (`serializeNotesList`, index.html) as of this doc. P4 switches it
to write v2 with a real `origin`; P5 is the one-time batch migration of
every existing file (Josh's ruling: format conversion isn't editing — see
docs/provenance-plan.md's addendum, and open-items.md for the six files he
specifically wants fixed).

## Round-trip guarantees (tested, tests/night-roll.test.mjs)

- v1 → parse → serialize → byte-identical (pre-existing coverage,
  unchanged by this doc).
- A v2 fixture and its v1 twin (same `notes`, only the header differs) →
  parse → identical in-memory notes.
- A v3 fixture (or any `version` > 2, or a `version` ≥ 2 file with an
  unrecognized `format`) → `readOnly` true, `publishSong`/`annotationsFor`
  refuse.
