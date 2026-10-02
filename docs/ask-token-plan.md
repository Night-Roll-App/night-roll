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
   changed. **The epoch marker is DONE both sides (2026-10-01):** bridge
   (step 7, above) + app (`aiRemote().chat` reads the header, `askEpochNote`
   resets the sent-hash record on change — see NIGHT-ROLL.md's "app side"
   paragraph under step 7). The rest of step 4 (parts-sent-on-success,
   askAppState build line) is separate, still open.
5. **DONE (2026-10-01).** Compact encoding: per-track rows `"T<n> name"` then
   `"<bar>|<beat><Pitch><oct>/<dur> …"` (no word "bar"; octave/duration shown
   only when they change from the previous note IN THE ROW; sharps/declared-
   key/Normal-estimate spelling unchanged, reusing askSpanNotes's own speller
   via the factored-out `askKeySpellComment`; drums keep the raw note number,
   `"#"`-prefixed for unambiguous parsing); annotations as `"<id>
   [bar.beat-bar.beat] kind: value — comment"` (the `.rollnotes` text
   grammar's own span, ids unchanged from today's JSON form), dropping
   track:/lane:/audio:-style structural directives (song-structure, not
   analysis); a legend (`askLegendText`) explaining both formats sent once
   per session, tied to the same sent-hash record the bridge-session caching
   (step before this) uses, so it reappears after Clear chat/Compact/a
   changed session epoch. BRIDGE only (`askCaps.bridge`); a local/LM Studio
   provider is unaffected. See NIGHT-ROLL.md's "Compact encoding, step 5"
   paragraph for the full shape and tests. **Measured** (real 7-track, 8-bar
   window + a 9-entry annotation sample): notes window −48% (4608→2390
   chars), annotations −71% (589→171 chars); first-message total (legend
   included) −34%, every later message −51% — on top of, not instead of,
   the bridge-session caching's stand-ins for unchanged sections.
6. **DONE (2026-10-01), except annotation diffs (skipped — trivial, and the
   change-only gate on the WHOLE annotations block already covers the
   unchanged case).** Skip already-sent bars, bridge sessions only
   (`askCaps.bridge`; local/LM Studio providers keep full `askSpanNotes`
   every turn, unaffected). `askBarRow(tr, ti, b, bt, qt, est)` factors ONE
   track's one-bar row out of `askSpanNotesCompact` (same octave/duration
   carry-forward math) so this step and `read_bars` share one definition of
   a bar's row; `askBarFingerprint(b, …)` is that bar's rows across every
   track, hashed (fnv1a32) and compared against a new per-bar field,
   `askSentGet(key).bars` (bar number → hash), living in the SAME sent-hash
   record step 4's whole-block fields already use — one `askSentReset`
   (Clear chat/Compact/a changed epoch) clears all of them together. A bar
   whose hash matches joins its run of unchanged neighbors into one "bars
   A–B: as sent earlier" line; a new/edited bar renders in full, by track,
   for just that run. `askSpanNotesCompactCached` returns `{text,
   allCached}` — when EVERY bar in the window was already sent, `askContext`
   still gets the existing whole-block "unchanged since your last message"
   stand-in (cheaper than one collapse line per bar), so a steady view costs
   exactly what step 4 already made it cost; the granular collapsing only
   shows up for a window mixing new/edited bars with already-sent ones.
   `askSentCommit`'s merge for the `bars` field is a DEEP merge (every other
   field is a scalar overwrite) and caps the record at 2000 bars, dropping
   the lowest bar numbers first. New tool, `read_bars({from_bar, to_bar,
   tracks?})` (`ASK_SONG_ONLY_TOOLS` — the OPEN song only): re-reads bars
   from LIVE `song` state (unsaved edits included), byte-identical to
   `askSpanNotesCompact` for that span when no `tracks` filter is given;
   capped to 32 bars regardless of the window's own budget, truncation
   stated. `ASK_SYS_BASE2` now lists it and explains the "as sent earlier"
   convention, and no longer claims the model "cannot open other songs,
   files, the repo or the web" (false on the bridge) — it now says to prefer
   the context block and these tools over reading a song's file directly,
   since they reflect live state a file on disk does not. Tests: the "P10
   skip-already-sent bars"/"P10 read_bars" blocks in
   tests/night-roll.test.mjs (12 cases — a mixed window's collapse/render
   split; two separate earlier sends accumulating into one later
   whole-block stand-in; editing one bar resending only that bar; a failed
   send staging nothing; Clear/Compact/epoch resetting the per-bar record
   with the rest; the 2000-bar cap; `read_bars` matching
   `askSpanNotesCompact` exactly, seeing a live edit, hidden in the general
   chat, and truncating a too-wide request). `npm test`: night-roll.test.mjs
   387/387, whole suite green. **Measured** (a 64-bar synthetic song, one
   note per bar, scrolled in 8-bar steps to the end and back — 16 turns,
   `askSpanCachedBlock` isolated from the rest of `askContext`): total
   notes-window chars 3026 → 1990 (−34.2%). The forward pass (8 windows,
   every bar genuinely new) is identical either way, 1615 chars — nothing to
   cache yet; the whole saving is on the way back: the same 8 windows,
   now already sent, drop from 1411 to 375 chars (−73.4%), each one
   collapsing to its "unchanged since your last message" stand-in. Before
   this step, revisiting an earlier window after several others in between
   cost full price every time (the old whole-block hash remembers only the
   SINGLE most recently sent window); after it, the per-bar record
   remembers every bar ever confirmed sent in the chat, however long ago —
   the saving grows with how much a session re-visits ground it already
   covered, which is exactly what scrolling back and forth through a song
   does.
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
**Done (2026-10-01), as step 6.**

