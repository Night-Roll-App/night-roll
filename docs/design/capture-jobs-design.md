# Capture jobs — design (advisor review, 2026-09-27)

Josh's request (iPad, 2026-09-27): "we ought to have some sort of a job
system where the captures go off into long-running jobs and you can
reopen them to look at what they're doing later — you should not feel
worried about minimizing or even closing that capture window as it
goes." Scope: captures and the publishes of those captures first;
"maybe there's more". This is the design an implementing session
follows, in small commits. Line numbers are as of fa5df43 and will
drift; names less so. Anything marked UNVERIFIED was not checked on a
device.

## 1. Job model

A job is a plain record, no bytes inside:

```
{id, kind: "capture" | "publish", slug, title,
 state: "queued" | "running" | "done" | "failed" | "cancelled" | "interrupted",
 items: [{label, st: "queued" | "running" | "done" | "failed" | "silent" | "cancelled", pct, msg, key}],
 note, started, ended, err}
```

Lives in a `jobs` array in memory, mirrored to localStorage
`ff1roll-jobs` (device-local UI state, allowed by CLAUDE.md;
synchronous, readable at boot before IndexedDB opens). The real output
— drafts — already lands through `draftWrite` (~L13568) and
`idbNsfPut` (~L13528). Persist immediately on status changes, throttled
~250 ms for pct.

Survival:

- Closing the panel: `#impclose` (~L13431) already only hides; the
  runner holds no DOM refs — rows render FROM `job.items`, the inverse
  of today's `impCapture` writing `row.st.textContent` (~L13322–13396).
- Suspended tab: JS pauses and the promise chain resumes on wake;
  nothing to repair. Say so in the footer at job start.
- Reload / tab death: boot reads `ff1roll-jobs`; any `running` job
  becomes `interrupted` with its last item's pct and phase. This
  REPLACES the `ff1roll-capcrash` sessionStorage beacon (~L13327–13337,
  ~L17848–17857): the mirror carries the same numbers and survives a
  closed tab, which sessionStorage does not.
- Resume rules. capture: `↻ Resume` re-runs items without a `done`
  draft (the `draftStoreKey(key)` pattern, ~L11966 / ~L13288). nsf/gbs
  re-load bytes from `idbNsfGet(slug).bytes` (~L13588); spc keeps bytes
  only for captured tracks (~L13385); vgm/psf/usf keep none
  (`keepBytes: false`, ~L13025) — the row says "re-pick the set to
  finish (40 of 92 saved)", and `openChipImport` (~L13194) of the same
  slug attaches to the interrupted job, pre-marking rows whose draft
  exists. publish: `commitImports` deletes drafts only after success
  (~L13701–13705) and archive uploads check-before-PUT (~L13649,
  ~L13662), so retry = re-run `commitImports(status, importDraftKeys()
  for that slug)` — idempotent.

## 2. UI

