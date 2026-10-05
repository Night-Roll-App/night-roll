// web/backends.js — the two model backends an app's chat talks to, behind
// one adapter shape ({id, listModels(), chat({...})}): an OpenAI-compatible
// server over SSE (LM Studio, Ollama, the bridge in bridge/server.mjs) and
// an in-browser model (WebLLM, loaded from a CDN only when chosen). Plus the
// connection probe a Settings page runs and the per-host consent gate.
//
// Everything app-specific enters through `host` (see README "Host adapter"):
//   host.settings()        → {url, model, backend: "remote"|"browser", browserModel, window}
//   host.apiKey()          → bearer token or null
//   host.sessionName()     → the chat-session key the bridge keeps one session per (x-nr-song)
//   host.state             → an object the library keeps its runtime fields on
//                            (askModelCache, aiWebllm, aiEngine, aiEngineModel)
//   host.storage           → localStorage-like (default: globalThis.localStorage)
//   host.keys.hosts        → storage key of the consented-hosts list
//   host.confirmHost(name) → Promise<boolean>: the app's own consent sheet (its wording, its dialog)
//   host.onSessionEpoch(e) → optional: the bridge's x-nr-session-epoch response header
//   host.url()/headers()   → optional overrides of aiBaseUrl/aiReqHeaders (an app's
//                            own delegates, so a test can swap them in one place)
import { aiSSE } from "./sse.js";

