import { S } from "../state.js";
import { EDITION } from "../edition.js";
import { LINK_SONGS } from "./base.js";

// bytes: this device's IndexedDB first (written at import, BEFORE decode —
// Safari's decodeAudioData detaches the input buffer), then the song's
// .audio/ directory wherever the song lives (folder, then site).
export async function idbAudioPut(key, bytes, mime) {
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction("audio", "readwrite");
      tx.objectStore("audio").put({bytes, mime, t: Date.now()}, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch (err) { return false; }
}
export async function idbAudioGet(key) {
  try {
    const db = await idbOpen();
    const rec = await new Promise(res => {
      const r = db.transaction("audio").objectStore("audio").get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
    db.close();
    return rec;
  } catch (err) { return null; }
}
export async function idbAudioDelete(key) {
  try {
    const db = await idbOpen();
    await new Promise(res => { const tx = db.transaction("audio", "readwrite"); tx.objectStore("audio").delete(key); tx.oncomplete = res; tx.onerror = res; });
    db.close();
  } catch (err) { /* nothing to drop */ }
}
// a rename carries the song's recordings (keys "<songKey>|<file>") to the new key;
// without this an unpublished take was orphaned under the old name
export async function idbAudioMove(oldKey, newKey) {
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction("audio", "readwrite"), st = tx.objectStore("audio");
      const r = st.openCursor(IDBKeyRange.bound(oldKey + "|", oldKey + "|\uffff"));
      r.onsuccess = () => { const c = r.result; if (!c) return; st.put(c.value, newKey + c.key.slice(oldKey.length)); c.delete(); c.continue(); };
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (err) { /* nothing stored */ }
}
// an imported SoundFont's raw bytes, keyed by slug — same shape/reasons as idbAudioPut/Get
// ("Game instrument libraries" step 4): this device's copy, so an sf2: voice keeps working
// offline and without GitHub even after the tab reloads.
export async function idbSf2Put(slug, bytes) {
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => { const tx = db.transaction("sf2", "readwrite"); tx.objectStore("sf2").put(bytes, slug); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    db.close();
    return true;
  } catch (err) { return false; }
}
export async function idbSf2Get(slug) {
  try {
    const db = await idbOpen();
    const bytes = await new Promise(res => { const r = db.transaction("sf2").objectStore("sf2").get(slug); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
    db.close();
    return bytes;
  } catch (err) { return null; }
}
export function draftStoreKey(key) { return "ff1roll-draft-" + key; }
// ---------------------------------------------------------------- NSF import
// Import… byte-sniffs the picked file: MIDI loads as before; an NSF (NESM
// header) opens the capture panel instead. Capture runs the ROM's play
// routine through the SAME 6502/APU pipeline that dumped the FF1 album
// (tools/nsf/*.mjs, dynamically imported off Pages — one code path, zero
// drift), loop-detects, trims to intro + one pass, grid-fits a tempo, and
// stashes each track as a LOCAL draft under albums/imports/<album>/.
// Nothing touches the repo until Commit (Josh's ruling 2026-08-15: audition
// first — a bad capture never gets committed). ✕ the duds in Open → drafts;
// Commit pushes the keepers: .mid + loop rollnotes + album.json + manifest.
// Expansion-chip NSFs (VRC6/VRC7/FDS/MMC5/N163/5B) are refused by parseNSF:
// their lead voices live on the extra chip, so a 2A03-only capture is half
// a song (Lagrange Point: 12 of 31 tracks silent, 2026-09-27).
export const IMP_DIR = "albums/imports/";
// legacy: where captures landed before the console folders (2026-09-27); still read-only
export const CONSOLE_OF = {nsf: "nes", gbs: "game-boy", spc: "snes", vgm: "genesis", psf: "ps1", psf2: "ps2", usf: "n64"};
// NSFs are NEVER committed (.gitignore *.nsf — ROM music stays out of the
// public repo). For chip audio across reloads, the bytes persist in THIS
// device's IndexedDB at import time instead: private, offline, zero
// redistribution. Each device imports the NSF once.
export function idbOpen() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open("ff1roll", 5); // v2: "fs" holds the local-folder handle; v3: "audio" clip bytes; v4: "drafts" = import drafts' notes; v5: "sf2" = imported SoundFont bytes
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains("nsf")) db.createObjectStore("nsf");
      if (!db.objectStoreNames.contains("fs")) db.createObjectStore("fs");
      if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio");
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts");
      if (!db.objectStoreNames.contains("sf2")) db.createObjectStore("sf2");
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
export function idbNsfPut(slug, bytes, trackPatch, chipKind, libs) { // libs: {name: bytes} — a set's shared library (PS1 .psflib), merged in
  // serialized: rapid captures fired concurrent read-modify-writes and lost
  // track entries — only 9 of TMNT's 24 songs reached the committed chip map
  const p = S._idbQueue.then(() => idbNsfPutNow(slug, bytes, trackPatch, chipKind, libs));
  S._idbQueue = p.catch(() => { /* keep the queue alive */ });
  return p;
}
export async function idbNsfPutNow(slug, bytes, trackPatch, chipKind, libs) {
  try {
    const db = await idbOpen();
    const cur = await new Promise(res => {
      const r = db.transaction("nsf").objectStore("nsf").get(slug);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
    const rec = {bytes: bytes || (cur && cur.bytes), tracks: {...(cur ? cur.tracks : {}), ...(trackPatch || {})}, chip: chipKind || (cur && cur.chip) || "nsf"};
    if ((cur && cur.libs) || libs) rec.libs = {...((cur && cur.libs) || {}), ...(libs || {})};
    await new Promise((res, rej) => {
      const tx = db.transaction("nsf", "readwrite");
      tx.objectStore("nsf").put(rec, slug);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (err) { /* private mode etc: chip audio stays session-only */ }
}
// ---- big drafts (2026-09-27; Josh imported Chrono Trigger's 92 songs on the
// iPad: "quota has been exceeded", and the album vanished). localStorage
// holds ~5 MB per site and 92 captured SNES songs are 6 MB of notes. An
// import's or local MIDI's draft keeps a small STUB in localStorage
// (flags, title, tempo, meter — everything the lists and Publish read
// synchronously) with tracksRef: 1, and its tracks in IndexedDB "drafts"
// under the same key. His own compositions stay whole in localStorage:
// small, synchronous, proven. Reads that need notes (open, load, commit)
// go through draftRead; every writer goes through draftWrite; ✕/rename/
// revert keep the store in step. All IDB traffic rides _idbQueue so a
// put, a rename and the open that follows land in order.
export function draftInIdb(key) { // big drafts (captures, imported files) keep their notes in IndexedDB; compositions stay whole in localStorage
  return typeof indexedDB !== "undefined" && (key.startsWith(IMP_DIR) || key.startsWith("local/") ||
    Object.values(CONSOLE_OF).some(c => key.startsWith("albums/" + c + "/")));
}
export function idbDraftOp(fn) { const p = S._idbQueue.then(fn); S._idbQueue = p.catch(() => { /* keep the queue alive */ }); return p; }
// true once the notes landed
export function idbDraftGet(key) { return idbDraftOp(async () => { try { const db = await idbOpen(); const v = await new Promise(res => { const r = db.transaction("drafts").objectStore("drafts").get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); db.close(); return v; } catch (err) { return null; } }); }
export function idbDraftDelete(key) { return idbDraftOp(async () => { try { const db = await idbOpen(); await new Promise((res, rej) => { const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); } catch (err) { /* nothing stored */ } }); }
export function idbDraftMove(oldKey, newKey) { return idbDraftOp(async () => { try { const db = await idbOpen(); const v = await new Promise(res => { const r = db.transaction("drafts").objectStore("drafts").get(oldKey); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); if (v !== null) await new Promise((res, rej) => { const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put(v, newKey); tx.objectStore("drafts").delete(oldKey); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); } catch (err) { /* nothing stored */ } }); }
export async function idbNsfGet(slug) {
  try {
    const db = await idbOpen();
    const rec = await new Promise(res => {
      const r = db.transaction("nsf").objectStore("nsf").get(slug);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
    db.close();
    return rec;
  } catch (err) { return null; }
}
// ---------------------------------------------------- data-location config
// Josh's design (2026-08-17, advisor-reviewed): the app is CONFIGURED with
// where songs, analysis (rollnotes + docs), and NSFs live, so another analyst
// can point their own analysis repo at a shared songs corpus. Read locations
// are BASE URLS ("" = this origin, relative — today's behavior; or any
// https://raw.githubusercontent.com/<owner>/<repo>/<branch> or local server);
// write targets are owner/repo for the GitHub Contents API. One fine-grained
// token (ff1roll-ghtoken) granted per-repo covers all writes.
export function cfg() {
  if (!cfg.c) {
    let c = {};
    try { c = JSON.parse(localStorage.getItem("ff1roll-cfg") || "{}"); } catch (err) { /* corrupt: defaults */ }
    // 2026-09-29: the repos moved to the Night-Roll-App organization. A
    // device's saved settings name the old home; read them as the new one
    // (GitHub redirects old paths for a while, but not forever, and not every
    // write) — one pass, persisted by the next saveCfg.
    for (const k of Object.keys(c)) if (typeof c[k] === "string") c[k] = c[k].replace(/joshcough\/(night-roll|nsf-archive)(?![\w.-])/g, "Night-Roll-App/$1");
    // The app edition: "this site" is the app bundle (starters only), so reads
    // default to the repo the user configured — the same place Publish writes
    // (Josh, 2026-09-27, in the app: "why didn't it show the songs that I
    // currently have up there since I put my repo in"). Starters still come
    // from the bundle (readData falls back to it).
    // The derived base is NOT stored (saveCfg persists cfg() whole; a stored
    // base would outlive a repo change) — readBase() computes it per read.
    cfg.c = {
      songsBase: c.songsBase || "",
      analysisBase: c.analysisBase || "",
      songsRepo: c.songsRepo || "Night-Roll-App/night-roll",
      analysisRepo: c.analysisRepo || c.songsRepo || "Night-Roll-App/night-roll", // a new user's annotations go where their songs go
      // the NSF archive is Josh's (public, separate so a takedown can't touch the
      // songs repo); anyone whose songs repo is not this site's starts with none —
      // imported NSFs then stay on the device (Josh, 2026-09-26)
      nsfRepo: c.nsfRepo !== undefined ? c.nsfRepo : ((c.songsRepo || "Night-Roll-App/night-roll") === "Night-Roll-App/night-roll" ? "Night-Roll-App/nsf-archive" : ""),
      nsfBase: c.nsfBase || (c.nsfRepo ? "https://raw.githubusercontent.com/" + c.nsfRepo + "/main" : "https://raw.githubusercontent.com/Night-Roll-App/nsf-archive/main"),
      // ✦ AI: flat fields (saveCfg is a shallow merge); the key lives apart, like the token
      aiBackend: c.aiBackend === "browser" ? "browser" : "remote",
      aiBrowserModel: c.aiBrowserModel || "Llama-3.2-1B-Instruct-q4f16_1-MLC",
      aiUrl: c.aiUrl || "http://localhost:1234",
      aiModel: c.aiModel || "",
      aiWindow: +c.aiWindow || 8192,
    };
  }
  return cfg.c;
}
export function saveCfg(patch) {
  const c = {...cfg(), ...patch};
  localStorage.setItem("ff1roll-cfg", JSON.stringify(c));
  cfg.c = null;
}
export function baseJoin(base, path) { return base ? base.replace(/\/+$/, "") + "/" + path : path; }
// what tools/package.mjs ships (ALLOWED_ALBUM_DIRS)
export async function idbFsGet() {
  try {
    const db = await idbOpen();
    const rec = await new Promise(res => {
      const r = db.transaction("fs").objectStore("fs").get("root");
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
    db.close();
    return rec;
  } catch (err) { return null; }
}
export async function idbFsPut(handle) { // null forgets the folder
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction("fs", "readwrite");
      if (handle) tx.objectStore("fs").put(handle, "root"); else tx.objectStore("fs").delete("root");
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (err) { /* private mode: the folder lasts this session */ }
}
export function readBase(which) { // "songs" | "analysis": the explicit base, else (app edition) the configured repo, else this site
  const c = cfg(), explicit = which === "analysis" ? c.analysisBase : c.songsBase;
  if (explicit) return explicit;
  if (EDITION === "app") return "https://raw.githubusercontent.com/" + (which === "analysis" ? c.analysisRepo : c.songsRepo) + "/main";
  return "";
}
export function songsURL(path) { return baseJoin(LINK_SONGS || readBase("songs"), path); }
// .mid, album.json, manifest.json
export function analysisURL(path) { return baseJoin(LINK_SONGS || readBase("analysis"), path); }
// .rollnotes.json + docs (mirror tree: same base)
export function nsfURL(file) { return baseJoin(cfg().nsfBase, file); }
export function repoName(which) { return cfg()[which + "Repo"]; }
export function repoApi(which) { return "https://api.github.com/repos/" + repoName(which) + "/contents/"; }
// Contents-API failure -> an error that names the repo; fine-grained tokens
// make invisible repos 404, so that reads as a scope problem, not a bug
export function apiError(which, r, what) {
  if (r.status === 404 || r.status === 403)
    return new Error(what + ": token can't see " + repoName(which) + " (HTTP " + r.status +
                     ") — edit the token on GitHub and add that repo to it");
  return new Error(what + " → " + repoName(which) + " HTTP " + r.status);
}
