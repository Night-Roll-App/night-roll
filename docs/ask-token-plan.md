# Token-efficient Ask — plan (advisor, 2026-10-01)

Josh: "the MOST TOKEN-EFFICIENT way to talk about songs in Ask overall."

## Where the tokens go (bridge, resumed Claude Code session per song)
- Fixed Claude Code base ≈ 45–50k tokens (its system prompt, tool schemas,
  CLAUDE.md/memory, skills, MCP tool list) — cached, read every API call.
- Every pushed context block stays in the session and is re-read (cached, ×0.1)
  on every later call → session cost grows ~quadratically. Over 20 turns:
  pushed context ≈ 50%, base ≈ 25%, output ≈ 15% (model 467k te vs measured
  cry-in-sorrow-1 434k te).
- A turn after the cache TTL rewrites the whole prefix at ×1.25 (~6× a warm turn).
- Context block today ≈ 4–6k tokens/turn (notes window 0.9–3.2k, annotations
  1.5–2k JSON).

## Bugs
1. Each app-tool round re-sends the whole context block (flattenTail starts after
   the last assistant message WITHOUT tool_calls → the tail repeats the user's
   context message).
2. Learning-mode leak: a Normal-mode session's estimate-spelled notes stay in the
   resumed session after the device flips to Learning (session key ignores mode).
3. Cost figures over-count: runClaude adds total_cost_usd (a running total on
   --resume) every turn. Use tokens as the metric until fixed.

## Build order (each shippable)
0. **DONE (2026-10-01).** Measure (bridge): costDelta; a per-session ring of
   the last 50 turns {t, gapS, in, out, cacheRead, cacheCreate, ctxTokens,
   apiCalls, parts}; GET /v1/sessions/:key?turns=1; app header x-nr-ctx-parts.
   `runClaude` now keeps `lastCumCost` per session and adds only the delta
   since the last turn (a lower total — a restarted session — is treated as a
   fresh total, not subtracted negative); `sessions.json` rows gained `ring`
   (last 50 turns) and `lastCumCost`; `GET /v1/sessions/:key?turns=1` adds a
   `ring` array to the usual usage shape (plain GET is unchanged). `ctxTokens`
   reads the LAST assistant stream event's `message.usage` (input + cache_read
   + cache_creation, not output — that event, not the closing "result" event,
   is the one that reflects what's IN context right now); `apiCalls` counts
   assistant message events that turn; `parts` is the optional
   `x-nr-ctx-parts` request header (JSON part→chars), stored as-is. Tests:
   tests/bridge.test.mjs's third test (fake-claude emits a distinct
   message.usage + total_cost_usd per call via a counter file) — a running
   total 0.002 then 0.005 → session cost 0.005; the ring has 2 rows with
   gapS (null, then ≥1) and the two distinct ctxTokens; parts round-trips.
1. **DONE (2026-10-01).** Tool-round duplication (bridge flattenTail): resumed
   → only TOOL RESULT lines. `flattenTail` was stopping at the last assistant
   message WITHOUT tool_calls — mid tool-round, the last assistant message
   HAS tool_calls, so it fell through to an earlier turn's boundary and
   re-sent the whole `<context>` user message every round. Fixed: stop after
   the LAST assistant message of any kind. A fresh (non-resumed) session still
   uses `flatten()` (full history) and is unaffected. Same test as above
   covers it: a resumed session's tool-round prompt contains "TOOL RESULT"
   and not "<context>"; a fresh session's first turn still contains
   "<context>".
2. Mode-separated sessions: askSessionName adds "#normal" in Normal mode.
3. **DONE (2026-10-01), modest.** Bridge passes --strict-mcp-config --mcp-config '{"mcpServers":{}}' --disable-slash-commands in both modes. Measured: restricted-tools base 38.7k → 15.7k (one run); full mode (Josh's bridge) ~28k either way — MCP tools are already deferred there. Judge further steps by the bridge's per-turn ring, not one-off runs. Was: Smaller base in read mode: --strict-mcp-config (empty) and
   --disable-slash-commands if supported; measure first-turn cache write.
4. Change-only gate (builder in progress) + a session-epoch marker from the bridge
   (x-nr-session-epoch = sess.id:lastCompact.at); mark parts sent only on job
   success (askFinish), same for askSeenAdvance; askAppState build line only when
   changed.
5. Compact encoding: per-track rows "17|2.71F4/.29 3.46F" (no bar word, octave/
   duration only when changed, sharps, no degrees); annotations in .rollnotes text
   form; drop track/lane/vol UI entries; legend once per session. −35–45%.
6. Skip already-sent bars per session; new read_bars(from, to, tracks?) tool for
   the OPEN song (live state, askSpanNotes speller); annotation diffs +/−/~ with
   stable content-hash ids.
7. Warm auto-Compact after a turn when context > ~90k (from the last assistant
   event's usage); session epoch changes → app resends in full.
Expected: ~45–55% less on a 20-turn session; ~half on a post-gap turn.
Measure before/after each step from the step-0 ring (replay 10 questions on an FF
song with Sonnet/Haiku).
Also: correct ASK_SYS_BASE2's "you cannot open files" on the bridge; tell the
model not to Read repo song files when the context already has the notes.
