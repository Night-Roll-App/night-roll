// src/edition.js — EDITION: "web" is this site; the packager
// (tools/package.mjs) rewrites this ONE line to "app" for the iPad build.
// The app edition hides what only makes sense on the public study site
// (class="webonly"), nothing else changes. docs/split-plan.md §1: this is
// the packager's one-line change.
export const EDITION = "web";
// The ✦ AI panel needs the Mac bridge or a model server the user runs; the store build (tools/package.mjs --store)
// flips this ONE line to false and the UI entries (button, panel, Settings tab) hide via body[data-ai="off"].
export const AI_ENABLED = true;
// The site's own home: its repos, its public address, its manual. Every
// mention of them in src/ goes through these names so that the STORE build
// (tools/package.mjs --store, the TestFlight/App Store bundle) can blank
// them in this one file: that app knows no repo until the user names one
// in Settings, reads the bundled starters, and shows no link to the site's
// GitHub (Josh #998: no game music and no link to the repo that holds it
// ships to the store; the ability to import does). Josh's own iPad build
// (build-ipad.sh, no --store) keeps them.
export const SITE_REPO = "Night-Roll-App/night-roll";
export const SITE_NSF_REPO = "Night-Roll-App/nsf-archive";
export const SITE_URL = "https://night-roll-app.github.io/night-roll/";
export const SITE_HOME = "https://github.com/Night-Roll-App/night-roll";
// the repos' owner before the organization (2026-09-29): saved settings naming it are read as the new home
export const SITE_OLD_OWNER = "joshcough";
// "" when the edition has no site to point at (the store build)
export const SITE_HELP = SITE_HOME ? SITE_HOME + "/blob/main/docs/HELP.md" : "";
