# In-app AI (local models) — design proposal

Status: v4 2026-09-25, RULED by Josh (§10). P1a (chat), P2a (Fill) and P3
(in-browser WebLLM) SHIPPED the same day — see NIGHT-ROLL.md "✦ Ask / ✦ Fill". P0 probes, P3, P4 open. Advisor rounds
1–4 applied (§11); round 4 verdict CONVERGED. Written before code so Josh can rule on it. Supersedes the
parked `claude-chat` branch's Anthropic-only transport; that branch's
sheet CSS/HTML, streaming renderer and tutor prompt are reused, its
context function and transport are rewritten.

Josh's brief (2026-09-25): "an AI-enabled DAW that we can feed context
about the song into, and it can, right then and there, give us ideas."
Both roles: **tutor** (theory lessons, discussion, analysis help) and
**generator** ("I'm stuck — fill in a few chords here"). Anyone must be
able to run a model on their own, no Mac required; Josh on the iPad
wants to point it at his MacBook Pro. "Do it however it needs to be
done if URLs have to change."

## 0. One-paragraph shape

A chat sheet inside Night Roll talks to a language model through ONE
adapter with three backends: **another computer** (an OpenAI-compatible
URL — LM Studio or Ollama on Josh's MacBook, anyone's PC), **this
browser** (WebLLM: the page downloads a model once and runs it on the
device's GPU — the no-setup path, iPad included IF the capability probe
passes), and later **cloud** (a key). The current turn carries one
context snapshot (song, meter, cursor, lasso, his annotations, the
notes of the span in view) under a stated token budget. Replies stream
as text. When the model was asked for notes it answers with a JSON
take; the take is validated and applied to a track HE chose before
sending, exactly as the Bassist applies one — immediately, one ⟲
restores what was there, take chips flip between tries. The generator
runs only where the Bassist runs: editable songs (his compositions,
local drafts), never locked FF1 songs. Nothing the model says is
written as an annotation.

## 1. What already exists that this stands on (verified 2026-09-25)

- **`claude-chat` branch (43b2347, 213 lines):** sheet CSS/HTML,
  per-song history, streaming bubble renderer, tutor prompt with the
  don't-spoil rule. **Its `chatContext()` is dead on main:** it reads
  `sel.options[...]` for the old `#songsel` dropdown (gone — two-level
  picker) and `song.timesig`/`song.tempos[0]` (wrong for annotated
  songs, see §4). It is rewritten in P1a, not rebased; the audit list is
  `sel`, `songsel`, `song.timesig`, `song.tempos`, `trackAudible`,
  `beatLabel`, `keyunset`.
- **Bassist apply sequence** (index.html ~13576–13590, ~13683–13697,
  ~13817–13840): onset-scoped erase (`n.t >= t0 && n.t < t1`) sets
  `n.gone = true` (never splices — `ni` indices stay stable for undo)
  and mirrors via `n.ri` into `song.rawNotes[ti][ri].gone`; adds push
  `{t, d, p, v, added: isAdd}` with `isAdd = !isComposition()`, and
  mirror into `rawNotes` with `+ chopS`; `put()` clamps velocity 1–127
  and floors duration at 20 ticks; then `pushUndo({kind:"group",
  entries:[eraseBatch, addBatch]})`, `saveEdits()`, `computeSongEnd()`,
  `buildScoreModel()` if in score view, `draw()`; a created track folds
  into the same undo via `addTrackUndoable` + `undoTrackAdd`. Inlined in
  `bsGenerate`, not a callable. Gates: `editableSong()` (composition ∨
  local draft ∨ no songKey), meter-change refusal (`tsdir`), drums
  refusal (`trackIsDrums`). Target-track contract (help text, ~1183):
  "defaults to a NEW bass track unless an empty one exists — it never
  silently overwrites your notes; the status line says exactly what it
  replaces." Take chips (`bsTakes`, cap 8) replay seeds and are
  session-ephemeral. Two Bassist vm tests exist (one-undo/monophonic,
  inference); neither is a byte-level fixture.
- **No ghost-note or audition mechanism exists.** `tracksGhost` is a
  drag offset; the roll has no ghost path; the score view renders from
  song notes through an LRU measure cache; the scheduler walks
  `song.tracks[].notes` only. Apply-then-undo to audition would clear
  the redo stack (`pushUndo` resets `editRedo`). → v1 has no ghosts.
