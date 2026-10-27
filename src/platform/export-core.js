// src/platform/export-core.js — File → "Export everything…" (docs/plans/2026-10-21-native-ipad.md P0,
// "Revision after Fable review"): the READ-ONLY engine. No imports on purpose: every
// collaborator is injected (session/export-all.js wires the real ones), so the tests drive it
// with fakes and a write-spy. It never writes, renames or deletes a localStorage key or an
// IndexedDB record, and never touches the open song (S) — songs are serialized straight from
// their stored draft and stored rollnotes list.
export const SECRET_KEYS = ["ff1roll-ghtoken", "ff1roll-aikey", "ff1roll-ai-hosts"]; // left out of the dump (native keeps them in the Keychain); listed as "redacted"
export const EXPORT_PREFIX = "ff1roll-";

export function exportFolderName(date) { return "NightRoll-Export-" + date.toISOString().slice(0, 10); }
// file-name-safe, reversible: % first (so decoding is unambiguous), then / and |
export function encodeName(s) { return String(s).replace(/%/g, "%25").replace(/\//g, "%2F").replace(/\|/g, "%7C"); }
export function decodeName(s) { return String(s).replace(/%2F/g, "/").replace(/%7C/g, "|").replace(/%25/g, "%"); }
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, "0"); }
export function fileNameFor(key) { // encoded; a name too long for a file system keeps its head + a hash of the whole key (the manifest holds the real key)
  const e = encodeName(key);
  return e.length <= 180 ? e : e.slice(0, 150) + "~" + fnv(key);
}

export function toBytes(v) { // ArrayBuffer | typed array | string -> Uint8Array
  if (typeof v === "string") return new TextEncoder().encode(v);
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  throw new Error("not bytes");
}
const isBin = v => v instanceof ArrayBuffer || ArrayBuffer.isView(v);
export function b64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256Js(bytes) { // fallback for a context without crypto.subtle
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const n = bytes.length, padded = new Uint8Array(((n + 9 + 63) >> 6) << 6);
  padded.set(bytes); padded[n] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(n / 0x20000000)); dv.setUint32(padded.length - 4, (n << 3) >>> 0);
  const w = new Uint32Array(64), rr = (x, c) => (x >>> c) | (x << (32 - c));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rr(w[i-15], 7) ^ rr(w[i-15], 18) ^ (w[i-15] >>> 3), s1 = rr(w[i-2], 17) ^ rr(w[i-2], 19) ^ (w[i-2] >>> 10); w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, x => x.toString(16).padStart(8, "0")).join("");
}
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return sha256Js(bytes);
  const d = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return Array.from(d, x => x.toString(16).padStart(2, "0")).join("");
}

// IndexedDB value -> {bytes, kind} | {skipped}. A bare blob goes out as-is; a record (nsf, drafts, ...)
// goes out as JSON with nested binary as {"$bytes": base64}. nsf tracks fetched from the archive
// (they carry `vault`) are NOT copied: the URL is recorded and the track says how to get it back.
export async function idbEntry(store, key, value, nsfUrl, redownload) {
  if (typeof Blob !== "undefined" && value instanceof Blob) return {bytes: new Uint8Array(await value.arrayBuffer()), kind: "bytes"};
  if (isBin(value)) return {bytes: toBytes(value), kind: "bytes"};
  if (value && typeof value === "object" && typeof value.getFile === "function") return {skipped: "a folder handle: only valid on the device that granted it"};
  if (value && typeof value === "object" && typeof value.queryPermission === "function") return {skipped: "a folder handle: only valid on the device that granted it"};
  if (store === "nsf" && value && value.tracks && typeof value.tracks === "object") {
    const tracks = {};
    for (const [base, tr] of Object.entries(value.tracks)) {
      if (tr && tr.vault && tr.bytes) {
        const {bytes, ...rest} = tr, url = nsfUrl(tr.vault);
        tracks[base] = {...rest, redownload: url};
        redownload.push({store, key, track: base, url});
      } else tracks[base] = tr;
    }
    value = {...value, tracks};
  }
  const json = JSON.stringify(value, (k, v) => isBin(v) ? {"$bytes": b64(toBytes(v)), len: toBytes(v).length} : v);
  return {bytes: new TextEncoder().encode(json === undefined ? "null" : json), kind: "json"};
}

export function buildManifest({created, folder, files, songs, redacted, redownloadable, skipped, errors}) {
  const bytes = files.reduce((a, f) => a + f.size, 0);
  return {
    format: "nightroll-export", version: 1, created, folder,
    redacted, // present-but-withheld localStorage keys
    totals: {songs: songs.length, files: files.length, bytes, redownloadable: redownloadable.length, skipped: skipped.length, errors: errors.length},
    files, songs, redownloadable, skipped, errors,
  };
}

const looksJson = s => { try { JSON.parse(s); return true; } catch (err) { return false; } };

