// src/session/export-all.js — File → "Export everything…": the real wiring for platform/export-core.js
// (docs/plans/2026-10-21-native-ipad.md P0). READ ONLY on every stored thing: localStorage is only
// listed and read, IndexedDB is opened with no version (no upgrade) and only read in readonly
// transactions, and no song is loaded into the editor.
import { runExport, exportFolderName, summaryLine, toBytes } from "../platform/export-core.js";
import { writeMidi } from "../midi/write.js";
import { serializeNotesList, declaredTsForKey, dedupedNotesWithIndex } from "../model/rollnotes.js";
import { nsfURL } from "../platform/storage.js";
import { nativeFs, nativeDirHandle, folderWrite } from "../platform/folder.js";

export const exportState = {running: false}; // one export at a time

function lsAdapter() {
  return {
    keys() { return Object.keys(localStorage); },
    get(k) { return localStorage.getItem(k); },
  };
}
function idbAdapter() { // read-only: open the current version as-is (never onupgradeneeded), readonly transactions
  if (typeof indexedDB === "undefined") return null;
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const rq = indexedDB.open("ff1roll"); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }));
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
    async stores() { return Array.from((await db()).objectStoreNames); },
    async keys(store) { return req((await db()).transaction(store, "readonly").objectStore(store).getAllKeys()); },
    async get(store, key) { return req((await db()).transaction(store, "readonly").objectStore(store).get(key)); },
    async close() { if (dbp) (await dbp).close(); },
  };
}

// ---- sinks: write(path, data) one entry at a time
export function nativeSink(folder) { // the iPad: Documents/<folder>/ via the Files-mirror code (Capacitor Filesystem, base64)
  const root = nativeDirHandle(nativeFs(), "");
  return {where: "Files → Night Roll → " + folder, write: (path, data) => folderWrite(folder + "/" + path, data, root)};
}
export async function pickedFolderSink(folder) { // desktop Chrome/Edge: the user picks a parent folder; must be called from the click
  const parent = await window.showDirectoryPicker({mode: "readwrite"});
  const dir = await parent.getDirectoryHandle(folder, {create: true});
  return {where: parent.name + "/" + folder, write: (path, data) => folderWrite(path, data, dir)};
}
export function zipSink(folder) { // everything else: a store-only .zip, downloaded at the end
  const parts = [], central = [];
  let offset = 0;
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const hdr = (n, f) => { const b = new DataView(new ArrayBuffer(n)); f(b); return new Uint8Array(b.buffer); };
  return {
    where: folder + ".zip (Downloads)",
    async write(path, data) {
      const bytes = toBytes(data), name = new TextEncoder().encode(folder + "/" + path), c = crc(bytes);
      const local = hdr(30, v => { v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint32(14, c, true); v.setUint32(18, bytes.length, true); v.setUint32(22, bytes.length, true); v.setUint16(26, name.length, true); });
      parts.push(local, name, bytes);
      central.push({name, c, size: bytes.length, offset});
      offset += 30 + name.length + bytes.length;
    },
    finish() {
      const cd = [];
      let cdSize = 0;
      for (const e of central) {
        const h = hdr(46, v => { v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true); v.setUint32(16, e.c, true); v.setUint32(20, e.size, true); v.setUint32(24, e.size, true); v.setUint16(28, e.name.length, true); v.setUint32(42, e.offset, true); });
        cd.push(h, e.name); cdSize += 46 + e.name.length;
      }
      const end = hdr(22, v => { v.setUint32(0, 0x06054b50, true); v.setUint16(8, central.length, true); v.setUint16(10, central.length, true); v.setUint32(12, cdSize, true); v.setUint32(16, offset, true); });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([...parts, ...cd, end], {type: "application/zip"}));
      a.download = folder + ".zip";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    },
  };
}

// versions.js draftRead, read-only: the same two shapes (a whole localStorage copy, or a tracksRef stub whose notes are in
// IndexedDB "drafts" — a bare tracks array for imports, {seq, tracks} for local/ drafts), through the readonly adapter above,
// so no versioned open (a possible upgrade) and no shared write queue.
async function readDraft(key, idb, ls) {
  const raw = ls.get("ff1roll-draft-" + key);
  if (raw == null) return null;
  let d = null; try { d = JSON.parse(raw); } catch (err) { return null; }
  if (d && d.tracksRef && !d.tracks) {
    let v = null;
    try { v = idb ? await idb.get("drafts", key) : null; } catch (err) { v = null; }
    d.tracks = (v ? (Array.isArray(v) ? v : v.tracks) : null) || [];
  }
  return d;
}

export async function exportEverythingRun(sink, onProgress, now) {
  const idb = idbAdapter(), ls = lsAdapter();
  try {
    return await runExport({
      ls, idb, sink, onProgress, now: now || new Date(),
      draftRead: key => readDraft(key, idb, ls), writeMidi, serializeNotesList, uniqueCount: l => dedupedNotesWithIndex(l).length, nsfUrl: nsfURL,
      beatsFor: key => (declaredTsForKey(key) || [4])[0],
    });
  } finally { if (idb) await idb.close(); }
}

// the File-menu row: pick the destination (the picker needs the click's gesture), run; resolves to the one-line result (chrome.js shows it in the info line)
export async function exportEverythingUI(statusEl) {
  if (exportState.running) return;
  exportState.running = true;
  const say = s => { if (statusEl) { statusEl.style.display = ""; statusEl.textContent = s; } };
  try {
    const now = new Date(), folder = exportFolderName(now);
    let sink;
    if (nativeFs()) sink = nativeSink(folder);
    else if (typeof window.showDirectoryPicker === "function") sink = await pickedFolderSink(folder);
    else sink = zipSink(folder);
    say("exporting…");
    const m = await exportEverythingRun(sink, p => say("exporting " + p.phase + (p.total > 1 ? " " + p.done + "/" + p.total : "") + " — " + p.files + " files written"), now);
    if (sink.finish) sink.finish();
    const msg = "Export done → " + sink.where + ": " + summaryLine(m);
    say(msg);
    return msg;
  } catch (err) {
    if (err && err.name === "AbortError") { say("export cancelled"); return null; }
    const msg = "⚠ export failed: " + (err && err.message || err);
    say(msg);
    return msg;
  } finally { exportState.running = false; }
}