- **`notesTxtFor()`** (index.html ~12648) is the in-app `.notes.txt`
  writer used by commit/rename (same shape as
  `tools/dump_notes.mjs`): grouped per track, one line per bar —
  `## track N (name)` / `bar 9: 1 C3 2, 2.5 E3 0.5, …` — comma-joined,
  beats and durations in **quarters**, header lines stating duration
  is gate time, rhythm is onset spacing, and "Pitches use sharp
  spelling; the true key is Josh's to discover — this file states no
  key." It reads `song.timesig`/`song.tempos[0]` and forces sharps via
  its own table. The span serializer is a bar-range + track filter
  over it with three deltas (§4); committed `.notes.txt` files keep
  their current shape.
- **Settings… sheet** (`#settingssheet`): data locations under ONE
  Save, backed by `cfg()`/`saveCfg(patch)` (~14414; `saveCfg` is a
  shallow merge over a flat object). The GitHub token is deliberately
  NOT in `cfg()` — it lives under `ff1roll-ghtoken`. Model prefs
  follow both conventions (§2).
- **Precedents for loading code:** `vendor/vexflow.js` (vendored) and
  dynamic `import()` of local ES modules for the NSF pipeline (~12154).
  What is NEW with WebLLM is the first third-party-hosted runtime
  dependency (jsdelivr for code, HuggingFace/MLC for weights + wasm) —
  Josh's decision (§10).
- **Draft safety:** `saveDraft` (~11457) is a bare `localStorage.setItem`
  of the whole song, no try/catch, no quota handling anywhere. Drafts
  are the only copy of unsynced compositions. Chat storage must never
  compete (§4).
- **Listener mode:** a static CSS id list under `body.listener`
  (~348) hides chrome; `applyListener()` is the one class writer;
  phones default to listener. New buttons join that CSS list.
- **Escape** closes the topmost `.overlay.on` unconditionally (~14917).
- **Bar/beat frame in the UI:** bars are chop-relative; the counted
  beat is the declared meter's denominator note (`beatTicks()`,
  `beatsPerBarDisp()`, `effTs()`) — eighths in 6/8; annotations read
  `[1.4]`. Every note writer mirrors into `rawNotes` with `+ chopS`.
- **Insert chord** already stacks notes on one track (~9165), so
  polyphonic takes are app-legal; the Bassist's monophony is labeled
  NES-legal.
- **LM Studio on Josh's Mac** — `lms ls` (2026-09-25): 3 models,
  39.63 GB; `qwen/qwen3.6-27b` (17.48 GB), `qwen/qwen3.6-35b-a3b`
  (22.07 GB, loaded). Those are the ids LM Studio reports. CORS/LAN
  toggles not yet exercised. Server: `:1234`, `/v1/models`,
  `/v1/chat/completions` (SSE), toggles for **CORS** and **serve on
  local network**, `response_format: json_schema`. Ollama: `:11434`,
  same `/v1/*`, CORS via `OLLAMA_ORIGINS`; its `json_schema` support
  through the OpenAI layer is version-gated → the adapter degrades.
  Whether `/v1/models` reports the context window: UNVERIFIED — the
  window is a Settings field (§4).
- **Test harness limits** (tests/harness.mjs): no `ReadableStream`,
  `AbortController`, `caches`, `navigator.gpu`; `fetch` rejects; the
  whole inline script runs at load — a top-level reference to a
  missing API breaks every test. e2e helper aborts every non-localhost
  request (`page.route(/^(?!.*localhost)/, abort)`) and lets
  `localhost` through.

## 2. The adapter (one interface, three backends)

```
provider = { id, label,
  listModels(): Promise<[{id,label}]>,
  chat({system, messages, schema?, signal, onDelta}): Promise<string> }
```

- **remote** — base URL + optional key. `listModels` = GET
  `{url}/v1/models`. `chat` = POST `/v1/chat/completions`,
  `stream:true`, SSE `data:` lines → `choices[0].delta.content`.
  Structured output degrades by probe: `response_format:json_schema` →
  `json_object` → plain prose + the validator (§5); the first failure
  class is remembered per URL for the session. Covers LM Studio,
  Ollama, llama.cpp server, vLLM, any OpenAI-compatible host.