- Footer chip `⏳ N` next to `#errbtn` (~L912), styled like
  `#askreplybtn` (~L913): gold while running, dim when done, hidden
  when none. `setInfo` (~L4933) one-liners at start ("⏳ capturing
  Chrono Trigger — close this panel any time; ⏳ in the footer shows
  progress") and end ("✓ 90 of 92 saved — tap ⏳").
- `#jobssheet` overlay in the `#errsheet` shape (~L1571–1579): one row
  per job — title, "12/92 · Frog's Theme 40%", then one-tap buttons:
  `Open` (capture: shows `#importsheet` as a view via
  `impShowJob(job)`; publish: `fsubImportAlbum(slug)`, ~L12621), `✕`
  (running → cancel), `↻` (retry failed/undone), `✕` (done → dismiss).
- The import panel becomes a view: `nsfSess` (~L12947) stays the SOURCE
  (bytes, modules, libs); `impRenderRows(job)` paints `.st` / open / ↻
  from items; `#impall` shows "⏳ 12/92" disabled while its job runs
  (the `impCommitLive` trick, ~L12633). A `jobsOnChange` subscriber
  re-renders only when the panel shows that job.
- `commitImports`' `status(s)` callback (~L13600) becomes `job.note(s)`;
  `impCommitLive` (~L12620) is replaced by `jobsFind("publish", slug)`;
  `fsubImportAlbum` reads the job for its button text.

## 3. Operations → jobs, and the API

```
jobStart(kind, title, items, runner, {slug}) → job   // runner(job, signal): async
job.update(i, patch)   // {st, pct, msg, key} → persist + notify
job.note(text)         // job-level line (publish progress)
job.done() / job.fail(err) / job.cancel()
jobsList(), jobsFind(kind, slug), jobsOnChange(fn), jobsDismiss(id), jobsRetry(id)
```

First: captures (`#impall`, ~L13414, and the single-row `capture`,
~L13242, both produce a capture job; a single row = a one-item job) and
publish of an import set (`#impcommit`, ~L13433; the folder button,
~L12634). Later: Publish all (`#ghsaveall` loop, ~L17810–17834, one
item per song); chip renders only as a row while running (the worker is
already off-thread, `chipRenderInWorker` ~L7321 — a row per song open
would spam the list, so opt-in); moving captures into
`tools/chip-worker.mjs` (RUNNERS has nsf/gbs/spc emulation, but
reconstruct/detectLoop/makeMidi and the PSF/USF `capture` with
DecompressionStream in a worker are UNVERIFIED on iPad Safari).
Download audio (~L12880) is NOT a job: it records real-time playback
and needs the foreground.

## 4. Concurrency and cancellation

- One capture job at a time (main-thread emulation; two would double
  the watchdog risk, ~L13144–13148). A second Capture all says "a
  capture is running: X 12/92 — tap ⏳" via `impStatus` (~L13273).
  Publish jobs: one per slug, others `queued` and run in order.
- Renders vs captures: independent (worker vs main thread); unchanged.
- Cancel: closing the panel never cancels; `✕` on the job sets
  `signal.aborted`; the runner checks between items and the pct tick
  throws inside an item, the way `alive()` (~L7285) aborts a stale
  render. Cancelled items keep nothing; done ones stay drafts.
- Publish while a capture of the same slug runs: allowed, snapshot
  semantics — the publish job takes the keys whose drafts exist at
  start (`commitImports(status, keys)` already accepts a list and reads
  drafts up front via `draftRead`, ~L13609); its note says "publishing
  the 40 done; 52 still capturing — publish again after". A later
  re-capture of a published key just becomes "changed since publish".

## 5. Commits (each shippable alone)

Each: help entry in `#helpsheet` under "Move a sheet"; `node
tools/build_help.mjs`; a FEATURES keyword in tests/night-roll.test.mjs;
an open-items.md line under "CAPTURES AS BACKGROUND JOBS".

1. Job core + `⏳` chip + `#jobssheet`, no producers. vm test with a
   fake runner: states, persistence, `interrupted` at boot. FEATURES
   `"⏳"`. NIGHT-ROLL: new section "Jobs (footer ⏳)" after "Chip render
   in a Worker".
2. Capture all / row capture → capture job; the panel renders from
   items; beacon removed; nsf/gbs resume from IDB; the per-file
   "re-pick" attach. Verify in Chrome: close the panel mid-run, reopen
   from ⏳, reload mid-run → interrupted row with count. FEATURES
   `"never cancels"`.
3. Publish (panel + folder button) → publish job; `impCommitLive`
   deleted; the help text "keeps going if you leave the menu" rewritten
   to point at ⏳ (keep that keyword or swap it in FEATURES). FEATURES
   `"↻ retry"`.
4. Cancel, retry, the concurrency guard, publish-while-capturing
   snapshot. FEATURES `"✕ on a job"`.
5. Publish all as a job (optional). Later branch: captures in the
   worker.
