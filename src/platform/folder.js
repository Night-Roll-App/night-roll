import { LINK_SONGS } from "./base.js";
import { analysisURL } from "./storage.js";
import { songsURL } from "./storage.js";
import { EDITION } from "../edition.js";
import { idbFsGet } from "./storage.js";
import { idbRepoGet } from "./storage.js";
import { idbRepoPut } from "./storage.js";
import { S } from "../state.js";
import { logDebug } from "../hooks.js";

// ---------------------------------------------------- local folder backend
// Saving without GitHub (Josh, 2026-09-15: his son has no account, and
// GitHub removes content on a rights holder's notice — a recording that
// isn't yours needs a home that isn't GitHub). A folder on this computer is
// a fourth data location: reads try the folder first and fall back to the
// site (FF1 songs keep coming from here), every write goes to the folder,
// and the catalog is the site manifest plus a scan of the folder's albums/.
// The layout mirrors the repo exactly, so the folder IS a repo without git.
// Chrome/Edge desktop only (File System Access API); Safari and the iPad
// have no such door. ?folder=opfs swaps in the browser's private sandbox
// (same handle interface, no picker) — that's how tests and browser checks
// drive the whole backend without a native dialog.
export const fsRoot = {handle: null, name: "", mode: null, needsGrant: false};
// mode: "picker" | "opfs"
export function folderActive() { return !!fsRoot.handle && !fsRoot.needsGrant; }
// "my folder only" (Josh's son, 2026-09-17: "how do I open it without seeing
// all of your songs?"): the picker lists the folder and this device's drafts,
// nothing from the site. A device pref — his machine, his list.
export function folderOnly() { return folderActive() && localStorage.getItem("ff1roll-folderonly") === "1"; }
export function folderSupported() { return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function"; }
// The iPad app (Capacitor shell): the app's own Documents folder, visible in
// Files → On My iPad → Night Roll. Same handle interface as the picker and
// OPFS roots, built over the Filesystem plugin, so every seam above stays
// one predicate (folderActive) away. Opt-in like the desktop folder: a
// device pref; nothing changes for a GitHub user until they turn it on.
export function nativeFs() {
  try {
    const c = typeof window !== "undefined" && window.Capacitor;
    if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
    return (c.Plugins && c.Plugins.Filesystem) || null;
  } catch (err) { return null; }
}
export function nativeDirHandle(fs, rel) { // FileSystemDirectoryHandle subset over @capacitor/filesystem (Documents)
  rel = rel || "";
  const DIR = {directory: "DOCUMENTS"};
  const join = n => rel ? rel + "/" + n : n;
  const nf = () => Object.assign(new Error("not found"), {name: "NotFoundError"});
  const enc = () => new TextEncoder();
  const toB64 = d => { // the plugin moves bytes as base64
    const bytes = typeof d === "string" ? enc().encode(d) : d instanceof ArrayBuffer ? new Uint8Array(d) : d;
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const fromB64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
  const statType = async p => { try { return (await fs.stat({path: p, ...DIR})).type; } catch (err) { return null; } };
  return {
    kind: "directory", name: rel.split("/").pop() || "Night Roll",
    async getDirectoryHandle(n, o) {
      const p = join(n), t = await statType(p);
      if (t === "directory") return nativeDirHandle(fs, p);
      if (t !== null || !o || !o.create) throw nf();
      await fs.mkdir({path: p, recursive: true, ...DIR});
      return nativeDirHandle(fs, p);
    },
    async getFileHandle(n, o) {
      const p = join(n), t = await statType(p);
      if (t === "directory" || (t === null && !(o && o.create))) throw nf();
      return {
        kind: "file", name: n,
        async getFile() {
          const r = await fs.readFile({path: p, ...DIR});
          const bytes = typeof r.data === "string" ? fromB64(r.data) : new Uint8Array(await r.data.arrayBuffer());
          return {name: n, size: bytes.length, text: async () => new TextDecoder().decode(bytes), arrayBuffer: async () => bytes.buffer};
        },
        async createWritable() {
          return {async write(d) { await fs.writeFile({path: p, data: toB64(d), recursive: true, ...DIR}); }, async close() {}};
        },
      };
    },
    async removeEntry(n) { try { await fs.deleteFile({path: join(n), ...DIR}); } catch (err) { throw nf(); } },
    async *entries() {
      let r;
      try { r = await fs.readdir({path: rel, ...DIR}); } catch (err) { return; }
      for (const f of r.files || [])
        yield [f.name, f.type === "directory" ? nativeDirHandle(fs, join(f.name)) : {kind: "file", name: f.name}];
    },
  };
}
export async function folderPermission(request) { // "granted" | "prompt" | "denied"; OPFS has no permission model
  const h = fsRoot.handle;
  if (!h) return "denied";
  if (typeof h.queryPermission !== "function") return "granted";
  let p = await h.queryPermission({mode: "readwrite"});
  if (p === "prompt" && request && typeof h.requestPermission === "function") p = await h.requestPermission({mode: "readwrite"});
  return p;
}
export async function fsDirFor(path, create, root) { // parent directory handle for a repo-style path (root: the folder root by default)
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop();
  let dir = root || fsRoot.handle;
  for (const seg of parts) dir = await dir.getDirectoryHandle(seg, {create: !!create});
  return {dir, name};
}
export async function folderRead(path) { // File, or null when absent (or the folder isn't usable)
  if (!folderActive()) return null;
  try {
    const {dir, name} = await fsDirFor(path, false);
    const fh = await dir.getFileHandle(name);
    return await fh.getFile();
  } catch (err) { return null; }
}
export async function folderWrite(path, data, root) { // data: string | Uint8Array; creates directories
  const {dir, name} = await fsDirFor(path, true, root);
  const fh = await dir.getFileHandle(name, {create: true});
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}
export async function folderDelete(path) { // true when the file is gone (deleted or never there)
  try {
    const {dir, name} = await fsDirFor(path, false);
    await dir.removeEntry(name);
    return true;
  } catch (err) { return err && err.name === "NotFoundError"; }
}
export async function fsReadJSON(dir, name) {
  try { return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()); }
  catch (err) { return null; }
}
// One read door for songs + analysis: folder first, then the configured
// site. Returns a Response-shaped object so the call sites don't care which.
export async function readData(which, path, bust) {
  const f = LINK_SONGS ? null : await folderRead(path);
  if (f) return {ok: true, status: 200, fromFolder: true,
    text: () => f.text(), arrayBuffer: () => f.arrayBuffer(), json: async () => JSON.parse(await f.text())};
  const url = (which === "analysis" ? analysisURL(path) : songsURL(path)) + (bust ? "?t=" + Date.now() : "");
  // a fetch that never settles used to lock the loader for good (open-items:
  // "song open hangs on a CDN blip"); 12 s then give up and say so
  const net = async (ms) => {
    const i = {cache: "no-cache"};
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) i.signal = AbortSignal.timeout(ms || 12000);
    if (EDITION === "app" && bundledPath(path)) { // the app ships the starters: the repo copy (annotations published there) wins, the bundle answers otherwise
      let r = null;
      try { r = await fetch(url, i); } catch (err) { r = null; }
      if (r && r.ok) return r;
      return fetch(path + (bust ? "?t=" + Date.now() : ""), i); // relative: the <base> is the bundle
    }
    return fetch(url, i);
  };
  if (EDITION === "app") return repoCopy(which + ":" + path, net, bust);
  return net(); // the web: sw.js keeps its copies
}
// The app has no service worker (capacitor://), so every open went to GitHub
// — slow, and past readData's 12 s a song failed with "Fetch is aborted"
// (Josh, Terminal #304/#308/#309). Keep a device copy: a plain read answers
// from it at once and refreshes it in the background (a re-capture arrives
// on the next open); a bust read (annotations, a just-published file) asks
// GitHub first — 4 s when a copy can stand in — then falls back to the copy.
export async function repoCopy(key, net, bust) {
  const hit = await idbRepoGet(key);
  const answer = bytes => ({ok: true, status: 200, fromCopy: true, arrayBuffer: async () => bytes.slice(0),
    text: async () => new TextDecoder().decode(bytes), json: async () => JSON.parse(new TextDecoder().decode(bytes))});
  if (hit && !bust) { repoRefresh(key, net, hit.bytes); return answer(hit.bytes); }
  let r = null, err0 = null;
  try { r = await net(hit ? 4000 : 0); } catch (err) { err0 = err; }
  if (r && r.ok) { if (typeof r.arrayBuffer !== "function") return r; const bytes = await r.arrayBuffer(); idbRepoPut(key, bytes); return answer(bytes); }
  if (r && r.status === 404) { if (hit) idbRepoPut(key, null); return r; } // gone from the repo: so is the copy
  if (hit) return answer(hit.bytes);
  if (err0) throw err0;
  return r;
}
export function repoRefresh(key, net, had) {
  if (S.repoRefreshing.has(key)) return;
  S.repoRefreshing.add(key);
  (async () => {
    try {
      const r = await net();
      if (r && r.status === 404) { idbRepoPut(key, null); return; }
      if (!r || !r.ok || typeof r.arrayBuffer !== "function") return;
      const bytes = await r.arrayBuffer();
      const a = new Uint8Array(bytes), b = new Uint8Array(had);
      let same = a.length === b.length;
      for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
      if (same) return;
      await idbRepoPut(key, bytes);
      logDebug("newer copy of " + key.replace(/^\w+:/, "") + " downloaded — the next open plays it");
    } catch (err) { /* offline or slow: the copy stands */ } finally { S.repoRefreshing.delete(key); }
  })();
}
export function bundledPath(path) { return /^albums\/starters\//.test(path); }
export async function restoreFolder() { // boot: the remembered folder, or the OPFS sandbox on request
  try {
    const q = typeof location !== "undefined" && /[?&]folder=opfs\b/.test(location.search);
    if (q && navigator.storage && navigator.storage.getDirectory) {
      fsRoot.handle = await navigator.storage.getDirectory();
      fsRoot.name = "browser sandbox (opfs)"; fsRoot.mode = "opfs"; fsRoot.needsGrant = false;
      return;
    }
    const h = await idbFsGet();
    if (!h) return;
    fsRoot.handle = h; fsRoot.name = h.name; fsRoot.mode = "picker";
    fsRoot.needsGrant = (await folderPermission(false)) !== "granted"; // reads fall back to the site until reconnected
  } catch (err) { fsRoot.handle = null; }
}
