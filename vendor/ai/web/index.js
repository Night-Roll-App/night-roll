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
export {
  AI_LOCAL_SOFT, AI_TOTAL_CAP, aiStorageKeys, aiChatKey, aiStripContext,
  aiStoreGet, aiIsChatStore, aiChatKeys, aiUnsavedCount, aiRevertToSaved, aiEvictOthers, aiStoreSave,
  aiPendingIndex, aiPendingAll, aiJobId,
  aiSeenKey, aiSeenGet, aiSeenMax, aiSeenSet, aiSeenAdvance, aiSeenPending, aiSeenStage, aiSeenCommit, aiSeenDrop,
  aiDraftKey, aiDraftRead, aiDraftWrite, aiDraftClear, aiLogMarkdown,
} from "./store.js";
export {
  aiHash, aiSentKey, aiSentGet, aiSentPending, aiSentStage, aiSentStageBars, AI_SENT_BARS_CAP, aiSentCommit, aiSentDrop, aiSentReset,
  aiEpochKey, aiEpochGet, aiEpochSet, aiEpochNote, aiCachedBlock,
} from "./ctx-cache.js";
export {
  aiBridgeGet, aiBridgePost, aiJobsSupported, aiJobGet, aiJobKill, aiInboxFetch, aiStatusFetch,
  aiSessionGet, aiSessionDelete, aiSessionCompact, aiTerminalPost, aiTerminalPrefsGet, aiTerminalPrefsSet, aiAppState, aiDeploy,
} from "./bridge-client.js";
export {
  AI_SHOT_MAX, AI_MAX_SHOT_SIDE, AI_MAX_SHOT_KEEP_BYTES, aiB64Bytes, aiShotLine, aiShotUpload, aiShotOutgoing, aiShotDisplayText,
  aiPrepImage, aiCanCaptureTab, aiShotCaptureTab,
} from "./attach.js";
