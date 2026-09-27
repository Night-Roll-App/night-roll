// tests/bridge.test.mjs — the AI bridge against a fake OpenAI upstream:
// model merging, a streamed job that survives a dropped client, re-attach
// replay, GET /v1/jobs/:id, DELETE, the token gate. No Claude Code needed
// (--no-claude); no network beyond 127.0.0.1.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// a fake OpenAI server: /v1/models lists two ids; /v1/chat/completions streams
// five words slowly (so a client can drop mid-way), or a tool call on request
function fakeUpstream() {
  return new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      if (req.url === "/v1/models") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({data: [{id: "fake-7b"}, {id: "shared-id"}]})); }
      let body = ""; for await (const d of req) body += d;
      const j = JSON.parse(body);
      res.writeHead(200, {"content-type": "text/event-stream"});
      const send = o => res.write("data: " + JSON.stringify(o) + "\n\n");
      const last = (j.messages || []).slice(-1)[0] || {};
      if (/tool/i.test(last.content || "") && j.tools) {
        send({choices: [{delta: {tool_calls: [{index: 0, id: "c1", function: {name: "add_annotation", arguments: "{\"kind\":\"chord\","}}]}}]});
        send({choices: [{delta: {tool_calls: [{index: 0, function: {arguments: "\"text\":\"F#m\",\"bar\":2,\"beat\":1}"}}]}}]});
        send({choices: [{delta: {}, finish_reason: "tool_calls"}]});
      } else {
        for (const w of ["one ", "two ", "three ", "four ", "five"]) { send({choices: [{delta: {content: w}}]}); await sleep(250); }
        send({choices: [{delta: {}, finish_reason: "stop"}]});
      }
      res.write("data: [DONE]\n\n"); res.end();
    });
    srv.listen(0, "127.0.0.1", () => resolve({srv, url: "http://127.0.0.1:" + srv.address().port}));
  });
}
function startBridge(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../tools/claude-bridge.mjs", import.meta.url).pathname, ...args], {stdio: ["ignore", "pipe", "pipe"]});
    let out = "";
    child.stdout.on("data", d => { out += d; if (/night-roll bridge:/.test(out) && /jobs:/.test(out)) resolve({child, out}); });
    child.stderr.on("data", d => { out += d; });
    child.on("exit", code => reject(new Error("bridge exited " + code + "\n" + out)));
    setTimeout(() => reject(new Error("bridge did not start\n" + out)), 8000);
  });
}
async function sse(url, opts) { // collect an SSE body into chunks
  const r = await fetch(url, opts);
  const text = await r.text();
  return {status: r.status, headers: r.headers, chunks: text.split("\n").filter(l => l.startsWith("data: ") && !l.includes("[DONE]")).map(l => JSON.parse(l.slice(6)))};
}

