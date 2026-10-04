import { CONSOLE_OF } from "../platform/storage.js";
import { draftKeys } from "../model/versions.js";
import { isCaptureKey } from "../model/provenance.js";
import { S } from "../state.js";
import { titleCaseSlug } from "../model/catalog.js";
import { sf2Module } from "../audio/voices.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { slugify } from "../model/provenance.js";
import { idbSf2Put } from "../platform/storage.js";
import { sf2Fonts } from "../audio/voices.js";
import { sf2RegistryAdd } from "../ui/sheets.js";
import { folderActive } from "../platform/folder.js";
import { cfg } from "../platform/storage.js";
import { writeToken } from "../sync/publish.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { nsfURL } from "../platform/storage.js";
import { repoApi } from "../platform/storage.js";
import { ghHeaders } from "../audio/chip.js";
import { midiBase64 } from "../audio/bounce.js";
import { chipModules } from "../audio/chip.js";
import { CHIPS } from "../audio/chip.js";
import { logErrImpl as logErr } from "../ui/chrome.js";
import { askCopyText } from "../ui/sheets.js";
import { draftStoreKey } from "../platform/storage.js";
import { idbDraftMove } from "../platform/storage.js";
import { rememberLastSong } from "../platform/base.js";
import { reflectSongURL } from "../session/song.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { readData } from "../platform/folder.js";

// "Replace file…" from a clip sheet targets this track
// Streamed-audio containers Night Roll cannot read as notes, by name only —
// no game table (CLAUDE.md): GENH (vgmstream's generic-header wrapper around
// a raw PCM/ADPCM stream, e.g. Zophar's Ico "PSF2" pack) and Ubisoft's own
// SShd/SSbd stream container (XIII) — both settled against real files,
// docs/plans/ps2.md "Findings (milestone 1)". Neither carries sequence
// (note) data at all, so a mini/lib PSF2 reader would never help here.
export function streamedAudioMagic(b) {
  const s = (o, n) => b.length >= o + n && String.fromCharCode(...b.subarray(o, o + n));
  return s(0, 4) === "GENH" || s(0, 4) === "SShd";
}
export function audioMagic(b) { // wav / aiff / mp3 / m4a-mp4 / flac / ogg by their first bytes
  const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length < 12) return false;
  if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return true;
  if (s(0, 4) === "FORM" && /^AIF[FC]$/.test(s(8, 4))) return true;
  if (s(0, 3) === "ID3") return true;
  if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return true; // MPEG frame sync
  if (s(4, 4) === "ftyp") return true;
  if (s(0, 4) === "fLaC" || s(0, 4) === "OggS") return true;
  return false;
}
// SoundFont 2: RIFF + 'sfbk' at byte 8 (a WAV is RIFF + 'WAVE' — the same container,
// a different four-char type tag right after the size, so this must run before
// audioMagic would otherwise be tempted to guess by RIFF alone)
export function sf2Magic(b) {
  if (b.length < 12) return false;
  const s = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  return s(0, 4) === "RIFF" && s(8, 4) === "sfbk";
}
export function impDirFor(kind) { return "albums/" + (CONSOLE_OF[kind] || "imports") + "/"; }
// a capture's folder: albums/<console>/<game>/
export function importDraftKeys() { return draftKeys().filter(isCaptureKey); }
export function impTrackKey(slug, n) { return impDirFor(S.nsfSess && S.nsfSess.chip) + slug + "/track-" + String(n).padStart(2, "0") + ".mid"; }
// display name for a committed import: the typed title verbatim ("Dr. Wily's
// Castle") — a bare slug just gets prettified ("airship" -> "Airship")
export function impDisplayTitle(d, base) {
  const t = d && d.title;
  if (!t) return titleCaseSlug(base);
  return /^[a-z0-9-]+$/.test(t) ? titleCaseSlug(t) : t;
}
// ---- captures as jobs: Capture all and a single row both run inside one;
// the panel keeps painting its rows (hidden or not), the ⏳ list shows the
// same items, and a reload marks a dead run interrupted with its counts.
export function impTrackLabel(e) { return (e && (e.title || e.name)) || ("track " + (e ? e.n : "?")); }