- **browser** — WebLLM (`@mlc-ai/web-llm`, pinned, jsdelivr unless
  vendored per §10). Curated menu (Qwen 3 / Llama 3.2 / Phi 4 / Gemma 3,
  1B–8B, labeled with download size) over its prebuilt list. Streaming
  via its OpenAI-shaped API; `response_format` grammar where supported.
  Download progress and cache state (bytes held) show in Settings.
  Requires WebGPU; absent → grayed with the reason. COOP/COEP need
  (which Pages cannot set): UNVERIFIED — P0 probe.
- **cloud** — deferred. The branch's native Anthropic transport
  (`anthropic-dangerous-direct-browser-access`) is the known-working
  answer, kept in git history.

**Prefs:** flat fields in `cfg()` — `aiBackend`, `aiUrl`, `aiModel`,
`aiWindow` (context window in tokens; default 32768 for remote, 8192
for browser; P1b sets it from `/v1/models` when the server reports
one — UNVERIFIED that LM Studio/Ollama do) — matching cfg's
existing flat shape so `saveCfg`'s shallow merge is safe. The key, if
any, lives under its own `ff1roll-aikey` like the GitHub token. All
saved by the Settings sheet's one Save. The chat sheet's status line
shows backend + model and a gear that opens Settings at the model
block.

**SSE parser is a named global taking string chunks** (not a
`Response`), so the vm suite can feed it canned text. Every new web API
(`AbortController`, `caches`, `navigator.gpu`, `ReadableStream`) is
referenced only inside functions, behind feature detection.

**What leaves the device:** every turn sends the system prompt, the
stripped chat history, and the context block — his annotation file for
the song (capped) plus the span's notes — to the configured URL.
Consent is **per host**: `localhost`/`127.0.0.1` never prompt; any
other host — his own Mac over the tailnet included — gets ONE
`appConfirm` the first time, stating in a sentence what leaves the
device; acknowledged hosts are a device pref. (Classing `*.ts.net`,
`*.local` or RFC-1918 as "own machine" would trust any host on shared
Wi-Fi and any tailnet; one prompt per new host is cheap and removes
the heuristic.) Whether hosts beyond his own machines are allowed at
all in v1 is §10.6b.

## 3. Reachability: iPad → MacBook

Pages is `https://`; LM Studio on the MacBook is `http://`. An https
page fetching http on the LAN is mixed content, blocked. Facts and
unknowns, stated as such:

- `http://localhost` from an https page: Chrome allows (potentially
  trustworthy origin). **Safari: UNVERIFIED** — historically blocked.
  First item of P0: if Safari blocks it, there is no zero-setup
  Mac-Safari path and the Tailscale route below is primary for every
  device.
- Chrome's **Local Network Access** permission (prompt for `.local`,
  private IPs, possibly localhost): version-dependent, UNVERIFIED
  which builds enforce it; Safari's position UNVERIFIED. A distinct
  failure class below.

Routes for the iPad, documented in Settings under the URL field:

1. **Pages page + Tailscale Serve in front of LM Studio (primary,
   conditional on §10.10).** Tailscale on Mac + iPad, tailnet with
   MagicDNS and HTTPS certs enabled. On the Mac, a Serve rule that
   proxies `https://<mac>.<tailnet>.ts.net` → `localhost:1234` (exact
   flags confirmed in P0 against `tailscale serve --help`; the
   `--https=<port>` form is restricted to 443/8443/10000). CORS ON in
   LM Studio (page origin is Pages; still cross-origin). Works from
   anywhere. Keeps the Pages origin, so this device's drafts and prefs
   stay put.
2. **Whole app under one tailnet origin (same-origin, no CORS).** Serve
   the repo from the Mac and mount `/v1` on the same Serve host
   (`--set-path`). No mixed content, no CORS toggle. Cost: a second
   origin — drafts and prefs on the iPad do not follow from Pages.
   Simplest for a household that never uses Pages.
3. **Plain http from the Mac at home** (`python3 -m http.server`, open
   `http://<mac>.local:8000`, URL `http://<mac>.local:1234`). Home
   Wi-Fi only, second origin as in 2. Fallback, documented, not the
   path.

