// src/edition.js — EDITION: "web" is this site; the packager
// (tools/package.mjs) rewrites this ONE line to "app" for the store build.
// The app edition hides what only makes sense on the public study site
// (class="webonly"), nothing else changes. docs/split-plan.md §1: this is
// the packager's one-line change.
export const EDITION = "web";