export const SF2_SIZE_WARN = 50e6, SF2_SIZE_REFUSE = 95e6; // GitHub itself warns over 50 MB, rejects over 100 MB in the Contents API
// File → Import…'s .sf2 route: parse it (tools/instruments/sf2.mjs), keep a copy on
// this device (IndexedDB, so it plays offline and even with no GitHub token at all),
// and — a song depends on it, so it has to live somewhere every device can reach —
// push it to the game files & instruments repo's soundfonts/<slug>.sf2, check-before-
// PUT like every other archive file this app writes.
export async function importSf2File({name, bytes}) {
  let font;
  try { font = (await sf2Module()).parseSf2(bytes); }
  catch (err) { setInfo("⚠ " + name + " didn't load: " + err.message); return; }
  const slug = slugify(font.name || name.replace(/\.sf2$/i, "")) || "soundfont";
  const mb = bytes.length / 1e6;
  await idbSf2Put(slug, bytes);
  sf2Fonts.set(slug, Promise.resolve(font));
  sf2RegistryAdd(slug, font.name || name.replace(/\.sf2$/i, ""));
  setInfo("✓ " + (font.name || name) + ": " + font.presets.length + " preset" + (font.presets.length === 1 ? "" : "s") + " — pick them in a track's voice menu under Soundfonts");
  if (mb > SF2_SIZE_REFUSE) { setInfo("⚠ " + (font.name || name) + " is " + mb.toFixed(0) + " MB — over the archive's 95 MB limit, so it stays on this device only (still usable there)"); return; }
  if (folderActive() || !cfg().nsfRepo) { if (!folderActive()) setInfo("(" + (font.name || name) + " stays on this device — set a game files & instruments repo in Settings → GitHub → advanced to share it with your other devices)"); return; }
  const token = writeToken();
  if (!token) { setInfo("(" + (font.name || name) + " stays on this device — add a GitHub token in Settings to share it)"); return; }
  if (mb > SF2_SIZE_WARN) {
    const go = await appConfirm("LARGE SOUNDFONT — " + mb.toFixed(0) + " MB", "GitHub warns about files over 50 MB in the archive. It plays fine on this device either way; uploading just makes it reach your other devices too.", "Upload to the archive", "Keep on this device only");
    if (!go) return;
  }
  const file = "soundfonts/" + slug + ".sf2";
  try {
    const chk = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
    if (chk.ok) return; // already there (a previous import, or another device's) — nothing to do
    setInfo("uploading " + (font.name || name) + " (" + mb.toFixed(1) + " MB) to the archive…");
    const put = await fetch(repoApi("nsf") + file, {method: "PUT", headers: ghHeaders(token), body: JSON.stringify({
      message: "SoundFont " + slug + " (" + font.presets.length + " presets)", branch: "main", content: midiBase64(bytes)})});
    if (!put.ok) throw new Error("HTTP " + put.status);
    const verify = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
    const verifyBytes = verify.ok ? new Uint8Array(await verify.arrayBuffer()) : null;
    if (!verifyBytes || verifyBytes.length !== bytes.length)
      setInfo("⚠ " + (font.name || name) + " uploaded, but the archive copy's size doesn't match yet (CDN lag?) — it should catch up shortly");
    else setInfo("✓ " + (font.name || name) + " is in the archive — your other devices can play it now");
  } catch (err) { setInfo("⚠ soundfont upload failed (" + err.message + ") — " + (font.name || name) + " stays on this device only"); }
}
export function slugFile(name) { // the kv grammar is \S+: no spaces, no weirdness
  const m = name.match(/^(.*?)(\.[A-Za-z0-9]+)?$/);
  const base = slugify(m[1] || "take"), ext = (m[2] || "").toLowerCase();
  return base + ext;
}
export function monoWavBytes(buffer) { // 16-bit PCM mono WAV: lossless for a mono source, half a stereo bounce
  const sr = buffer.sampleRate, data = buffer.getChannelData(0), n = data.length;
  const out = new ArrayBuffer(44 + n * 2), v = new DataView(out);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, data[i])); v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true); }
  return new Uint8Array(out);
}
export const AUDIO_SIZE_GATE = 20e6; // bytes: RAM is paid at import, git at Save — nudge, don't wall
export function chipTrackOrder(files) { // a set's files in disc/track/part order, unlisted (99/999) last; anything unparsable by name
  const M = chipModules.cache && chipModules.cache.spc;
  const key = f => { const t = M && M.parseTrackName ? M.parseTrackName(f.name) : null; return t ? [t.unlisted ? 1 : 0, t.disc || 0, t.track, t.part || ""] : [2, 0, 0, f.name]; };
  return files.slice().sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return a.name.localeCompare(b.name, undefined, {numeric: true}); });
}
export function chipKindOf(bytes, name) { for (const k of Object.keys(CHIPS)) if (bytes.length > 8 && CHIPS[k].magic(bytes, name)) return k; return null; }
export function chipVaultMeta(slug, kind) { // album.json's nsf: block for an import — one file per album, or a folder of one file per track
  const c = CHIPS[kind] || CHIPS.nsf;
  // the archive mirrors albums/: a console folder, then the album (Josh,
  // 2026-09-29: "why is the NSF repository not following the same directory
  // structure") — also what kept tetris.nsf and tetris.gbs from colliding
  const dir = (CONSOLE_OF[kind || "nsf"] || "other") + "/";
  const m = {vault: dir + (c.perFile ? slug + "/" : slug + c.ext), tracks: {}};
  if (kind && kind !== "nsf") m.chip = kind;
  if (c.perFile) m.perFile = true;
  return m;
}
export function nsfModules() { return chipModules("nsf"); }
export const impStatus = s => {
  const err = /⚠|failed|error|can't|cannot/i.test(s);
  if (err) logErr(s);
  document.getElementById("impstatus").textContent = s;
  const cp = document.getElementById("impstatuscopy"); // read-only status line, easy to lose on the iPad — Copy when it's an error
  if (cp) {
    cp.style.display = err ? "" : "none";
    cp.onclick = ev => { ev.stopPropagation(); askCopyText(s, cp); };
  }
};
export function renameImportDraft(oldKey, raw) { // returns the new key; null = name collision
  const base = slugify(raw);
  const dir = oldKey.slice(0, oldKey.lastIndexOf("/") + 1);
  const newKey = dir + base + ".mid";
  if (newKey !== oldKey && localStorage.getItem(draftStoreKey(newKey)) !== null) return null;
  if (newKey !== oldKey) {
    for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-"]) {
      const v = localStorage.getItem(pre + oldKey);
      if (v !== null) { localStorage.setItem(pre + newKey, v); localStorage.removeItem(pre + oldKey); }
    }
    idbDraftMove(oldKey, newKey); // the notes follow the stub
    if (S.songKey === oldKey) { // renamed the song being auditioned — follow it
      S.songKey = newKey;
      S.currentPath = newKey;
      rememberLastSong(newKey);
      reflectSongURL(newKey);
      updateSongBtn();
    }
  }
  try { // the typed name (punctuation intact) rides the draft into Commit
    const d = JSON.parse(localStorage.getItem(draftStoreKey(newKey)));
    d.title = raw.trim();
    localStorage.setItem(draftStoreKey(newKey), JSON.stringify(d));
  } catch (err) { /* draft absent — nothing to title */ }
  return newKey;
}
export function impRename(n) { // typed a name in a row: rename its captured draft in place
  const row = S.nsfSess && S.nsfSess.rows[n];
  if (!row) return;
  const raw = row.name.value.trim() || "track-" + String(n).padStart(2, "0");
  if (!row.key) return; // not captured yet — the name simply applies at capture time
  const newKey = renameImportDraft(row.key, raw);
  if (newKey === null) {
    impStatus("⚠ a captured track is already named \"" + slugify(raw) + "\" — pick another");
    row.name.value = row.key.split("/").pop().replace(/\.mid$/, "");
    return;
  }
  row.key = newKey;
  impStatus("renamed → " + newKey.split("/").pop());
}
export async function computeImportAlbumJson(slug, h, songTitles, nsfTracks, chipKind, dir, libs) { // libs: [{name, file}] in the archive folder
  // album.json keeps build_manifest.mjs honest offline; NSF link = vault
  // file + track map (pure metadata — ROM data lives in the private
  // archive). GET current, merge, return content for the batch commit.
  const path = (dir || impDirFor(chipKind) + slug) + "/album.json";
  let meta = {title: titleCaseSlug(slug), order: 50, songs: {}};
  if (folderActive()) {
    const r = await readData("songs", path, true);
    if (r.ok) { try { meta = await r.json(); } catch (err) { /* rewrite */ } }
  } else {
    const g = await fetch(repoApi("songs") + path + "?ref=main", {headers: h, cache: "no-store"});
    if (g.ok) { // second batch into the same album: merge, don't clobber earlier titles
      try { meta = JSON.parse(decodeURIComponent(escape(atob((await g.json()).content.replace(/\n/g, ""))))); } catch (err) { /* rewrite */ }
    }
  }
  meta.songs = {...(meta.songs || {}), ...(songTitles || {})};
  if (nsfTracks && Object.keys(nsfTracks).length) {
    meta.nsf = meta.nsf || chipVaultMeta(slug, chipKind);
    meta.nsf.tracks = {...meta.nsf.tracks, ...nsfTracks};
    if (libs && libs.length) meta.nsf.libs = libs;
  }
  return {path, text: JSON.stringify(meta, null, 1) + "\n"};
}
