# Plan: "✦ Annotate this song for me" — Normal mode only

Status: draft → Fable review → Fable build. Spec source: open-items "QUEUED IDEA (Josh, 2026-09-27)" — on-demand, per song, per tap, never volunteered; AI-written annotations reviewable and clearable in one go; MIDI-derived songs only.

## Learning mode
Unavailable in Learning mode (no menu item, no AI tool, nothing in context) — CLAUDE.md: Learning mode never seeds analysis. Normal mode: labelled as AI estimates.

## Flow
View ▾ (Normal mode) → "✦ Annotate this song…" → sheet: choose what (sections, chords, key) → runs an AI job through the existing Ask machinery with a dedicated system prompt + the theory FACTS toolkit output as context (pattern/form/melody/bass facts — deterministic grounding) → AI returns structured JSON (sections with bar ranges, chord bands, key regions) → validated against the song (bar ranges in range, chord symbols parse via theory/chords) → written as annotations tagged `ai: true` (+ model/date) → one undo step; "Clear AI annotations" removes all tagged ones in one go. Never overwrites user annotations (skips overlaps, reports them).

## Tests
Parser/validator on good/bad JSON; tagging + one-step undo; clear-all; Learning mode: no entry, tool absent, context free of it; fake-server integration test (tests/ai.test.mjs style) for the whole round trip.

## Depends on
Theory facts toolkit merged (for grounding) — if not merged yet, build with a pluggable "facts" provider and wire facts after.

## Out of scope
Audio-only songs; Learning-mode variant.
