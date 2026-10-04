#!/usr/bin/env node
// tools/claude-bridge.mjs — Night Roll's shim onto the claude-bridge
// library (docs/ai-library-plan.md §2 step 2): the server itself, every
// flag, and the CLI (--say/--status/--deploy-wait/…) now live in
// vendor/ai/bridge/server.mjs, synced from Night-Roll-App/claude-bridge by
// tools/ai-sync.mjs. Night Roll's own system prompts, state-directory name,
// the /shapes mount and the startup-banner text live in tools/ai-profile.mjs
// instead of here. This file's path, and every flag that used to work
// against it (`npm run bridge`, the launchd plist, `node tools/claude-bridge.mjs
// --say "…"`, …), keep working unchanged — see NIGHT-ROLL.md's bridge
// section for the update flow (`node tools/ai-sync.mjs --ref vX`, then a
// launchd kickstart).
import { main } from "../vendor/ai/bridge/server.mjs";
import { profile } from "./ai-profile.mjs";

main(process.argv, profile);
