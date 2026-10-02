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
7. **DONE (2026-10-01).** Warm auto-Compact (tools/claude-bridge.mjs): the
   instant a turn's JOB ENDS SUCCESSFULLY (never on error) with that turn's
   ctxTokens (the ring's own figure — the last assistant stream event's usage,
   i.e. what's actually sitting in context) over `--compact-at`
   (`BRIDGE_COMPACT_AT`, default 90000; 0 disables), the bridge fires the
   existing `runCompact` for that song's session right away, in the
   BACKGROUND — the reply has already gone out, so this never delays it, and
   the cache is still warm. Recorded exactly like the manual
   `POST /v1/sessions/:key/compact` (`sessionUpdate` `turns: 1`, the running
   `tokensIn/Out/cache` counters reset, `lastCompact {at, preTokens,
   postTokens, cost}`) except the cost uses step 0a's delta-against-
   `lastCumCost` logic rather than adding `/compact`'s own `total_cost_usd`
   raw (that figure is a running total too — using it raw would double-count
   next to the triggering turn's own delta). A per-song `compacting` Map
   holds the in-flight promise: `startAutoCompact` is a no-op while one is
   already running for that key (two compacts for the same song never
   overlap), and `runClaude` checks the same map before spawning Claude Code,
   deferring the whole turn behind the in-flight compact's promise rather
   than racing it on the same `--resume` session id. One `console.log` line
   per completed or failed auto-compact (captured in
   `~/Library/Logs/nightroll-bridge.log` when run under launchd).
   **The epoch header.** Every chat-completion response (stream or not) now
   carries `x-nr-session-epoch: "<session-id>:<lastCompact.at||0>"` (also in
   `access-control-expose-headers`, so the app's `fetch` can read it
   cross-origin) — it changes the instant a compact (manual OR automatic)
   lands on that song's session. A non-stream reply computes it lazily, at
   actual response-send time (after its own job — and any compact it waited
   out — has finished), so it reflects even a compact this very turn
   triggered; a streamed reply can only carry it as of stream START (headers
   can't change mid-stream), reflecting an earlier turn's compact — the app
   sees a same-turn compact on its next turn either way. **The app side of
   reading this header (resending its context in full on a changed epoch,
   the way it already does after a manual Compact) is NOT built yet — a
   later step.**
   Tests (tests/bridge.test.mjs, a dedicated fake-claude — a Node script, not
   a shell script, so Date.now() ms timestamps in the args log can prove a
   turn genuinely WAITED for a running compact rather than merely running
   later): a turn over `--compact-at` → exactly one `/compact` invocation
   lands between it and a following turn fired immediately after, which
   itself starts only once the compact's full artificial 400ms has elapsed
   (not merely once it started) — the guard; `lastCompact` recorded with the
   delta cost, not `/compact`'s raw total; a turn under the threshold →
   never; `--compact-at 0` → never, even with huge ctxTokens; the epoch
   header differs before/after and carries the compact's own timestamp.
Expected: ~45–55% less on a 20-turn session; ~half on a post-gap turn.
Measure before/after each step from the step-0 ring (replay 10 questions on an FF
song with Sonnet/Haiku).
Also: correct ASK_SYS_BASE2's "you cannot open files" on the bridge; tell the
model not to Read repo song files when the context already has the notes.
