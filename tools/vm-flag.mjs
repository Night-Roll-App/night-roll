// tools/vm-flag.mjs — import this FIRST (before tests/harness.mjs or
// anything that uses it) in any tool meant to be run directly, e.g.
// `node tools/at.mjs …` (docs/split-plan.md §3.5). vm.SourceTextModule is
// experimental (Node 22/23) and only exists under --experimental-vm-modules;
// package.json's test scripts always carry the flag, but a bare `node
// tools/x.mjs` invocation doesn't, so: if it's missing, re-exec this same
// command with the flag added, inheriting stdio, and exit with the child's
// status. A no-op once the flag is already present (including when node
// itself eventually ships vm.SourceTextModule unflagged).
import vm from "node:vm";
import { spawnSync } from "node:child_process";

if (typeof vm.SourceTextModule !== "function") {
  const result = spawnSync(process.execPath, ["--experimental-vm-modules", ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(result.status === null ? 1 : result.status);
}