**Test connection** button in Settings: GET `/v1/models`, reports one
of five classes with the fix in the same line — mixed content (https
page, http URL → routes above) · permission not granted (local-network
prompt declined/unsupported) · unreachable (server off / wrong host) ·
CORS blocked (opaque error → "turn on CORS in LM Studio's server
settings") · OK, N models (populates the dropdown). The guesswork lives
in that button.

## 4. Chat sheet ("✦ Ask")

- **Entry:** `✦ Ask` in the top bar (tutor). `💬` is taken by the
  subtitle strip. Hidden in listener mode (id added to the
  `body.listener` CSS list; `applyListener()` is the class writer).
  Keyboard: none in v1 — the app binds no bare letters today; adding
  one is a new convention, deferred.
- **History** per song in localStorage, **context stripped on save**
  (`stripContext` at save time, not render time), last 30 turns, hard
  cap 64 KB per song and 512 KB across songs; each log stores a
  `lastUsed` stamp and eviction sorts on it. Every chat write is
  `try/catch`; on failure it drops turns and retries once, then gives
  up silently. **Drafts win: chat storage never competes with
  `saveDraft`.** vm test: a full chat log stays under the cap.
- **Streaming** bubbles as built; **■ Stop** aborts via `AbortSignal`.
  Plain text only.
- **Target row** (picker on editable songs only): a track picker + the span
  ("bars 9–12 · target: [New track ▾]"), pre-shaped from the lasso or
  the bars in view, always visible on editable songs so a take from
  ANY message has a resolved target at send time (§5). **The target
  row's span IS the request:** the context block serializes exactly
  that span, the validator checks against it, `applyTake` erases
  within it. The row re-syncs to the lasso/view until Send and is
  frozen for the turn at Send. On locked songs the row shows the span
  only (no picker) and drives the serializer the same way.
- **ONE frame for the whole protocol: display bars and display
  beats** — the counted beat of the declared meter, durations in the
  same unit, chop-relative bars. What his ruler and annotations say is
  what the model reads and writes ("bar 9 beat 4" means his beat 4).
  This deliberately diverges from `dump_notes.mjs`'s quarter-based
  columns; the serializer header states the unit. vm test on a
  6/8-annotated song: serialize → take → ticks round-trips.
- **Context block — sent ONCE per request, on the current user turn
  only. Never stored.** Parts:
  - system prompt: fixed (~1.5k tokens);
  - song line: title, album, **`song is a composition`** flag (derived
    from the album: compositions/ vs analyzed), meter from
    `effTs()`/`beatsPerBarDisp()`, tempo from the effective map, bar
    count, tracks with hidden flags, view/playing state, cursor bar and
    beat, key-state line;
  - lasso pitches, if any (with the branch's do-not-name caveat);
  - his annotations (`serializeRollnotes()`), with a "cut at bar N"
    line when trimmed;
  - span notes: `notesTxtFor()` filtered to the span and its tracks
    with three deltas — declared meter (`effTs()`, effective tempo
    map), display beats, and ONE speller for the whole block:
    `pitchName(p, sfDeclaredAt(tick))` — null when undeclared →
    sharps; his declared key otherwise (the lasso line uses exactly
    this). `previewSf` (a live key-dial preview) is bypassed by
    extracting the keyRegions scan as `sfDeclaredAtRaw(tick)` —
    `sfDeclaredAt` stays the preview-aware wrapper, the serializer
    calls the raw one — so the block spells by committed declarations
    only. Header lines kept,
    with the key line conditioned on whether a key is DECLARED over
    the span, not on the album: declared → "spelled by your declared
    key (<name>)"; undeclared → the existing no-key line verbatim (19
    FF1 sidecars declare a key, some flat — a declared key is his own
    discovery, no spoiler either way). The span is the target row's
    span (below).
  - stripped history, newest first.
  **Budget profiles** keyed off `aiWindow`: **small (≤ 8k):**
  annotations 1k, span 1.5k, history 1k, ceiling window − 1k;
  **large (> 8k):** annotations 6k, span 4k, history 3k, ceiling 16k.
  Trim precedence when over: history first, then annotations, then
  span (last — it is what he is asking about). Status line shows
  "~5.2k of 7k"; on the small profile only it appends "(small — raise
  the window in Settings)" so the throttle is legible.
