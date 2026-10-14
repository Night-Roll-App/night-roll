# ex-battle-theme — lost sections, 2026-10-13 (recovery record)

**Status: already restored, with Josh's approval.** At 00:48 he told the Ask
chat "Yes please put them all back". The Ask tool re-added them, and the
00:49 publish (`8ad7268f`) has all five. Their lines are byte-identical to the
lines in `47ab1807` (checked with `diff`). Nothing here needs applying.

## What was lost and why

- `47ab1807` (23:27) published the five sections.
- `8f339eae` (23:29) dropped them. That publish rebuilt the annotations from
  the repo file the CDN still served, which was the 23:09 copy, and
  `markPublished` had already cleared the sections' "unpublished" flags.
- Fixed in `annotationsFor` (`lastSyncPrefer`). See open-items, 2026-10-13.

## The five sections (from 47ab1807)

No shift is needed for the transpose. Down 3 semitones moves pitches, not
bars or beats.

```
  {"at":[1,1],"to":[8,4],"type":"section","label":"A"},
  {"at":[9,1],"to":[16,4],"type":"section","label":"A","note":"Harmony on pulse2"},
  {"at":[17,1],"to":[24,4],"type":"section","label":"A","note":"Melody on pulse2"},
  {"at":[25,1],"to":[31,4],"type":"section","label":"B"},
  {"at":[32,1],"to":[32,4],"type":"section","label":"Turn"},
```

## Two other changes in the 00:49 publish, for Josh to check (not changed)

1. **The meter line is gone.** `{"at":[1,1],"type":"timesig","timesig":"4/4"}`
   is in every publish up to `63156997` (00:45), but not in `8ad7268f`.
   Nothing in the Ask log asks for it to go. If he wants it back, that is
   the exact line.
2. **Two keys at bar 1.** The file now has `key: C` and `key: F#m`, both at
   1.1. At 00:47 he said the song is in F♯ minor, not C. A new key at a
   beat drops the old one only from the screen (`dropLocalKeyAt`). It leaves
   no tombstone, so publish reads the published C back from the repo file and
   keeps it beside F♯m. That is likely how both keys got in. Deleting the C
   is his call.
