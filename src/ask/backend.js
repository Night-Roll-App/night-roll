import { cfg } from "../platform/storage.js";
import { askSessionName } from "./bridge.js";
import { S } from "../state.js";
import { askEpochNote } from "./context.js";
import { askStoreKey } from "./sheet.js";
import { saveCfg } from "../platform/storage.js";
import { askRefresh } from "./sheet.js";

export function aiUrl() { return (cfg().aiUrl || "").replace(/\/+$/, ""); }
export function aiHeaders() {
  const h = {"content-type": "application/json"};
  const k = localStorage.getItem("ff1roll-aikey");
  if (k) h.authorization = "Bearer " + k;
  return h;
}
export function aiSSE(state, chunk) { // OpenAI-style SSE → text deltas; state = {buf: ""}; vm-testable on strings
  state.buf += chunk;
  const out = [];
  const lines = state.buf.split("\n");
  state.buf = lines.pop();
  for (const l of lines) {
    const t = l.trim();
    if (!t.startsWith("data:")) continue;
    const d = t.slice(5).trim();
    if (d === "[DONE]") { state.done = true; continue; }
    let j;
    try { j = JSON.parse(d); } catch (err) { continue; }
    const c = j.choices && j.choices[0];
    const txt = c && c.delta && c.delta.content;
    if (typeof txt === "string" && txt) out.push(txt);
    const think = c && c.delta && (c.delta.reasoning_content || c.delta.reasoning); // LM Studio streams Qwen's thinking apart; count it so the wait is visible
    if (typeof think === "string") {
      state.think = (state.think || 0) + think.length;
      // the bridge sends whole steps ("using Bash npm test… "); LM Studio sends
      // thinking in fragments — only a whole step becomes the visible note
      if (/^using .+…\s*$/.test(think)) state.note = think.replace(/^using /, "").replace(/…\s*$/, "").trim();
    }
    const tc = c && c.delta && c.delta.tool_calls; // OpenAI tools: name once, arguments in pieces, one slot per index
    if (Array.isArray(tc)) {
      state.tools = state.tools || [];
      for (const t of tc) {
        const i = t.index || 0;
        const slot = state.tools[i] || (state.tools[i] = {id: "", name: "", args: ""});
        if (t.id) slot.id = t.id;
        if (t.function && t.function.name) slot.name += t.function.name;
        if (t.function && typeof t.function.arguments === "string") slot.args += t.function.arguments;
      }
    }
    if (c && c.finish_reason) state.finish = c.finish_reason;
    if (j.error && j.error.message) state.error = j.error.message;
  }
  return out;
}
export function aiHostKind(url) { // "local" never prompts; everything else asks once per host
  let host = "";
  try { host = new URL(url).hostname; } catch (err) { return "bad"; }
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" ? "local" : "other";
}
export function aiRemote() { // the one adapter shape; a browser (WebLLM) backend slots in beside it later
  const url = aiUrl();
  return {
    async listModels() {
      const r = await fetch(url + "/v1/models", {headers: aiHeaders()});
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      return (j.data || []).map(m => m.id).filter(Boolean);
    },
    async chat({system, messages, signal, onDelta, schema, onStatus, tools, onTool, job, onOpen, onRound, onNote}) {
      let model = cfg().aiModel;
      const headers = aiHeaders();
      if (job) { // the bridge keeps a job alive through a dropped connection; ■ Stop kills it explicitly
        headers["x-nr-job"] = job;
        headers["x-nr-song"] = askSessionName(); // the bridge keeps one Claude Code session per song
        if (signal) signal.addEventListener("abort", () => { fetch(url + "/v1/jobs/" + encodeURIComponent(job), {method: "DELETE", headers: aiHeaders()}).catch(() => {}); }, {once: true});
      }
      if (!model) {
        if (!S.askModelCache || S.askModelCache.url !== url) S.askModelCache = {url, ids: await this.listModels()};
        model = S.askModelCache.ids[0];
        if (!model) throw new Error("the server lists no models — load one in LM Studio");
      }
      // Tool rounds (2026-09-26): the model may call app tools (annotate, read
      // another song); the app runs them and sends the results back, at most
      // a few times, then the model answers in words.
      const convo = [{role: "system", content: system}, ...messages];
      let retried = false;
      for (let round = 0; round < 5; round++) {
        const body = {model, stream: true, messages: convo};
        if (job && round) { headers["x-nr-job"] = job + "-r" + round; if (onRound) onRound(job + "-r" + round); } // a new job per tool round: the same id would replay round one's tool call forever; the caller's marker follows
        if (schema) body.response_format = {type: "json_schema", json_schema: {name: "take", strict: true, schema}};
        if (tools && tools.length && onTool) body.tools = tools;
        const r = await fetch(url + "/v1/chat/completions", {method: "POST", headers, body: JSON.stringify(body), signal});
        if (!r.ok) {
          let msg = "HTTP " + r.status;
          try { const j = await r.json(); if (j.error) msg += " — " + (j.error.message || j.error); } catch (err) { /* no body */ }
          throw new Error(msg);
        }
        // the bridge's session-epoch header (docs/ask-token-plan.md #4/#7):
        // present only on the bridge, harmless (and absent) on LM Studio/etc
        if (r.headers && r.headers.get) askEpochNote(askStoreKey(), r.headers.get("x-nr-session-epoch"));
        if (onOpen) onOpen(); // headers back = the server has the question (a drop after this is a dropped connection, not a lost question)
        const reader = r.body.getReader(), dec = new TextDecoder(), st = {buf: "", think: 0};
        let out = "", shown = 0, shownNote = "";
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          for (const t of aiSSE(st, dec.decode(value, {stream: true}))) { out += t; onDelta(out); }
          if (st.note && st.note !== shownNote && onNote) { shownNote = st.note; onNote(st.note); } // what Claude is doing right now (Josh, 2026-09-26: "no indication you are still doing work")
          if (!out && st.think - shown > 400 && onStatus) { shown = st.think; onStatus("thinking… (" + Math.round(st.think / 5) + " words so far — thinking is a model setting in LM Studio, not here)"); }
          if (st.error) throw new Error(st.error);
        }
        const calls = (st.tools || []).filter(t => t && t.name);
        if (!calls.length && !out.trim() && round === 0 && !retried) { retried = true; round--; continue; } // a thinking-only turn (Qwen, first request after a load): one silent retry
        if (!calls.length || !onTool) return out;
        convo.push({role: "assistant", content: out || "", tool_calls: calls.map((t, i) => ({id: t.id || "call_" + round + "_" + i, type: "function", function: {name: t.name, arguments: t.args || "{}"}}))});
        for (const [i, t] of calls.entries()) {
          let args = {};
          try { args = JSON.parse(t.args || "{}"); } catch (err) { args = {_parse_error: String(err.message)}; }
          if (onStatus) onStatus("⚙ " + t.name + "…");
          let result;
          try { result = await onTool(t.name, args); } catch (err) { result = {error: String(err && err.message || err)}; }
          convo.push({role: "tool", tool_call_id: t.id || "call_" + round + "_" + i, content: typeof result === "string" ? result : JSON.stringify(result)});
        }
        onDelta(out ? out + "\n\n…" : "…"); // the words so far stay; the next round continues them
      }
      throw new Error("the model kept calling tools without answering — try again");
    },
  };
}
// Test connection: five outcomes, each with its fix in the same line. The
// guesswork lives here, not in his head.
export function aiSay(el, t) { // ✓ gold, ⚠ red, anything else plain
  el.textContent = t;
  el.classList.toggle("ok", t.startsWith("✓"));
  el.classList.toggle("err", t.startsWith("⚠"));
}
export function aiModelMenu(ids, pick) { // the model select: what the server listed, the saved id kept even when unlisted
  const sel = document.getElementById("cfgaimodel");
  sel.innerHTML = "";
  const add = (v, label) => { const o = document.createElement("option"); o.value = v; o.textContent = label || v; sel.appendChild(o); return o; };
  if (pick && !ids.includes(pick)) add(pick, pick + (ids.length ? " (not on this server)" : ""));
  for (const id of ids) add(id);
  if (!sel.options.length) add("", "— Test to list the server's models —");
  sel.value = pick || sel.options[0].value;
}
export function aiPickModel(ids, saved) { return ids.includes(saved) ? saved : (ids.find(id => !/embed/i.test(id)) || ids[0] || ""); }
export const AI_TEST_MS = 8000;
export async function aiTest(url, statusEl, btn) {
  const say = t => aiSay(statusEl, t);
  url = (url || "").replace(/\/+$/, "");
  if (aiHostKind(url) === "bad") { say("⚠ that is not a URL — try http://localhost:1234"); return null; }
  if (location.protocol === "https:" && url.startsWith("http:") && aiHostKind(url) !== "local") {
    say("⚠ mixed content: this page is https but the server is http — the browser blocks that. Reach the server over https (Tailscale Serve) or open Night Roll over http from that machine. See Help → ✦ AI.");
    return null;
  }
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Testing…"; }
  say("testing " + url + " (up to " + AI_TEST_MS / 1000 + " s)…");
  const ctl = typeof AbortController === "function" ? new AbortController() : {abort() {}, signal: undefined};
  const timer = setTimeout(() => ctl.abort(), AI_TEST_MS);
  try {
    const r = await fetch(url + "/v1/models", {headers: aiHeaders(), signal: ctl.signal});
    if (!r.ok) { say("⚠ the server answered HTTP " + r.status + (r.status === 401 || r.status === 403 ? " — it wants an API key" : "")); return null; }
    const ids = ((await r.json()).data || []).map(m => m.id).filter(Boolean);
    S.askModelCache = {url, ids};
    if (!ids.length) { say("✓ reachable · no model listed — load one in LM Studio, then Test"); return ids; }
    // Test means "this is the server I mean": keep his pick if it is still there, else the first chat-looking model, and save
    const pick = aiPickModel(ids, cfg().aiModel);
    aiModelMenu(ids, pick);
    saveCfg({aiUrl: url, aiModel: pick});
    askRefresh();
    say("✓ connected · " + ids.length + " model" + (ids.length === 1 ? "" : "s") + " · using " + pick + " · saved");
    return ids;
  } catch (err) {
    if (err && err.name === "AbortError") { say("⚠ no answer in " + AI_TEST_MS / 1000 + " s — server running? right port? On an iPad the URL must be https (Tailscale Serve)."); return null; }
    // reachable-but-CORS-blocked vs unreachable: an opaque no-cors fetch succeeds in the first case only
    let reachable = false;
    try { await fetch(url + "/v1/models", {mode: "no-cors"}); reachable = true; } catch (err2) { reachable = false; }
    if (reachable) say("⚠ reachable, but CORS is off: in LM Studio → Developer → Server settings turn on Enable CORS (Ollama: set OLLAMA_ORIGINS=*)");
    else say(/\.ts\.net\b/.test(url) // a tailnet address: the usual cause is the VPN being off on THIS device (Josh, 2026-09-27, twice)
      ? "⚠ unreachable: is Tailscale connected on this device? (Open the Tailscale app — it drops sometimes.) And is the bridge running on the Mac?"
      : "⚠ unreachable: is the server running at " + url + "? Same network? (If the browser asked to allow local-network access, say yes.)");
    return null;
  } finally {
    clearTimeout(timer);
    if (btn) { btn.disabled = false; btn.textContent = label === "Testing…" ? "Test" : label; }
  }
}
export function aiRunTest() {
  const out = document.getElementById("cfgaitestout");
  if (document.getElementById("cfgaibackend").value === "browser") aiBrowserTest(document.getElementById("cfgaibrowsermodel").value, out);
  else aiTest(document.getElementById("cfgaiurl").value.trim(), out, document.getElementById("cfgaitest"));
}
export function aiBackendRows() { // the AI section shows the rows the chosen backend uses
  const browser = document.getElementById("cfgaibackend").value === "browser";
  for (const id of ["cfgaibrowserrow", "cfgaihelpbrowser"]) document.getElementById(id).style.display = browser ? "" : "none";
  for (const id of ["cfgaiurlrow", "cfgaimodelrow", "cfgaikeyrow", "cfgaihelpremote"]) document.getElementById(id).style.display = browser ? "none" : "";
}
// ---- in-browser backend: WebLLM (MLC), loaded only when chosen. First
// third-party-hosted runtime dependency (code from jsdelivr, weights from
// HuggingFace) — Josh's call, CDN over vendoring (local-llm-design.md §10.8).
// Weights cache in the browser after the first download. Needs WebGPU.
export const AI_WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/lib/index.js";
export const AI_BROWSER_MODELS = [ // curated from the prebuilt list, smallest first; sizes = VRAM at load
  ["SmolLM2-360M-Instruct-q4f16_1-MLC", "SmolLM2 360M · 0.4 GB (tiny — for testing)"],
  ["Llama-3.2-1B-Instruct-q4f16_1-MLC", "Llama 3.2 1B · 0.9 GB"],
  ["Qwen3.5-0.8B-q4f16_1-MLC", "Qwen 3.5 0.8B · 1.6 GB"],
  ["SmolLM2-1.7B-Instruct-q4f16_1-MLC", "SmolLM2 1.7B · 1.8 GB"],
  ["Qwen3-1.7B-q4f16_1-MLC", "Qwen 3 1.7B · 2.0 GB"],
  ["Qwen3.5-2B-q4f16_1-MLC", "Qwen 3.5 2B · 2.2 GB"],
  ["Llama-3.2-3B-Instruct-q4f16_1-MLC", "Llama 3.2 3B · 2.3 GB"],
  ["Qwen3-4B-q4f16_1-MLC", "Qwen 3 4B · 3.4 GB"],
  ["Phi-4-mini-instruct-q4f16_1-MLC", "Phi-4 mini · 3.4 GB"],
  ["Qwen3.5-4B-q4f16_1-MLC", "Qwen 3.5 4B · 3.9 GB"],
];
export function aiBrowserMenu(current) {
  const sel = document.getElementById("cfgaibrowsermodel");
  sel.innerHTML = "";
  for (const [id, label] of AI_BROWSER_MODELS) { const o = document.createElement("option"); o.value = id; o.textContent = label; sel.appendChild(o); }
  sel.value = AI_BROWSER_MODELS.some(m => m[0] === current) ? current : AI_BROWSER_MODELS[1][0];
}
export async function aiWebllmLoad(statusFn) {
  if (!S.aiWebllm) { statusFn("loading the in-browser runtime…"); S.aiWebllm = await import(AI_WEBLLM_URL); }
  return S.aiWebllm;
}
export async function aiEngineFor(modelId, statusFn) {
  if (S.aiEngine && S.aiEngineModel === modelId) return S.aiEngine;
  const w = await aiWebllmLoad(statusFn);
  if (S.aiEngine) { try { await S.aiEngine.unload(); } catch (err) { /* already gone */ } S.aiEngine = null; }
  S.aiEngine = await w.CreateMLCEngine(modelId, {initProgressCallback: p => statusFn((p && p.text) || "loading…")});
  S.aiEngineModel = modelId;
  return S.aiEngine;
}
export async function aiBrowserTest(modelId, statusEl) { // also THE capability probe for a new device (iPad): WebGPU + cache state
  const say = t => aiSay(statusEl, t);
  if (!navigator.gpu) { say("⚠ no WebGPU in this browser — in-browser models need it (Chrome, Edge, Safari 26+); use a server instead"); return; }
  let ad = null;
  try { ad = await navigator.gpu.requestAdapter(); } catch (err) { ad = null; }
  if (!ad) { say("⚠ WebGPU is here but no GPU adapter answered — try another browser, or use a server"); return; }
  const lim = ad.limits || {};
  const mb = x => Math.round((x || 0) / 1048576);
  try {
    const w = await aiWebllmLoad(say);
    const cached = await w.hasModelInCache(modelId);
    say("✓ WebGPU ok (max buffer " + mb(lim.maxBufferSize) + " MB, storage binding " + mb(lim.maxStorageBufferBindingSize) + " MB" + (ad.features && ad.features.has && ad.features.has("shader-f16") ? ", f16" : "") + ") · " +
        modelId + (cached ? " is downloaded" : " not downloaded yet — the first Ask downloads it"));
  } catch (err) { say("⚠ the in-browser runtime failed to load: " + err.message + " (offline?)"); }
}
export function aiBrowser() {
  const modelId = cfg().aiBrowserModel;
  return {
    id: "browser",
    async listModels() { return AI_BROWSER_MODELS.map(m => m[0]); },
    async chat({system, messages, signal, onDelta, schema, onStatus}) {
      if (!navigator.gpu) throw new Error("no WebGPU in this browser — pick a server in Settings");
      const eng = await aiEngineFor(modelId, onStatus || (() => {}));
      if (signal) signal.addEventListener("abort", () => { try { eng.interruptGenerate(); } catch (err) { /* idle */ } });
      const req = {messages: [{role: "system", content: system}, ...messages], stream: true, extra_body: {enable_thinking: false}};
      if (schema && Object.keys(schema).length) req.response_format = {type: "json_object", schema: JSON.stringify(schema)};
      else if (schema) req.response_format = {type: "json_object"};
      let out = "";
      const chunks = await eng.chat.completions.create(req);
      for await (const c of chunks) {
        const t = c.choices && c.choices[0] && c.choices[0].delta && c.choices[0].delta.content;
        if (t) { out += t; onDelta(out); }
      }
      if (signal && signal.aborted) { const e = new Error("stopped"); e.name = "AbortError"; throw e; }
      return out;
    },
  };
}
export function aiProvider() { return cfg().aiBackend === "browser" ? aiBrowser() : Object.assign(aiRemote(), {id: "remote"}); }