- **Prime rule, everywhere (Josh's ruling 2026-09-25):** the same
  rules as the web-session file, on FF1 songs AND his own
  compositions. Default: point him in the right direction, hint, ask
  a question back. If he insists — "I give up, please tell me" — it
  tells him. Whether he has insisted is read from the conversation,
  not a switch. No special flip for compositions; the composition
  flag stays in the context (it tells the model the song is his and
  editable), it does not loosen the rule.
- The sheet may open on locked FF1 songs for tutoring (the generator
  refuses there). Josh's explicit yes wanted (§10.7).

## 5. Generation ("fill in a few chords here")

**Contract: the LLM is a third player beside the Bassist and Drummer,
under the Bassist's shipped contract.** No ghosts, no audition in v1
(the mechanisms do not exist; P2b if he still wants them after P2a).

- **Entry points** (edit commands → menu/row parity): an edit-row
  button `✦ Fill…` (behind `⋯` if width demands) AND an `Edit ▾` row,
  both opening the Ask sheet with the target row pre-shaped from the
  lasso or the bars in view. The top-bar `✦ Ask` works too: prose like
  "fill bars 9–12 with chords" yields a take — against the target row
  as it stands at send time.
- **Target is resolved at send time, in the UI, never by the model.**
  The target row's picker defaults to a NEW track unless an existing
  track is empty in the span; its status line says exactly what a take
  replaces by onset ("replaces 0 notes in bars 9–12 on pulse2; 1 note
  from bar 8 sustains into the span"). The model has no `track` field.
  The reply bubble names the target it applied to. The row is built
  with `getElementById`/`createElement` only (no `querySelector` —
  the vm document stub has none) so its default rule is vm-testable.
- **Gates, identical to the Bassist:** `editableSong()` (never on FF1
  / locked songs — most of the spoiler surface is gone by
  construction), meter-change refusal, drums refusal. Refusals say why
  in the bubble.
- **Take schema**, enforced where the server enforces, validated
  always:
  ```
  { "span": {"fromBar":9, "toBar":12},
    "notes": [ {"bar":9, "beat":1, "dur":2, "pitch":"C3"}, … ],
    "why": "one sentence" }
  ```
  Validation: bars inside the requested span; beat ≥ 1 and
  < `beatsPerBarDisp()` + 1; `dur` > 0 in display beats; pitch parses
  (letter + up to two ASCII accidentals (`#`/`b`, `##`/`bb`, as
  `keySpelling` emits) + octave, or MIDI number — a NEW `parsePitch`,
  pinned to `pitchName`'s convention `octave = floor(p/12) − 1`, so
  C4 = 60 and the C3 the model read in the dump is 48; a round-trip
  vm test) into a fixed window 24–108 (no per-voice range data exists
  today); ≤ 256 notes. **Stacked notes (several at once on one
  track) vs one-note-at-a-time (Josh's ruling 2026-09-25): depends on
  the song; if the ask and the track's existing notes don't make it
  clear, the model ASKS before generating** — the prompt says so, and
  a take that arrives without that clarity is still validated (both
  shapes are app-legal; Insert chord already stacks notes). A stacked
  take on a pulse track is not NES-legal; spreading it across channels
  is out of scope for v1. Frame: display bars/beats → ticks via `beatTicks()`; the
  writer adds `chopS` on the `rawNotes` mirror. vm fixtures: a chop
  applied; a 6/8 song.
- **Bad take:** first error shown in the bubble + **Retry**, which
  sends the error text as the next user turn (small models fix JSON
  on the second try far more often than the first). Three failures →
  stop, say so.
- **Valid take → applied immediately** through
  `applyTake(ti, t0, t1, notes)` — `notes` in ticks as `{t, d, p, v}` —
  extracted from `bsGenerate` in P2a and re-pointed for the Bassist.
  Invariants it preserves: onset-scoped erase via `gone` (no splice),
  `ri` mirror on erase, `added: !isComposition()`, `rawNotes` mirror
  with `chopS`, velocity clamp 1–127 and 20-tick duration floor, ONE
  group undo with a created track folded in, `saveEdits()`,
  `computeSongEnd()`, `buildScoreModel()` if score view, `draw()`. LLM
  notes carry no velocity: they get the Bassist's metric rule
  (`vFor`: 96 downbeat / 88 on-beat / 78 off-beat) WITHOUT its
  chord-change bonus or rng jitter — so LLM takes and their chips
  replay byte-for-byte, and a take sounds like the rest of the app.
  (The golden fixture is a separate guard: it pins `bsGenerate`'s
  existing jittered output across the extraction.)
  **Before extraction, a golden fixture:** a handful of (seed, opts) →
  full note list JSON incl. `v` and order, plus the undo-entry shape,
  asserted first, then `bsGenerate` is touched. "One ⟲ restores what
  was there."
- **Take chips** (1 · 2 · 3 …, cap 8, session-ephemeral) store the
  validated take JSON (span, notes, `why`) — an LLM take has no seed to
  replay. Flipping a chip is one more `applyTake` and one more ⟲ entry.
  **Another** re-sends the ask with "a different take". Nothing is
  pending across sheet close or Escape — the song is always in a
  definite state.
- **`why` is not displayed by default** — kept with the take, shown
  behind a tap ("why?") pending Josh's ruling (§10.5): the Bassist's
  harmonic reading is never displayed by his own bounded override, and
  a verdict attached to every take is not on-demand.
- **Accept never writes annotations.** Notes only. Naming what it
  wrote is his.

## 6. What it does NOT do (v1)

- No tool use / agent loop; no "play it", no annotation edits, no
  multi-step plans.
- No drums (Drummer's), no audio tracks, no tempo/meter changes, no
  ghost preview, no audition, no chord-to-channels spreading.
- No markdown, images. **Voice input:** not built — on the iPad the
  keyboard's mic dictates into the chat box already (zero code); a
  mic button in the sheet (Web Speech API, Safari-supported) is a
  later item if keyboard dictation annoys him. Spoken replies: no.
- No analysis it wasn't asked for; the sheet never volunteers.
- No cloud key field in v1.

## 7. Phases and session estimates

Each phase ships and runs the full checklist (help sheet — touch
gesture first, keyboard after; `node tools/build_help.mjs`; a FEATURES
keyword unique to the new help entry; NIGHT-ROLL.md section;
open-items; browser verify; push + `gh run watch`). P0 is exempt from
the help-sheet/FEATURES items (nothing user-facing); NIGHT-ROLL.md
gets one line that `probe.html` exists, and it stays in the repo as
the capability probe for future devices — a diagnostic page, not part
of the app; the one-file convention (index.html) is untouched.

- **P0 — probes (½ session; one committed, unlinked `probe.html` in
  the spirit of `?perf=1`, nothing user-facing):** in order —
  (1) Chrome on the Mac: https Pages page → `http://localhost:1234`
  fetch, and the Local Network Access prompt on his Chrome version;
  (2) Safari on the Mac: the same fetch; (3) on the iPad, `probe.html`
  over Pages (WebGPU needs a secure context — `file://` and the Mac's
  localhost won't do): `navigator.gpu.requestAdapter()` limits/
  features, then the smallest WebLLM model, which also answers
  COOP/COEP; (4) if §10.10 is yes, `tailscale serve --help` for the
  exact Serve flags. Written go/no-go per item; §3's text and P3 depend
  on it.
- **P1a — chat on the Mac (1 session):** rewrite context (§4, one
  frame, profiles), adapter + remote backend, SSE parser global,
  `✦ Ask`, ■ Stop, listener-mode hide, status estimate; prefs in
  `cfg()` with plain URL/model/window fields in Settings (no Test
  button yet). Verified against LM Studio on his Mac in Chrome. Useful
  alone (tutor).
- **P1b — Settings block + Test connection (½–1 session):** model
  dropdown from `/v1/models`, five failure classes, per-host
  acknowledgement, route docs.
- **P2a — generation, Bassist contract (1–2 sessions):** golden
  fixture → `applyTake` extraction (Bassist re-pointed, fixture
  green), schema + degrade probe, validator, gates, target row +
  status line, edit-row + Edit ▾ entries, take chips, Retry loop,
  `why` behind a tap. Verified by ear on a scratch composition — never
  his songs.
- **P2b — ghost + audition (only if he asks after P2a; 2 sessions):**
  a proposal-notes global honored by roll and tracks renderers, score
  view shows nothing, a scheduler path for an arbitrary note list with
  in-range mute.
- **P3 — in-browser backend (1 session, only if P0's iPad probe
  passes):** WebLLM adapter, curated menu, download/cache state, lazy
  import, CDN-vs-vendor per §10.
- **P4 — iPad → MacBook (½ session + Josh's Tailscale setup):** field
  test of route 1 from the iPad.
- **P5 — cloud (deferred).**

## 8. Tests

- vm: SSE parser on canned chunks; backend selection from `cfg()`;
  context block reports the DECLARED meter on a 6/8-annotated song,
  includes the composition flag and span notes with the no-key header
  when no key is declared over the span and the declared-key line
  when one is; 6/8 round-trip (serialize → take → ticks); budget
  profiles trim in the stated order; chat storage cap holds and never
  throws; validator — one failing fixture per rule, plus a chopped-song
  fixture; Bassist golden fixture unchanged across the `applyTake`
  extraction; `applyTake` = exactly one undo entry, onset-scoped erase,
  `ri`/`added`/clamp invariants; gates refuse on locked song / meter
  change / drums; the picker never defaults onto a track with notes in
  the span. Tests install their own `fetch` stub.
- e2e (CI only): `✦ Ask` and `✦ Fill…` added to the button-wiring
  sweep; sheet visible; Settings block present. Model URL handled by an
  explicit `page.route(...).fulfill`; whether a later route wins over
  helpers.mjs's abort-all is UNVERIFIED — the fallback that needs no
  precedence guarantee is narrowing the abort pattern in helpers.mjs to
  exclude the fixture URL. The fixture URL is never `localhost:1234`.
- Manual checklist in NIGHT-ROLL.md: LM Studio on Mac (Chrome; Safari
  if P0 allows), iPad via route 1, WebLLM on iPad if P3 ships.

## 9. Risks

1. **Small-model quality** — plain fills, confident wrong theory. The
   prompt tells the model to say "not sure"; his Mac runs a 35B. `why`
   (when shown) makes wrongness visible.
2. **JSON compliance** — enforced only where the server enforces; the
   degrade probe + validator + Retry cover the rest.
3. **Reachability** — Safari-localhost, LNA prompts, Tailscale flags
   all UNVERIFIED until P0. The Test button turns each into a named
   class with a fix line.
4. **iPad in-browser** — WebGPU limits, memory ceiling, Cache API
   eviction (a 2.5 GB re-download), `navigator.storage.persist()`
   behavior: all UNVERIFIED; P3 is not budgeted until P0 passes.
5. **Inference on the composing machine** — a 27B model on the Mac
   that runs the audio engine will glitch playback. "Another computer"
   is the fix; the status line warns when the URL is local and a
   request is in flight while playing.
6. **Context size** — the §4 profiles; the model is told what was cut;
   `aiWindow` is a user field because `/v1/models` may not report it.
7. **Draft safety** — chat storage caps and try/catch (§4); the vm cap
   test.
8. **Third-party runtime dependency** (WebLLM via CDN + HF weights) —
   availability and offline consequences; Josh's decision.
9. **Bassist regression** during the `applyTake` extraction — the
   golden fixture is the guard.

## 10. Decisions for Josh

1. `✦ Ask` (top bar) + `✦ Fill…` (edit row / Edit ▾) as the entries.
   (Not raised with Josh; a naming call I'll make unless he objects.)
2. Compositions flip: in YOUR songs, when you ask, may the tutor name
   what you wrote? **RULED (Josh, 2026-09-25): no flip.** Same rules
   everywhere as the web-session file: hints and direction by
   default; when he says he gives up and asks to be told, it tells
   him. Judged from the conversation.
3. Apply-immediately + one ⟲ + take chips (the Bassist's contract) for
   v1; ghost/audition only if you ask after using it. **RULED yes
   (Josh, 2026-09-25): "exactly the way the Bassist and Drummer
   already work."**
4. Model never picks the target track; the target row does, at send
   time, defaulting to a new track. (Proposed: yes.)
5. May a take's `why` line show inline, overriding the Bassist's
   never-displayed rule for its harmonic reading? **RULED (Josh,
   2026-09-25): behind a "why?" tap.** "I would like to figure out
   what it did on my own." Revisit if composing changes his mind.
6. Where may your annotations and notes be sent? (a) Your own
   machines over the tailnet/LAN: proposed yes, one acknowledgement
   per new host. (b) Any
   other OpenAI-compatible host: allowed at all in v1? **RULED yes
   (Josh, 2026-09-25): any address, with the one-time warning.** ("It's
   just notes and music.")
7. Ask sheet available on locked FF1 songs for tutoring, prompt-guarded
   only, generator refusing? **RULED yes (Josh, 2026-09-25):** hints
   first, answers only if he insists — the same rules the web-session
   file follows.
8. WebLLM: load from jsdelivr + HuggingFace (first hosted runtime
   dependency, no offline) vs vendor under `vendor/` (multi-file +
   wasm + workers, large). **Josh doesn't care (2026-09-25) → CDN;**
   revisit with the PWA phase.
9. Curated WebLLM menu vs full prebuilt list. (Proposed: curated; not
   raised.) Note for Josh's §10.8 question: the MODEL file is saved on
   the device after its first download and loads from there after;
   the code library is fetched once and browser-cached the same way.
10. Tailscale on both devices as the iPad route. **RULED yes (Josh,
    2026-09-25).**
11. Chat history kept per song on the device, stripped, capped.
    (Proposed: yes; not raised with Josh — conversations are the
    point, so history stays.)
12. Stacked notes on one track vs one-note-at-a-time: **RULED (Josh,
    2026-09-25): depends on the song — sometimes a track is just
    chords, sometimes it must be monophonic for the NES. If the
    context doesn't make it clear, the model asks.** Spreading across
    channels later.
13. Settled in §4, flagged for visibility: the model reads and writes
    YOUR beat — display bars and display beats of the declared meter —
    not quarter notes.

## 11. Advisor rounds (2026-09-25) — what changed

**Round 1** (7 blockers, 20 should-fixes): branch `chatContext()` dead
on main (rewrite, audit list); context re-sent per turn quadratically
(send once, strip on save, budgets); chat storage vs bare `saveDraft`
(caps, try/catch, drafts win); model choosing the track (UI picks;
contract restated verbatim); ghost/audition don't exist (dropped from
v1; Bassist contract); `editableSong()` + meter/drums gates missing
(added); mandatory prose line = ambient verdict (behind a tap, Josh's
ruling). Should-fixes: apply sequence named + `applyTake` extraction;
no range tables (fixed window); dump_notes shape corrected; `effTs()`
for meter; menu/row parity; listener mode; CDN is the new thing, not
lazy import; Tailscale flags + prerequisites + same-origin route;
Safari-localhost and LNA marked UNVERIFIED and probed first; iPad
WebLLM probe before P3; `lms ls` recorded; json_schema degrade; harness
limits; e2e route fulfill; `cfg()` one-Save; data-leaves-device
acknowledgement; phases re-split; chop frame; decision list expanded.

**Round 2** (2 blockers, 9 should-fixes): serializer in quarters vs
validator in display beats — one frame, display beats everywhere,
6/8 round-trip test; prose-path takes had no resolved target — target
row always visible on editable songs, resolved at send time, model has
no `track` field; `applyTake` real signature (ticks) + invariants +
default velocity; golden fixture before extraction; take chips store
take JSON, not seeds; key out of `cfg()` (own localStorage key), flat
`ai*` fields for the shallow merge; `notesTxtFor()` as the serializer
base with three deltas and one speller; onset-scoped replace stated,
sustaining notes in the status line; budget profiles by window + trim
order + `aiWindow` field; `lastUsed` for eviction; listener mechanism
(`applyListener()`, CSS list); P0 needs a committed `probe.html` over
Pages, ordered, Tailscale item conditional; comma-joined dump example;
NES-legality of chorded takes (§10.12); Playwright route precedence
UNVERIFIED + fallback; §10.6 split into own-machines vs other hosts;
beat frame surfaced as §10.13.

**Round 3** (no blockers, 6 should-fixes): speller is
`sfDeclaredAt` (null → sharps), `previewSf` bypassed; key header line
conditioned on a declared key over the span, not the album; velocity
= `vFor` metric rule without bonus/jitter; the target row's span owns
the request (frozen at Send); `aiWindow` defaults per backend, set
from the server when reported, throttle legible; consent per host,
localhost exempt. Nits: P0 checklist exemption; target row without
`querySelector`; `parsePitch` octave convention pinned.

**Round 4: CONVERGED.** Eight text nits applied: §8 header axis;
P1b wording; `sfDeclaredAtRaw` as the preview bypass mechanism;
double accidentals in `parsePitch`; fixture vs LLM replay claims
split; target-row parenthetical; small-profile suffix only on small;
`probe.html` is diagnostic, one-file convention untouched.
