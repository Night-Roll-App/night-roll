# docs/ — what is in here

The app's technical reference is [NIGHT-ROLL.md](../NIGHT-ROLL.md) at the
root; this folder holds the manual, the design records behind shipped
features, the plans, and the learning material. Nothing here is served by
the app.

## This folder

| File | What it is |
|---|---|
| [HELP.md](HELP.md) | The user manual — GENERATED from `help/help.html` + the help tabs by `node tools/build_help.mjs`; never hand-edited. |
| [split-plan.md](split-plan.md) | index.html → ES modules (no build step): the layer rules, the module map conventions, the port-import rules `tools/split/check.mjs` enforces. |
| [split-phase2-plan.md](split-phase2-plan.md) | Phase 2 of the split: the untangle pass. |
| [adding-a-console.md](adding-a-console.md) | The whole checklist for supporting a new console's music format. |
| [provenance-plan.md](provenance-plan.md) | Song origins, the one rule table, one publish function, annotations v2. |
| [annotations-v2.md](annotations-v2.md) / [annotations-v2.schema.json](annotations-v2.schema.json) | The `.rollnotes.json` v2 format and its JSON schema. |
| [migration-dry-run.txt](migration-dry-run.txt) | Output of `tools/migrate-rollnotes-v2.mjs --dry-run` (the v1 → v2 batch). |
| [ai-library-plan.md](ai-library-plan.md) | Night Roll's AI support → its own library (`Night-Roll-App/claude-bridge`, vendored under `vendor/ai/`). |
| [ask-token-plan.md](ask-token-plan.md) | Token-efficient ✦ Ask. |
| [daw-inventory.md](daw-inventory.md) | Night Roll vs Logic Pro for iPad and other DAWs — what exists, what is missing. |
| [song-organization-proposal.md](song-organization-proposal.md) | A proposal for how songs are organized (not built). |
| [import-hub-design.md](import-hub-design.md) | The Import hub. |
| [declared-vs-learner-spec.md](declared-vs-learner-spec.md) | An imported file's own key/meter vs the learner's answers. |
| [streamed-render-plan.md](streamed-render-plan.md) | Streamed console render. |
| [chrome-density-plan.md](chrome-density-plan.md) / [footer-redesign-plan.md](footer-redesign-plan.md) | UI chrome passes. |
| [release-sweep-2026-09-29.md](release-sweep-2026-09-29.md) | The automatic half of the release gate, as run. |
| [app-store-listing.md](app-store-listing.md) / [promo-video-script.md](promo-video-script.md) | App Store copy and the promo script (each line sourced to a shipped feature). |
| [icon-audit.html](icon-audit.html) | The icon audit page (open in a browser). |

## design/ — records of shipped features

Advisor-reviewed designs, kept as written. The living reference for each is
the matching NIGHT-ROLL.md section.

| File | Feature |
|---|---|
| [design/score-view-plan.md](design/score-view-plan.md) | The engraved score view (history and limitations). |
| [design/local-folder-design.md](design/local-folder-design.md) | Local folder mode — saving without GitHub. |
| [design/wave-tracks-design.md](design/wave-tracks-design.md) | Audio ("wave") tracks beside the chip voices. |
| [design/local-llm-design.md](design/local-llm-design.md) | ✦ Ask — in-app AI with local models; Josh's rulings in §10. |
| [design/capture-jobs-design.md](design/capture-jobs-design.md) | Background jobs (captures first, then publishes). |

## plans/ — plans in flight

Dated plans and the execution order that sequences them
([plans/2026-10-04-ORDER.md](plans/2026-10-04-ORDER.md)), plus per-console
plans (`genesis.md`, `ps2.md`, `xbox.md`). A plan is a record of what was
decided; `open-items.md` at the root is the queue.

## learning/ — the study itself

Night Roll exists to learn composition from game music; these are the
working documents of that study. Analysis sessions
([WEB-SESSION.md](../WEB-SESSION.md)) read them.

| File | What it is |
|---|---|
| [learning/quizzes.md](learning/quizzes.md) | Quiz protocol + question bank; sessions open with ~5 from here. |
| [learning/supplemental-learning.md](learning/supplemental-learning.md) | Session log — the concept source each quiz batch comes from. |
| [learning/glossary.md](learning/glossary.md) | Terms ENCOUNTERED vs DEMONSTRATED, each anchored to real music. |
| [learning/ANALYSIS_CURRICULUM.md](learning/ANALYSIS_CURRICULUM.md) | A PARKED proposal (2026-08-23); nothing in it is built or agreed. |
