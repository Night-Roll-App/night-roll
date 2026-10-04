import { cfg } from "../platform/storage.js";
import { S } from "../state.js";
import { saveCfg } from "../platform/storage.js";
import { askRefresh } from "./sheet.js";
import { askHost } from "./host.js";
// The transport lives in the AI library (docs/ai-library-plan.md §4, steps
// 1 and 3): vendored at vendor/ai/web/ by tools/ai-sync.mjs, never
// hand-edited here. This file keeps Night Roll's bare names as thin
// delegates over it — every importer (and the vm harness's bare-name
// resolution, and the tests that stub `aiUrl`/`aiProvider` by name) is
// unchanged, and askHost() is the ONE place the library learns anything
// about this app. The library's own names are `ai*` too but never the same
// ones (check.mjs rule 6 scans vendor/ai/web with src/).
import { aiSSE } from "../../vendor/ai/web/sse.js";
import { aiBaseUrl, aiReqHeaders, aiHostKindOf, aiRemoteBackend, aiBrowserBackend, aiPickBackend, aiProbe, aiPickModel, AI_PROBE_MS, AI_WEBLLM_URL, AI_BROWSER_MODELS, aiWebllmLoad, aiEngineFor, aiBrowserProbe, aiHostConsent } from "../../vendor/ai/web/backends.js";
export { aiSSE, aiPickModel, AI_WEBLLM_URL, AI_BROWSER_MODELS, aiWebllmLoad, aiEngineFor }; // library names forwarded as-is (host-bound inside the library already: aiWebllmLoad(host, …), aiEngineFor(host, …))

export function aiUrl() { return aiBaseUrl(askHost()); }
export function aiHeaders() { return aiReqHeaders(askHost()); }
export function aiHostKind(url) { return aiHostKindOf(url); } // "local" never prompts; everything else asks once per host
export function aiRemote() { return aiRemoteBackend(askHost()); }
// Test connection: five outcomes, each with its fix in the same line. The
// guesswork lives here, not in his head. The probe (timeout, the CORS-vs-
// unreachable distinction, mixed content) is the library's; the WORDS —
// which server, which VPN, which help page — are this app's.
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
export const AI_TEST_MS = AI_PROBE_MS;
export function aiTestWords(r) { // the probe's kind → this app's line (null = the ✓ line is built by aiTest itself)
  switch (r.kind) {
    case "bad-url": return "⚠ that is not a URL — try http://localhost:1234";
    case "mixed-content": return "⚠ mixed content: this page is https but the server is http — the browser blocks that. Reach the server over https (Tailscale Serve) or open Night Roll over http from that machine. See Help → ✦ AI.";
    case "http": return "⚠ the server answered HTTP " + r.status + (r.status === 401 || r.status === 403 ? " — it wants an API key" : "");
    case "empty": return "✓ reachable · no model listed — load one in LM Studio, then Test";
    case "timeout": return "⚠ no answer in " + r.ms / 1000 + " s — server running? right port? On an iPad the URL must be https (Tailscale Serve).";
    case "cors": return "⚠ reachable, but CORS is off: in LM Studio → Developer → Server settings turn on Enable CORS (Ollama: set OLLAMA_ORIGINS=*)";
    case "unreachable": return /\.ts\.net\b/.test(r.url) // a tailnet address: the usual cause is the VPN being off on THIS device (Josh, 2026-09-27, twice)
      ? "⚠ unreachable: is Tailscale connected on this device? (Open the Tailscale app — it drops sometimes.) And is the bridge running on the Mac?"
      : "⚠ unreachable: is the server running at " + r.url + "? Same network? (If the browser asked to allow local-network access, say yes.)";
    default: return null;
  }
}
export async function aiTest(url, statusEl, btn) {
  const say = t => aiSay(statusEl, t);
  url = (url || "").replace(/\/+$/, "");
  const label = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Testing…"; }
  say("testing " + url + " (up to " + AI_TEST_MS / 1000 + " s)…");
  try {
    const r = await aiProbe(askHost(), url);
    const words = aiTestWords(r);
    if (words) { say(words); return r.kind === "empty" ? r.ids : null; }
    // Test means "this is the server I mean": keep his pick if it is still there, else the first chat-looking model, and save
    aiModelMenu(r.ids, r.pick);
    saveCfg({aiUrl: url, aiModel: r.pick});
    askRefresh();
    say("✓ connected · " + r.ids.length + " model" + (r.ids.length === 1 ? "" : "s") + " · using " + r.pick + " · saved");
    return r.ids;
  } finally {
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
// HuggingFace) — Josh's call, CDN over vendoring (docs/design/local-llm-design.md §10.8).
// The runtime, engine cache and capability probe are the library's; the
// Settings menu is this file's.
export function aiBrowserMenu(current) {
  const sel = document.getElementById("cfgaibrowsermodel");
  sel.innerHTML = "";
  for (const [id, label] of AI_BROWSER_MODELS) { const o = document.createElement("option"); o.value = id; o.textContent = label; sel.appendChild(o); }
  sel.value = AI_BROWSER_MODELS.some(m => m[0] === current) ? current : AI_BROWSER_MODELS[1][0];
}
export async function aiBrowserTest(modelId, statusEl) { // also THE capability probe for a new device (iPad): WebGPU + cache state
  const say = t => aiSay(statusEl, t);
  say(await aiBrowserProbe(askHost(), modelId, say));
}
export function aiBrowser() { return aiBrowserBackend(askHost()); }
export function aiProvider() { return aiPickBackend(askHost()); }

export function aiHostOk(url) { return aiHostConsent(askHost(), url); } // per-host consent: the payload is his annotations + notes (askHost().confirmHost words it)

export function initBackend1() {
  document.getElementById("cfgaitest").addEventListener("click", aiRunTest);
  document.getElementById("cfgaitestb").addEventListener("click", aiRunTest);
  document.getElementById("cfgaiurl").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); aiRunTest(); } });
  document.getElementById("cfgaibackend").addEventListener("change", aiBackendRows);
}
