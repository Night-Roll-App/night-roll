import { aiUrl } from "./backend.js";
import { aiHeaders } from "./backend.js";
import { S } from "../state.js";
import { askDraftSaveSoon } from "./sheet.js";
import { askstatus } from "./sheet.js";
import { closeDropUp } from "../ui/chrome.js";
import { logDebugImpl as logDebug } from "../ui/chrome.js";

export function askShotLine(path) { return "(screenshot: " + path + ")"; }
export const ASKSHOT_MAX = 4;
export function b64Bytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export async function askShotUpload(bytes, mime) { // shared by 📷 capture and 🖼 picked files
  const r = await fetch(aiUrl() + "/v1/shot", {method: "POST", headers: {...aiHeaders(), "content-type": mime}, body: bytes});
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.path) throw new Error(j.error && j.error.message || "HTTP " + r.status);
  return j.path;
}
// [{path, url, mime}]
export function askShotStatusLabel() {
  const n = S.askShotPending.length;
  return n > 1 ? "📷 " + n + " screenshots attached — Send, with a note if you like" : "📷 attached — Send, with a note if you like";
}
export function askShotRender() {
  const chip = document.getElementById("askshotchip"), wrap = document.getElementById("askshotimgs"), label = document.getElementById("askshotcount");
  const n = S.askShotPending.length;
  chip.style.display = n ? "" : "none";
  wrap.innerHTML = "";
  S.askShotPending.forEach((s, i) => {
    const cell = document.createElement("span"); cell.className = "askshotcell";
    const img = document.createElement("img"); img.className = "askshotimg";
    img.alt = "a screenshot to send"; img.title = "tap to see it larger";
    if (s.url) img.src = s.url;
    img.style.display = s.url ? "" : "none";
    img.addEventListener("click", () => img.classList.toggle("big"));
    const rm = document.createElement("button"); rm.className = "askshotrm"; rm.type = "button";
    rm.setAttribute("aria-label", "Remove this screenshot"); rm.textContent = "✕";
    rm.addEventListener("click", ev => { ev.stopPropagation(); askShotRemove(i); });
    cell.appendChild(img); cell.appendChild(rm);
    wrap.appendChild(cell);
  });
  label.textContent = n === 1 ? "📷 screenshot — sent with your next message" : n > 1 ? "📷 " + n + " screenshots — sent with your next message" : "";
}
export function askShotAdd(path, shot) { // shot: {bytes, mime} for a thumbnail, or omitted when just restoring a path (draft reload — bytes live on the Mac)
  if (!path || S.askShotPending.length >= ASKSHOT_MAX) return;
  const entry = {path, url: null, mime: shot && shot.mime};
  if (shot && shot.bytes && typeof URL !== "undefined" && URL.createObjectURL && typeof Blob !== "undefined") {
    try { entry.url = URL.createObjectURL(new Blob([shot.bytes], {type: shot.mime})); } catch (e) {}
  }
  S.askShotPending.push(entry);
  askShotRender();
  if (typeof askDraftSaveSoon === "function") askDraftSaveSoon();
}
export function askShotRemove(i) {
  const e = S.askShotPending[i];
  if (!e) return;
  if (e.url) { try { URL.revokeObjectURL(e.url); } catch (err) {} }
  S.askShotPending.splice(i, 1);
  askShotRender();
  if (typeof askDraftSaveSoon === "function") askDraftSaveSoon();
}
export function askShotClearAll() {
  for (const e of S.askShotPending) if (e.url) { try { URL.revokeObjectURL(e.url); } catch (err) {} }
  S.askShotPending = [];
  askShotRender();
}
export function askShotRestore(paths) { // draft reload: paths only, never bytes (the thumbnail doesn't survive a reload — the bytes are on the Mac)
  askShotClearAll();
  for (const p of (paths || [])) { if (p && S.askShotPending.length < ASKSHOT_MAX) S.askShotPending.push({path: p, url: null}); }
  askShotRender();
}
export function askShotOutgoing(text) { // what Send sends: the note, then each shot's line; the box never holds any of it
  if (!S.askShotPending.length) return text;
  return (text || "(screenshot only)") + S.askShotPending.map(s => "\n" + askShotLine(s.path)).join("");
}
// a batch Send/receive bubble shows the screenshot lines as 📷 glyphs, one
// per shot, instead of the raw "(screenshot: path)" text
export function askShotDisplayText(text) {
  const m = text.match(/\n\(screenshot: [^)]*\)/g);
  if (!m) return text;
  const head = text.slice(0, text.length - m.join("").length);
  const icons = "📷".repeat(m.length);
  return head === "(screenshot only)" ? icons : head + " " + icons;
}
export const MAX_SHOT_SIDE = 2752, MAX_SHOT_KEEP_BYTES = 2 * 1024 * 1024;
export async function askPrepImage(file) { // -> {bytes, mime}: downscale if huge, re-export HEIC/HEIF as JPEG, else keep the original bytes
  const heic = /heic|heif/i.test(file.type || "") || /\.(heic|heif)$/i.test(file.name || "");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("couldn't read that picture")); img.src = url; });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const longest = Math.max(w0, h0);
    if (!heic && file.size <= MAX_SHOT_KEEP_BYTES && longest <= MAX_SHOT_SIDE) {
      return {bytes: new Uint8Array(await file.arrayBuffer()), mime: /png/i.test(file.type) ? "image/png" : "image/jpeg"};
    }
    const scale = longest > MAX_SHOT_SIDE ? MAX_SHOT_SIDE / longest : 1;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * scale)); c.height = Math.max(1, Math.round(h0 * scale));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) throw new Error("couldn't convert that picture");
    return {bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg"};
  } finally { URL.revokeObjectURL(url); }
}
export async function askPickFiles(fileList) { // 🖼 Photos/Files picker — each file prepped, uploaded, and appended like a 📷 shot
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const room = ASKSHOT_MAX - S.askShotPending.length;
  if (room <= 0) { askstatus.textContent = "📷 already " + ASKSHOT_MAX + " attached (max) — remove one first"; return; }
  const take = files.slice(0, room);
  const dropped = files.length - take.length;
  for (const f of take) {
    askstatus.textContent = "📷 sending…";
    try {
      const {bytes, mime} = await askPrepImage(f);
      const path = await askShotUpload(bytes, mime);
      askShotAdd(path, {bytes, mime});
    } catch (err) { askstatus.textContent = "📷 not sent: " + (err && err.message || err); return; }
  }
  askstatus.textContent = dropped ? askShotStatusLabel() + " (" + dropped + " more skipped — " + ASKSHOT_MAX + " is the max)" : askShotStatusLabel();
}