export function aiStorage(host) { return host.storage || globalThis.localStorage; }
export function aiBaseUrl(host) { return (host.settings().url || "").replace(/\/+$/, ""); }
export function aiReqHeaders(host) {
  const h = {"content-type": "application/json"};
  const k = host.apiKey ? host.apiKey() : null;
  if (k) h.authorization = "Bearer " + k;
  return h;
}
// the host's own delegates when it has them (so an app can stub ONE name and
// every library call follows), else the library's defaults above
export function aiUrlOf(host) { return host.url ? host.url() : aiBaseUrl(host); }
export function aiHeadersOf(host) { return host.headers ? host.headers() : aiReqHeaders(host); }
export function aiHostKindOf(url) { // "local" never prompts; everything else asks once per host
  let host = "";
  try { host = new URL(url).hostname; } catch (err) { return "bad"; }
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" ? "local" : "other";
}
// A tool result of the shape {final: "text"} ends the exchange: that text is
// the reply (after any words the model said before the call), and the model
// gets no further round — the host decides which of its tools end this way
// (navigation and the like, where a second round would only echo the line).
// Anything else goes back to the model as a tool message. Both loops honour
// it: the live one in aiRemoteBackend.chat and the resumed one in client.js
// (aiResume). A round where only some results are final is not final: those
// texts travel back as plain tool messages like any other result.
export function aiToolFinal(result) { return result && typeof result === "object" && typeof result.final === "string" ? result.final : null; }
export function aiFinalText(words, finals) { const w = (words || "").trim(); return (w ? w + "\n" : "") + finals.join("\n"); }
export function aiRemoteBackend(host) { // OpenAI-compatible SSE; the bridge adds jobs + sessions on top of the same wire
  const url = aiUrlOf(host);
  return {
    id: "remote",
    async listModels() {
      const r = await fetch(url + "/v1/models", {headers: aiHeadersOf(host)});
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      return (j.data || []).map(m => m.id).filter(Boolean);
    },
    async chat({system, messages, signal, onDelta, schema, onStatus, tools, onTool, job, onOpen, onRound, onNote}) {
      let model = host.settings().model;
      const headers = aiHeadersOf(host);
      if (job) { // the bridge keeps a job alive through a dropped connection; Stop kills it explicitly
        headers["x-nr-job"] = job;
        headers["x-nr-song"] = host.sessionName(); // one bridge session per chat key
        if (signal) signal.addEventListener("abort", () => { fetch(url + "/v1/jobs/" + encodeURIComponent(job), {method: "DELETE", headers: aiHeadersOf(host)}).catch(() => {}); }, {once: true});
      }
      if (!model) {
        const st = host.state;
        if (!st.askModelCache || st.askModelCache.url !== url) st.askModelCache = {url, ids: await this.listModels()};
        model = st.askModelCache.ids[0];
        if (!model) throw new Error("the server lists no models — load one first");
      }
      // Tool rounds: the model may call the app's tools; the app runs them and
      // sends the results back, at most a few times, then the model answers in words.
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
        // the bridge's session-epoch header: present only on the bridge, absent (and harmless) elsewhere
        if (host.onSessionEpoch && r.headers && r.headers.get) host.onSessionEpoch(r.headers.get("x-nr-session-epoch"));
        if (onOpen) onOpen(); // headers back = the server has the question (a drop after this is a dropped connection, not a lost question)
        const reader = r.body.getReader(), dec = new TextDecoder(), st = {buf: "", think: 0};
        let out = "", shown = 0, shownNote = "";
        for (;;) {
          const {done, value} = await reader.read();
          if (done) break;
          for (const t of aiSSE(st, dec.decode(value, {stream: true}))) { out += t; onDelta(out); }
          if (st.note && st.note !== shownNote && onNote) { shownNote = st.note; onNote(st.note); } // what the model is doing right now
          if (!out && st.think - shown > 400 && onStatus) { shown = st.think; onStatus("thinking… (" + Math.round(st.think / 5) + " words so far — thinking is a model setting on the server, not here)"); }
          if (st.error) throw new Error(st.error);
        }
        const calls = (st.tools || []).filter(t => t && t.name);
        if (!calls.length && !out.trim() && round === 0 && !retried) { retried = true; round--; continue; } // a thinking-only turn (Qwen, first request after a load): one silent retry
        if (!calls.length || !onTool) return out;
        convo.push({role: "assistant", content: out || "", tool_calls: calls.map((t, i) => ({id: t.id || "call_" + round + "_" + i, type: "function", function: {name: t.name, arguments: t.args || "{}"}}))});
        const finals = [];
        for (const [i, t] of calls.entries()) {
          let args = {};
          try { args = JSON.parse(t.args || "{}"); } catch (err) { args = {_parse_error: String(err.message)}; }
          if (onStatus) onStatus("⚙ " + t.name + "…");
          let result;
          try { result = await onTool(t.name, args); } catch (err) { result = {error: String(err && err.message || err)}; }
          const fin = aiToolFinal(result);
          if (fin !== null) finals.push(fin);
          convo.push({role: "tool", tool_call_id: t.id || "call_" + round + "_" + i, content: fin !== null ? fin : typeof result === "string" ? result : JSON.stringify(result)});
        }
        if (finals.length === calls.length) return aiFinalText(out, finals); // every tool of the round ended the exchange itself (aiToolFinal): no further request
        onDelta(out ? out + "\n\n…" : "…"); // the words so far stay; the next round continues them
      }
      throw new Error("the model kept calling tools without answering — try again");
    },
  };
}
// ---- the connection probe (a Settings "Test" button). Answers a KIND, never
// a sentence — the wording (which server, which VPN, which help page) is the
// app's. Kinds: bad-url · mixed-content · http (status) · empty (reachable,
// no model) · ok (ids; the first chat-looking one picked) · timeout · cors
// (reachable, but the browser was refused) · unreachable.
export const AI_PROBE_MS = 8000;
export function aiPickModel(ids, saved) { return ids.includes(saved) ? saved : (ids.find(id => !/embed/i.test(id)) || ids[0] || ""); }
export async function aiProbe(host, url, opts) {
  const ms = (opts && opts.timeoutMs) || AI_PROBE_MS;
  url = (url || "").replace(/\/+$/, "");
  if (aiHostKindOf(url) === "bad") return {kind: "bad-url", url};
  if (typeof location !== "undefined" && location.protocol === "https:" && url.startsWith("http:") && aiHostKindOf(url) !== "local") return {kind: "mixed-content", url};
  const ctl = typeof AbortController === "function" ? new AbortController() : {abort() {}, signal: undefined};
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url + "/v1/models", {headers: aiHeadersOf(host), signal: ctl.signal});
    if (!r.ok) return {kind: "http", url, status: r.status};
    const ids = ((await r.json()).data || []).map(m => m.id).filter(Boolean);
    host.state.askModelCache = {url, ids};
    if (!ids.length) return {kind: "empty", url, ids};
    return {kind: "ok", url, ids, pick: aiPickModel(ids, host.settings().model)};
  } catch (err) {
    if (err && err.name === "AbortError") return {kind: "timeout", url, ms};
    // reachable-but-CORS-blocked vs unreachable: an opaque no-cors fetch succeeds in the first case only
    let reachable = false;
    try { await fetch(url + "/v1/models", {mode: "no-cors"}); reachable = true; } catch (err2) { reachable = false; }
    return {kind: reachable ? "cors" : "unreachable", url, error: String(err && err.message || err)};
  } finally {
    clearTimeout(timer);
  }
}
// ---- in-browser backend: WebLLM (MLC), loaded only when chosen — code from
// jsdelivr, weights from HuggingFace, cached in the browser after the first
// download. Needs WebGPU.
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
export async function aiWebllmLoad(host, statusFn) {
  const st = host.state;
  if (!st.aiWebllm) { statusFn("loading the in-browser runtime…"); st.aiWebllm = await import(AI_WEBLLM_URL); }
  return st.aiWebllm;
}
export async function aiEngineFor(host, modelId, statusFn) {
  const st = host.state;
  if (st.aiEngine && st.aiEngineModel === modelId) return st.aiEngine;
  const w = await aiWebllmLoad(host, statusFn);
  if (st.aiEngine) { try { await st.aiEngine.unload(); } catch (err) { /* already gone */ } st.aiEngine = null; }
  st.aiEngine = await w.CreateMLCEngine(modelId, {initProgressCallback: p => statusFn((p && p.text) || "loading…")});
  st.aiEngineModel = modelId;
  return st.aiEngine;
}
export function aiHasWebGPU() { return typeof navigator !== "undefined" && !!navigator.gpu; }
export async function aiBrowserProbe(host, modelId, statusFn) { // THE capability probe for a new device: WebGPU + cache state → one ✓/⚠ line
  if (!aiHasWebGPU()) return "⚠ no WebGPU in this browser — in-browser models need it (Chrome, Edge, Safari 26+); use a server instead";
  let ad = null;
  try { ad = await navigator.gpu.requestAdapter(); } catch (err) { ad = null; }
  if (!ad) return "⚠ WebGPU is here but no GPU adapter answered — try another browser, or use a server";
  const lim = ad.limits || {};
  const mb = x => Math.round((x || 0) / 1048576);
  try {
    const w = await aiWebllmLoad(host, statusFn || (() => {}));
    const cached = await w.hasModelInCache(modelId);
    return "✓ WebGPU ok (max buffer " + mb(lim.maxBufferSize) + " MB, storage binding " + mb(lim.maxStorageBufferBindingSize) + " MB" + (ad.features && ad.features.has && ad.features.has("shader-f16") ? ", f16" : "") + ") · " +
           modelId + (cached ? " is downloaded" : " not downloaded yet — the first message downloads it");
  } catch (err) { return "⚠ the in-browser runtime failed to load: " + err.message + " (offline?)"; }
}
export function aiBrowserBackend(host) {
  const modelId = host.settings().browserModel;
  return {
    id: "browser",
    async listModels() { return AI_BROWSER_MODELS.map(m => m[0]); },
    async chat({system, messages, signal, onDelta, schema, onStatus}) {
      if (!aiHasWebGPU()) throw new Error("no WebGPU in this browser — pick a server in Settings");
      const eng = await aiEngineFor(host, modelId, onStatus || (() => {}));
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
export function aiPickBackend(host) { return host.settings().backend === "browser" ? aiBrowserBackend(host) : aiRemoteBackend(host); }

// ---- per-host consent: every message carries the app's own data to that
// machine, so anything but localhost is asked once (the app words the
// question — it knows what the payload is; the library only keeps the list).
export function aiHostsAllowed(host) {
  try { const l = JSON.parse(aiStorage(host).getItem(host.keys.hosts) || "[]"); return Array.isArray(l) ? l : []; } catch (err) { return []; }
}
export function aiHostAllowed(host, url) { // the list check alone, no prompt (a background poll must never ask)
  const kind = aiHostKindOf(url);
  if (kind === "bad") return false;
  if (kind === "local") return true;
  try { return aiHostsAllowed(host).includes(new URL(url).host); } catch (err) { return false; }
}
export async function aiHostConsent(host, url) {
  const kind = aiHostKindOf(url);
  if (kind === "bad") return false;
  if (kind === "local") return true;
  const name = new URL(url).host;
  const ok = aiHostsAllowed(host);
  if (ok.includes(name)) return true;
  const yes = await host.confirmHost(name);
  if (yes) { ok.push(name); try { aiStorage(host).setItem(host.keys.hosts, JSON.stringify(ok)); } catch (err) { /* private mode: asked again next time */ } }
  return yes;
}
