#!/usr/bin/env node
// tools/build_ask_help.mjs — writes the Help sheet's "AI commands" rows into
// help/help.html between its ask-commands markers, from the act registry
// (src/ask/actions.js: askHelpCommandsHTML over ASK_ACTIONS — every
// Ask command is an action since batch 3, 2026-10-05), so the sheet lists exactly what Ask can do and
// how to say it (Josh via Ask #451). Harness-backed, like the query tools:
// the registry's run() closures import app modules, so the registry loads
// only inside the vm app. Run it after adding or rewording an action, then
// `node tools/build_help.mjs` for docs/HELP.md; the vm test "act: the Help
// sheet's AI commands rows are generated from the registry…" fails while
// the file is stale. Node-only, never shipped.
import "./vm-flag.mjs"; // first: re-execs with --experimental-vm-modules if missing
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../tests/harness.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(ROOT, "help", "help.html");
export const ASK_COMMANDS_RE = /(<!-- ask-commands:begin[^>]*-->\n)([\s\S]*?)[ \t]*<!-- ask-commands:end -->/;

const app = await createApp({storage: {"ff1roll-mode": "learning"}});
const rows = app.run(`askHelpCommandsHTML()`);
const html = readFileSync(FILE, "utf8");
if (!ASK_COMMANDS_RE.test(html)) { console.error("help/help.html: the ask-commands markers are missing"); process.exit(1); }
const next = html.replace(ASK_COMMANDS_RE, (m, a) => a + "      " + rows + "\n      <!-- ask-commands:end -->");
if (next === html) console.log("help/help.html: the AI commands rows are already current");
else { writeFileSync(FILE, next); console.log("help/help.html: AI commands rows written (" + rows.split("\n").length + " rows) — now run: node tools/build_help.mjs"); }
process.exit(0);
