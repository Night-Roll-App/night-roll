// Public API of the AI library. Browser ES modules, no build step: import
// from "<vendored path>/web/index.js".
export { aiSSE } from "./sse.js";
export {
  aiStorage, aiBaseUrl, aiReqHeaders, aiUrlOf, aiHeadersOf, aiHostKindOf,
  aiRemoteBackend, aiBrowserBackend, aiPickBackend,
  AI_PROBE_MS, aiPickModel, aiProbe,
  AI_WEBLLM_URL, AI_BROWSER_MODELS, aiWebllmLoad, aiEngineFor, aiHasWebGPU, aiBrowserProbe,
  aiHostsAllowed, aiHostAllowed, aiHostConsent,
} from "./backends.js";
