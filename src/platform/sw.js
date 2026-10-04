// src/platform/sw.js (layer 1) — docs/split-plan.md §1's "Service-worker
// registration" row, created by phase 2 step 12: the one init that
// registers sw.js (or, with ?sw=0, unregisters it and drops the caches).
// setInfo is a hooks.js port — a genuine upcall from layer 1.
import { S } from "../state.js";
import { PERF_FLAGS } from "./base.js";
import { setInfo } from "../hooks.js";

// ---- service worker (Phase 0, 2026-09-26): offline launch from the Home
// Screen; network-first for the page itself so a stale index.html can never
// stick. ?sw=0 is the kill switch: unregister + drop the caches, for a device
// that misbehaves. Secure contexts only (Pages is https; localhost counts).
export function initSw1() {
  if (typeof navigator !== "undefined" && navigator.serviceWorker && typeof location !== "undefined" && S.APP_BASE) {
    if (PERF_FLAGS.get("sw") === "0") {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      if (typeof caches !== "undefined") caches.keys().then(ks => ks.forEach(k => { if (k.startsWith("night-roll-")) caches.delete(k); })).catch(() => {});
      setInfo("offline support turned off on this device — reload without ?sw=0 to turn it back on");
    } else {
      navigator.serviceWorker.register(new URL("sw.js", S.APP_BASE).href, {scope: S.APP_BASE})
        .then(reg => { const w = reg.active || reg.waiting || reg.installing; if (w && navigator.onLine !== false) w.postMessage("warm"); }) // every catalog song into the cache, in the background
        .catch(err => console.warn("sw:", err.message));
    }
  }
}