// ---- 📷 (Josh, 2026-09-29: "I wish there would be a way for me to send you
// screenshots from the app itself"). The iPad shell's native snapshot
// (WKWebView, exact pixels, no prompt); a browser shares its own tab
// (getDisplayMedia — Chrome asks once per shot). 🖼 (2026-10-02) picks
// existing pictures from Photos/Files instead of capturing the app itself —
// same pending list, same upload, same outgoing line, just a different
// source for the bytes. The bridge stores the bytes (POST /v1/shot) and
// answers a path on the Mac; each lands as its own "(screenshot: <path>)"
// line and Claude Reads it. The AI panel steps aside for a 📷 capture unless
// it's docked — the picture is of the song, not the chat (🖼 doesn't need
// that: nothing of the app is on screen while the OS picker is up).
export function askShotShow(on) {
  const b = document.getElementById("askattach");
  if (b) b.style.display = on ? "" : "none";
  if (!on && S.dropUpOpen === document.getElementById("askattachmenu")) closeDropUp();
}
export async function askShotCapture() { // -> {bytes, mime}
  // the shell's own plugin (registered in its AppDelegate.swift): native-bridge.js
  // has no registerPlugin (that's @capacitor/core, which this page doesn't
  // load), and Capacitor.Plugins may lack it — nativePromise reaches any
  // registered plugin by name, and a missing one answers "not implemented"
  const C = typeof window !== "undefined" && window.Capacitor;
  const native = !!(C && C.isNativePlatform && C.isNativePlatform());
  logDebug("📷 Capacitor: " + typeof C + ", native: " + native + ", Plugins: " + (C && C.Plugins ? Object.keys(C.Plugins).join(",") : "none") +
           ", nativePromise: " + typeof (C && C.nativePromise) + ", registerPlugin: " + typeof (C && C.registerPlugin));
  if (native) {
    const r = C.Plugins && C.Plugins.Screenshot ? await C.Plugins.Screenshot.capture()
      : C.nativePromise ? await C.nativePromise("Screenshot", "capture", {})
      : null;
    if (!r) throw new Error("the app has no screenshot bridge (no Plugins.Screenshot, no nativePromise)");
    if (!r.jpeg) throw new Error("the app's screenshot came back empty");
    return {bytes: b64Bytes(r.jpeg), mime: "image/jpeg"};
  }
  if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) throw new Error("this browser can't take a screenshot (not the app: Capacitor " + (C ? "present, not native" : "missing") + "; no getDisplayMedia)");
  const stream = await navigator.mediaDevices.getDisplayMedia({video: {displaySurface: "browser"}, audio: false, preferCurrentTab: true});
  try {
    const v = document.createElement("video");
    v.muted = true; v.srcObject = stream; await v.play();
    await new Promise(r => setTimeout(r, 300)); // the share banner and the panel's step-aside settle first
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    return {bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/png"};
  } finally { stream.getTracks().forEach(t => t.stop()); }
}
export async function askShotTake() {
  if (S.askShotPending.length >= ASKSHOT_MAX) { askstatus.textContent = "📷 already " + ASKSHOT_MAX + " attached (max) — remove one first"; return; }
  const sheet = document.getElementById("asksheet");
  const aside = !sheet.classList.contains("docked");
  askstatus.textContent = aside ? "📷 taking…" : ""; // docked, the panel is IN the picture: no stale "taking…" in it
  if (aside) sheet.style.visibility = "hidden";
  let shot;
  try {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    shot = await Promise.race([askShotCapture(), new Promise((_, rej) => setTimeout(() => rej(new Error("screenshot timed out")), 10000))]); // a native call that never answers must not leave "taking…" up forever
  } catch (err) { askstatus.textContent = "📷 " + (err && err.message || "no screenshot"); return; }
  finally { if (aside) sheet.style.visibility = ""; }
  askstatus.textContent = "📷 sending…";
  try {
    const path = await askShotUpload(shot.bytes, shot.mime);
    askShotAdd(path, shot);
    askstatus.textContent = askShotStatusLabel();
    // no focus: the keyboard stays down (Josh, 2026-09-29: the path in the box
    // summoned it and cluttered what he was writing)
  } catch (err) { askstatus.textContent = "📷 not sent: " + err.message; }
}
