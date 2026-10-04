// web/attach.js — pictures that ride with a message: the upload to the
// bridge (POST /v1/shot → a path on the Mac the server-side session can
// read), the "(screenshot: <path>)" line convention, image prep (downscale
// a huge one, re-export HEIC as JPEG), and a browser tab's own capture via
// getDisplayMedia. The pending list and its chip are the window's (an app's
// until web/window.js); a native shell's capture plugin is the host's.
import { aiUrlOf, aiHeadersOf } from "./backends.js";

export const AI_SHOT_MAX = 4;
export const AI_MAX_SHOT_SIDE = 2752, AI_MAX_SHOT_KEEP_BYTES = 2 * 1024 * 1024;
export function aiB64Bytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export function aiShotLine(path) { return "(screenshot: " + path + ")"; }
export async function aiShotUpload(host, bytes, mime) { // shared by a capture and a picked file
  const r = await fetch(aiUrlOf(host) + "/v1/shot", {method: "POST", headers: {...aiHeadersOf(host), "content-type": mime}, body: bytes});
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.path) throw new Error(j.error && j.error.message || "HTTP " + r.status);
  return j.path;
}
export function aiShotOutgoing(text, paths) { // what Send sends: the note, then each shot's line; the box never holds any of it
  if (!paths || !paths.length) return text;
  return (text || "(screenshot only)") + paths.map(p => "\n" + aiShotLine(p)).join("");
}
export function aiShotDisplayText(text) { // a bubble shows the lines as 📷 glyphs, one per shot
  const m = text.match(/\n\(screenshot: [^)]*\)/g);
  if (!m) return text;
  const head = text.slice(0, text.length - m.join("").length);
  const icons = "📷".repeat(m.length);
  return head === "(screenshot only)" ? icons : head + " " + icons;
}
export async function aiPrepImage(file) { // → {bytes, mime}: downscale if huge, re-export HEIC/HEIF as JPEG, else keep the original bytes
  const heic = /heic|heif/i.test(file.type || "") || /\.(heic|heif)$/i.test(file.name || "");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("couldn't read that picture")); img.src = url; });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const longest = Math.max(w0, h0);
    if (!heic && file.size <= AI_MAX_SHOT_KEEP_BYTES && longest <= AI_MAX_SHOT_SIDE) {
      return {bytes: new Uint8Array(await file.arrayBuffer()), mime: /png/i.test(file.type) ? "image/png" : "image/jpeg"};
    }
    const scale = longest > AI_MAX_SHOT_SIDE ? AI_MAX_SHOT_SIDE / longest : 1;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * scale)); c.height = Math.max(1, Math.round(h0 * scale));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) throw new Error("couldn't convert that picture");
    return {bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/jpeg"};
  } finally { URL.revokeObjectURL(url); }
}
export function aiCanCaptureTab() { return !!(typeof navigator !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia); }
export async function aiShotCaptureTab() { // → {bytes, mime}: the browser shares its own tab (Chrome asks once per shot)
  if (!aiCanCaptureTab()) throw new Error("this browser can't take a screenshot (no getDisplayMedia)");
  const stream = await navigator.mediaDevices.getDisplayMedia({video: {displaySurface: "browser"}, audio: false, preferCurrentTab: true});
  try {
    const v = document.createElement("video");
    v.muted = true; v.srcObject = stream; await v.play();
    await new Promise(r => setTimeout(r, 300)); // the share banner settles first
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    return {bytes: new Uint8Array(await blob.arrayBuffer()), mime: "image/png"};
  } finally { stream.getTracks().forEach(t => t.stop()); }
}