// deps: {ls: {keys(), get(k)}, idb: {stores(), keys(store), get(store, key)} | null,
//        draftRead(key), writeMidi(doc), serializeNotesList(list, beats, base, stamp, origin),
//        uniqueCount(list) (the serializer's own dedupe), beatsFor(key), nsfUrl(file), sink: {write(path, data)}, now: Date, onProgress(p)}
// Writes entries one at a time, sequentially (the Filesystem plugin moves base64); returns the manifest.
export async function runExport(deps) {
  const {ls, idb, sink, onProgress} = deps, now = deps.now || new Date();
  const folder = exportFolderName(now);
  const files = [], songs = [], redownloadable = [], skipped = [], errors = [];
  const progress = (phase, done, total, path) => { if (onProgress) onProgress({phase, done, total, path, files: files.length}); };
  const put = async (path, data, extra) => {
    const bytes = toBytes(data);
    await sink.write(path, data);
    const rec = {path, size: bytes.length, sha256: await sha256Hex(bytes), ...(extra || {})};
    files.push(rec);
    return rec;
  };

  const allKeys = ls.keys().filter(k => k.startsWith(EXPORT_PREFIX)).sort();
  const redacted = allKeys.filter(k => SECRET_KEYS.includes(k));
  const lsKeys = allKeys.filter(k => !SECRET_KEYS.includes(k));

  // 1. raw localStorage, verbatim
  for (let i = 0; i < lsKeys.length; i++) {
    const k = lsKeys[i], v = ls.get(k);
    progress("localStorage", i, lsKeys.length, k);
    try { await put("raw/localStorage/" + fileNameFor(k) + ".json", v == null ? "" : v, {key: k, json: looksJson(v)}); }
    catch (err) { errors.push({where: "localStorage " + k, message: err.message || String(err)}); }
  }

  // 2. raw IndexedDB, every record
  if (idb) {
    let stores = [];
    try { stores = await idb.stores(); } catch (err) { errors.push({where: "indexedDB", message: err.message || String(err)}); }
    for (const store of stores) {
      if (store === "repo") { skipped.push({store, key: "*", reason: "re-downloadable cache"}); continue; }
      let keys = [];
      try { keys = await idb.keys(store); } catch (err) { errors.push({where: "idb " + store, message: err.message || String(err)}); continue; }
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i], ks = String(key);
        progress("idb:" + store, i, keys.length, ks);
        try {
          const e = await idbEntry(store, ks, await idb.get(store, key), deps.nsfUrl, redownloadable);
          if (e.skipped) { skipped.push({store, key: ks, reason: e.skipped}); continue; }
          await put("raw/idb/" + store + "/" + fileNameFor(ks), e.bytes, {store, key: ks, kind: e.kind});
        } catch (err) { errors.push({where: "idb " + store + " " + ks, message: err.message || String(err)}); }
      }
    }
  }

  // 3. songs: the stored draft as .mid, the stored rollnotes list as .rollnotes.json
  const songKeys = [...new Set(allKeys.filter(k => k.startsWith("ff1roll-draft-")).map(k => k.slice("ff1roll-draft-".length))
    .concat(allKeys.filter(k => k.startsWith("ff1roll-notes-")).map(k => k.slice("ff1roll-notes-".length))))].sort();
  for (let i = 0; i < songKeys.length; i++) {
    const key = songKeys[i], title = key.split("/").pop().replace(/\.midi?$/i, "");
    const dir = "songs/" + fileNameFor(key.replace(/\.midi?$/i, "")) + "/";
    const song = {key, mid: null, rollnotes: null, problems: []};
    progress("songs", i, songKeys.length, key);
    try {
      const d = ls.get("ff1roll-draft-" + key) == null ? null : await deps.draftRead(key);
      if (d && Array.isArray(d.tracks) && d.tracks.length) {
        const doc = {ppq: d.ppq, timesig: d.timesig, ...(d.source ? {source: d.source} : {}), tempos: d.tempos,
          tracks: d.tracks.map(tr => ({...tr, notes: (tr.notes || []).map(n => ({...n}))}))};
        const notes = doc.tracks.reduce((a, tr) => a + tr.notes.length, 0);
        const rec = await put(dir + title + ".mid", deps.writeMidi(doc), {song: key});
        song.mid = {path: rec.path, notes, tracks: doc.tracks.length};
      } else if (d) song.problems.push("the draft has no tracks (" + (d.tracksRef ? "tracksRef stub but nothing in IndexedDB drafts" : "empty") + ")");
    } catch (err) { song.problems.push("draft: " + (err.message || err)); }
    try {
      const raw = ls.get("ff1roll-notes-" + key);
      if (raw != null) {
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) throw new Error("the stored list is not an array");
        const text = deps.serializeNotesList(list, deps.beatsFor(key), title, undefined, undefined);
        const rec = await put(dir + title + ".rollnotes.json", text, {song: key});
        song.rollnotes = {path: rec.path, stored: list.length, unique: deps.uniqueCount ? deps.uniqueCount(list) : list.length, items: JSON.parse(text).notes.length};
      }
    } catch (err) { song.problems.push("rollnotes: " + (err.message || err)); }
    songs.push(song);
  }

  // 4. manifest last (it describes everything above)
  progress("manifest", 0, 1, "manifest.json");
  const manifest = buildManifest({created: now.toISOString(), folder, files, songs, redacted, redownloadable, skipped, errors});
  await sink.write("manifest.json", JSON.stringify(manifest, null, 1));
  progress("done", 1, 1, "");
  return manifest;
}

export function summaryLine(m) {
  const mb = m.totals.bytes / 1048576;
  return m.totals.songs + " songs, " + m.totals.files + " files, " + (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + " MB" +
    (m.redacted.length ? "; redacted: " + m.redacted.join(", ") : "; nothing redacted") +
    (m.totals.errors ? "; " + m.totals.errors + " ERRORS (see manifest.json)" : "") +
    (m.totals.skipped ? "; " + m.totals.skipped + " skipped" : "");
}