test("bridge: models merge from upstreams, jobs survive a dropped client, replay, fetch, kill, token", async t => {
  const up1 = await fakeUpstream(), up2 = await fakeUpstream();
  const jobsDir = mkdtempSync(path.join(tmpdir(), "nr-bridge-"));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const {child, out} = await startBridge(["--no-claude", "--port", String(port), "--upstream", "alpha=" + up1.url, "--upstream", "beta=" + up2.url, "--jobs-dir", jobsDir, "--token", "t0k"]);
  t.after(() => { child.kill("SIGKILL"); up1.srv.close(); up2.srv.close(); rmSync(jobsDir, {recursive: true, force: true}); });
  const B = "http://127.0.0.1:" + port, H = {authorization: "Bearer t0k", "content-type": "application/json"};
  assert.match(out, /claude code: off/);
  // token gate
  assert.equal((await fetch(B + "/v1/models")).status, 401);
  assert.equal((await fetch(B + "/health")).status, 200);
  // models: shared ids get the upstream prefix
  const models = (await (await fetch(B + "/v1/models", {headers: H})).json()).data.map(m => m.id).sort();
  assert.deepEqual(models, ["beta/fake-7b", "beta/shared-id", "fake-7b", "shared-id"]);
  assert.deepEqual(await (await fetch(B + "/v1/jobs", {headers: H})).json(), {ok: true, running: 0, inbox: true});
  // a streamed job; the client drops after the first chunk
  const ctl = new AbortController();
  const r = await fetch(B + "/v1/chat/completions", {method: "POST", headers: {...H, "x-nr-job": "nr_t1"}, body: JSON.stringify({model: "fake-7b", stream: true, messages: [{role: "user", content: "count"}]}), signal: ctl.signal});
  assert.equal(r.headers.get("x-nr-job"), "nr_t1");
  const reader = r.body.getReader(); await reader.read(); ctl.abort();
  await sleep(200);
  let j = await (await fetch(B + "/v1/jobs/nr_t1", {headers: H})).json();
  assert.equal(j.status, "running", "the job outlives the client");
  for (let i = 0; i < 30 && j.status === "running"; i++) { await sleep(200); j = await (await fetch(B + "/v1/jobs/nr_t1", {headers: H})).json(); }
  assert.equal(j.status, "done"); assert.equal(j.text, "one two three four five"); assert.equal(j.result.content, "one two three four five");
  // re-attach: the whole reply replays
  const again = await sse(B + "/v1/chat/completions", {method: "POST", headers: {...H, "x-nr-job": "nr_t1"}, body: JSON.stringify({model: "fake-7b", stream: true, messages: []})});
  assert.equal(again.chunks.map(c => c.choices[0].delta.content || "").join(""), "one two three four five");
  assert.equal(again.chunks.slice(-1)[0].choices[0].finish_reason, "stop");
  // a tool-call reply comes through as tool_calls with the arguments assembled
  const tc = await sse(B + "/v1/chat/completions", {method: "POST", headers: {...H, "x-nr-job": "nr_t2"}, body: JSON.stringify({model: "beta/fake-7b", stream: true, tools: [{type: "function", function: {name: "add_annotation"}}], messages: [{role: "user", content: "use the tool"}]})});
  const j2 = await (await fetch(B + "/v1/jobs/nr_t2", {headers: H})).json();
  assert.equal(j2.status, "done"); assert.equal(j2.result.tool_calls[0].function.name, "add_annotation");
  assert.deepEqual(JSON.parse(j2.result.tool_calls[0].function.arguments), {kind: "chord", text: "F#m", bar: 2, beat: 1});
  assert.equal(tc.chunks.slice(-1)[0].choices[0].finish_reason, "tool_calls");
  // non-stream on a finished job
  const ns = await (await fetch(B + "/v1/chat/completions", {method: "POST", headers: {...H, "x-nr-job": "nr_t1"}, body: JSON.stringify({model: "fake-7b", messages: []})})).json();
  assert.equal(ns.choices[0].message.content, "one two three four five");
  // kill a running job
  const ctl3 = new AbortController();
  const r3 = await fetch(B + "/v1/chat/completions", {method: "POST", headers: {...H, "x-nr-job": "nr_t3"}, body: JSON.stringify({model: "fake-7b", stream: true, messages: [{role: "user", content: "count"}]}), signal: ctl3.signal});
  await r3.body.getReader().read(); ctl3.abort();
  assert.deepEqual(await (await fetch(B + "/v1/jobs/nr_t3", {method: "DELETE", headers: H})).json(), {ok: true});
  await sleep(300);
  const j3 = await (await fetch(B + "/v1/jobs/nr_t3", {headers: H})).json();
  assert.equal(j3.status, "error"); assert.equal(j3.error, "stopped");
  // unknown job
  assert.equal((await fetch(B + "/v1/jobs/nope", {headers: H})).status, 404);
  // the inbox: notes from the terminal, in order, ?since= skips what the app already showed; the probe advertises it
  assert.equal((await (await fetch(B + "/v1/jobs", {headers: H})).json()).inbox, true);
  assert.deepEqual(await (await fetch(B + "/v1/inbox", {headers: H})).json(), {last: 0, notes: []});
  assert.equal((await fetch(B + "/v1/inbox", {method: "POST", headers: H, body: JSON.stringify({text: "  "})})).status, 400);
  const n1 = await (await fetch(B + "/v1/inbox", {method: "POST", headers: H, body: JSON.stringify({text: "pushed the Game Boy branch", from: "terminal"})})).json();
  assert.equal(n1.id, 1); assert.equal(n1.from, "terminal");
  // the --say client posts to a running bridge (token from the env)
  const say = spawn(process.execPath, [new URL("../tools/claude-bridge.mjs", import.meta.url).pathname, "--say", "tests green", "--port", String(port)], {env: {...process.env, BRIDGE_TOKEN: "t0k"}, stdio: ["ignore", "pipe", "pipe"]});
  let sayOut = ""; say.stdout.on("data", d => { sayOut += d; }); say.stderr.on("data", d => { sayOut += d; });
  const sayCode = await new Promise(r => say.on("exit", r));
  assert.equal(sayCode, 0, sayOut); assert.match(sayOut, /note #2 delivered/);
  const box = await (await fetch(B + "/v1/inbox?since=1", {headers: H})).json();
  assert.equal(box.last, 2); assert.equal(box.notes.length, 1); assert.equal(box.notes[0].text, "tests green");
  assert.equal((await (await fetch(B + "/v1/inbox?since=2", {headers: H})).json()).notes.length, 0);
  assert.equal((await fetch(B + "/v1/inbox")).status, 401, "the inbox is behind the token too");
});