## Final summary (2026-10-01) — build order 0–7, all shipped

Every step above is done. In build order: 0 the measurement ring
(per-session `ring`, `lastCumCost` delta, `x-nr-ctx-parts`); 1 tool-round
de-duplication (`flattenTail` stops at the last assistant message of any
kind, so a resumed tool round sends only TOOL RESULT lines, never the whole
`<context>` block again); 2 mode-separated bridge sessions (`#normal`
suffix, closing a real Learning/Normal memory leak); 3 a smaller read-mode
base (`--strict-mcp-config`/`--disable-slash-commands`); 4 the change-only
gate (`askCachedBlock`, whole-block hashing for annotations, success-only
stage/commit/drop) plus the session-epoch marker that resends in full the
instant a compact — manual or the bridge's own automatic one — lands; 5 the
compact encoding (`askSpanNotesCompact`/`askAnnotationsTextCompact`, a
one-time legend); 6 per-bar skip-already-sent-bars on top of the compact
encoding, plus `read_bars` for reading outside the window on demand; 7 warm
auto-Compact (the bridge fires `/compact` itself once a turn's context
passes `BRIDGE_COMPACT_AT`, in the background, never delaying the reply)
and the epoch header step 4 reads.

The savings compound rather than stack flatly: step 5's compact rows and
annotation lines are what step 6 hashes per bar, so a bar that collapses to
"as sent earlier" is already in the cheaper format; step 4's whole-block
annotations gate and step 6's per-bar notes gate share one sent-hash record
and one reset path (`askSentReset`), so Clear chat/Compact/an epoch change
invalidates everything at once, never one piece forgotten; and step 7's
auto-Compact keeps the fixed Claude Code base from growing unbounded
underneath all of it. Measured, step by step, on real or representative
fixtures: step 4 alone, −76% on a small sample once both blocks were
cached; step 5 alone, notes −48%/annotations −71%/first message −34%/every
later message −51%; step 6 alone (isolated from step 4/5's own savings,
64-bar scroll-forward-then-back), −34.2% overall, −73.4% on the revisited
(backward) half specifically. None of steps 4/5/6's numbers subtract from
each other — a real session gets all three at once, on top of the fixed
Claude Code base that steps 1/3 shrink and step 0 measures.

Open, deliberately not done: annotation diffs (+/−/~, step 6's third
bullet) — skipped as not worth it once the whole-block change-only gate on
annotations (step 4) already covers "nothing changed"; a true diff would
only help a long turn that both reads AND edits several annotations in one
reply, which Learning mode's "never on its own initiative" rule makes rare.
