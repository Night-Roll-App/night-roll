// lets iOS Safari apply :active (the pressed look) — it skips :active on pages with no touch listener
export function audioSessionType(t) { try { if (navigator.audioSession && navigator.audioSession.type !== t) navigator.audioSession.type = t; } catch (err) { console.log("[audio] audioSession: " + err.message); } }
// reaches the shell's native plugins the way 📷 Screenshot does (askShotCapture,
// above): this page loads no @capacitor/core, so there is no registerPlugin —
// nativePromise reaches any plugin the native project registers by name.
// Plugins.Filesystem already has a JS shim here (the local-folder backend,
// nativeFs() above); @capacitor/share does not, so Share always goes through
// nativePromise.
export async function nativeCall(plugin, method, args) {
  const C = window.Capacitor;
  if (plugin === "Filesystem" && C.Plugins && C.Plugins.Filesystem) return C.Plugins.Filesystem[method](args);
  if (!C.nativePromise) throw new Error("the app has no bridge to " + plugin + " (no Plugins." + plugin + ", no nativePromise)");
  return C.nativePromise(plugin, method, args);
}
