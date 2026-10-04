// tests/bridge.test.mjs — tools/claude-bridge.mjs, Night Roll's shim onto
// the claude-bridge library (docs/ai-library-plan.md §2 step 2). The
// server's own mechanics (jobs, sessions, deploy safeguards, the tool-call
// repair, auto-compact, …) are covered by the library's own
// tests/bridge.test.mjs against a neutral profile — this file only proves
// the shim wires Night Roll's own profile (tools/ai-profile.mjs) into the
// library's generic vendor/ai/bridge/server.mjs correctly: health/models
// with Claude off, the /shapes mount, the Learning-mode system prompt, and
// the default --repo.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SHIM = fileURLToPath(new URL("../tools/claude-bridge.mjs", import.meta.url));
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // tests/.. — same default tools/ai-profile.mjs computes from tools/..

function startShim(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SHIM, ...args], {env: {...process.env, ...(env || {})}, stdio: ["ignore", "pipe", "pipe"]});
    let out = "";
    child.stdout.on("data", d => { out += d; if (/night-roll bridge:/.test(out) && /jobs:/.test(out)) resolve({child, out}); });
    child.stderr.on("data", d => { out += d; });
    child.on("exit", code => reject(new Error("bridge exited " + code + "\n" + out)));
    setTimeout(() => reject(new Error("bridge did not start\n" + out)), 8000);
  });
}

test("bridge-shim: /health, /v1/models with Claude off, and the startup banner carries Night Roll's profile.label", async t => {
  const jobsDir = mkdtempSync(path.join(tmpdir(), "nr-shim-"));
  const port = 22000 + Math.floor(Math.random() * 1000);
  const {child, out} = await startShim(["--no-claude", "--port", String(port), "--jobs-dir", jobsDir]);
  t.after(() => { child.kill("SIGKILL"); rmSync(jobsDir, {recursive: true, force: true}); });
  assert.match(out, /night-roll bridge:/, "profile.label preserved through the shim (the exact text the old hardcoded banner printed)");
  assert.match(out, /claude code: off/);
  const B = "http://127.0.0.1:" + port;
  assert.equal((await fetch(B + "/health")).status, 200);
  const models = await (await fetch(B + "/v1/models")).json();
  assert.equal(models.object, "list");
  assert.ok(Array.isArray(models.data));
});

test("bridge-shim: --repo defaults to the repo root (tools/ai-profile.mjs's profile.repo), unchanged from the old hardcoded default", async t => {
  const dir = mkdtempSync(path.join(tmpdir(), "nr-shim-repo-"));
  const bin = path.join(dir, "fake-claude");
  writeFileSync(bin, `#!/bin/sh\n[ "$1" = "--version" ] && exit 0\ncat >/dev/null\necho '{"type":"result","subtype":"success","result":"ok","is_error":false,"total_cost_usd":0}'\n`);
  chmodSync(bin, 0o755);
  const port = 22500 + Math.floor(Math.random() * 500);
  const {child, out} = await startShim(["--port", String(port), "--jobs-dir", path.join(dir, "jobs")], {CLAUDE_BIN: bin, BRIDGE_UPSTREAMS: "none=http://127.0.0.1:9"});
  t.after(() => { child.kill("SIGKILL"); rmSync(dir, {recursive: true, force: true}); });
  assert.match(out, /claude code: yes \(read, repo /, "claude code picked up via CLAUDE_BIN");
  assert.ok(out.includes("repo " + REPO_ROOT), "no --repo flag was passed — the profile's own default filled it in: " + out);
});

test("bridge-shim: /shapes mounts profile.shapes (CHORD_SHAPES_WEB), read-only, path-escape guarded", async t => {
  const shapesDir = mkdtempSync(path.join(tmpdir(), "nr-shapes-"));
  writeFileSync(path.join(shapesDir, "index.html"), "<html>shapes fixture</html>");
  const jobsDir = mkdtempSync(path.join(tmpdir(), "nr-shim-"));
  const port = 23000 + Math.floor(Math.random() * 500);
  const {child} = await startShim(["--no-claude", "--port", String(port), "--jobs-dir", jobsDir], {CHORD_SHAPES_WEB: shapesDir});
  t.after(() => { child.kill("SIGKILL"); rmSync(jobsDir, {recursive: true, force: true}); rmSync(shapesDir, {recursive: true, force: true}); });
  const B = "http://127.0.0.1:" + port;
  const r = await fetch(B + "/shapes/index.html");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /shapes fixture/);
  const redirect = await fetch(B + "/shapes", {redirect: "manual"});
  assert.equal(redirect.status, 301);
  assert.equal((await fetch(B + "/shapes/nope.html")).status, 404);
});

test("bridge-shim: the system prompt Claude Code receives carries Night Roll's Learning-mode convention and its own docs, not the library's generic text", async t => {
  const dir = mkdtempSync(path.join(tmpdir(), "nr-shim-prompt-"));
  const argsLog = path.join(dir, "args.log"), bin = path.join(dir, "fake-claude");
  writeFileSync(bin, `#!/bin/sh
[ "$1" = "--version" ] && exit 0
printf '%s\\n' "$*" >> "${argsLog}"
cat >/dev/null
echo '{"type":"result","subtype":"success","result":"ok","is_error":false,"total_cost_usd":0,"usage":{"input_tokens":1,"output_tokens":1,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}'
`);
  chmodSync(bin, 0o755);
  const port = 24000 + Math.floor(Math.random() * 500);
  const {child} = await startShim(["--port", String(port), "--jobs-dir", path.join(dir, "jobs")], {CLAUDE_BIN: bin, BRIDGE_UPSTREAMS: "none=http://127.0.0.1:9"});
  t.after(() => { child.kill("SIGKILL"); rmSync(dir, {recursive: true, force: true}); });
  await fetch("http://127.0.0.1:" + port + "/v1/chat/completions", {
    method: "POST", headers: {"content-type": "application/json", "x-nr-song": "s"},
    body: JSON.stringify({model: "claude-code", messages: [{role: "user", content: "hi"}]}),
  }).then(r => r.text());
  for (let i = 0; i < 50 && !existsSync(argsLog); i++) await sleep(100);
  assert.ok(existsSync(argsLog), "claude was invoked");
  const line = readFileSync(argsLog, "utf8");
  assert.match(line, /learning = hint, never name keys\/chords\/meter/, "the Learning-mode convention (BRIDGE_SYS_MODE) reached the system prompt");
  assert.match(line, /NIGHT-ROLL\.md is the app's technical reference/, "Night Roll's own doc pointers (BRIDGE_SYS_READ\\/FULL) reached the system prompt");
  assert.doesNotMatch(line, /You are a test assistant\./, "not the library's own neutral test prompt");
});
