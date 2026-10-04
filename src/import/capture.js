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
import { stop } from "../audio/transport.js";
import { openDraft } from "../session/song.js";
import { songRegionRight } from "../ui/chrome.js";
import { publishLabel } from "../ui/sheets.js";
import { publishDest } from "../ui/sheets.js";
import { parseMidi } from "../midi/parse.js";
import { draftWrite } from "../model/versions.js";
import { chip } from "../audio/chip.js";
import { updateChipBtnImpl as updateChipBtn } from "../ui/chrome.js";
import { idbNsfPut } from "../platform/storage.js";
import { jobsFind } from "../model/jobs.js";
import { jobProgress } from "../model/jobs.js";
import { jobStart } from "../ui/sheets.js";
import { folderWrite } from "../platform/folder.js";
import { repoName } from "../platform/storage.js";
import { apiError } from "../platform/storage.js";
import { draftRead } from "../model/versions.js";
import { writeMidi } from "../midi/write.js";
import { setOrigin } from "../model/provenance.js";
import { LINK_SONGS } from "../platform/base.js";
import { serializeNotesList } from "../model/rollnotes.js";
import { idbNsfGet } from "../platform/storage.js";
import { chipExt } from "../audio/chip.js";
import { albumMetaCache } from "../model/provenance.js";
import { manifestPlace } from "../sync/publish.js";
import { albumTitleFor } from "../model/provenance.js";
import { initCatalog } from "../model/catalog.js";
import { updateSyncBtnImpl as updateSyncBtn } from "../ui/chrome.js";
import { JOB_KINDS } from "../model/jobs.js";
import { jobsOnChange } from "../model/jobs.js";
import { publishJobStart } from "../sync/publish.js";
import { fileStatus } from "../ui/chrome.js";

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

export async function captureChipTrack(kind, M, nsf, track, seconds, onProgress) { // dump-all.mjs recipe, minus the FF1 reference data
  // async runner yields to the event loop — a 300s emulation as one sync
  // block froze the tab long enough for iOS Safari's watchdog to force a
  // reload, killing the whole import mid-run (Josh, 2026-08-16)
  // NO sync fallback: a long sync run freezes the tab until Safari's
  // watchdog force-reloads it — an honest error beats a dead page
  const run = CHIPS[kind || "nsf"].run(M);
  if (!run || !M.detectLoopAsync) throw new Error("pipeline update still deploying — close the import panel and retry in a minute");
  const res = await run(nsf, track, seconds, onProgress);
  const {apuLog, frames, frameSec} = res;
  let events = res.events || M.reconstruct(apuLog, frames, frameSec); // a chip whose runner already reconstructed (SPC) hands its events over
  if (!events.length) return null; // silent slot (SFX banks have them)
  const t0 = Math.min(...events.map(ev => ev.startFrame));
  events = events.map(ev => ({...ev, startFrame: ev.startFrame - t0, endFrame: ev.endFrame - t0}));
  if (onProgress && !CHIPS[kind || "nsf"].tagged) onProgress("scan"); // emulation done — the loop scan is its own beacon phase
  const loop = CHIPS[kind || "nsf"].tagged ? null : await M.detectLoopAsync(events, frames - t0, null); // yielding twin: the sync scan froze the tab post-100%; a tagged set's length is the tag's
  let keptFrames = frames - t0;
  if (loop) { // trim to intro + one pass, timing backported from later passes
    events = M.backportTiming(events, loop.period);
    keptFrames = loop.keep;
    events = events.filter(ev => ev.startFrame < loop.onsets - 3)
      .map(ev => ({...ev, endFrame: Math.min(ev.endFrame, keptFrames)}));
  } else if (!CHIPS[kind || "nsf"].tagged && M.trimSustainedTail) {
    // no loop found: the capture ran to its seconds ceiling, but the driver
    // may have stopped changing anything long before that — a jingle under a
    // bar, held out by a re-attacked tail note (Zelda NES tracks 5-7, Josh
    // 2026-09-29: 1 beat of music, then $4000-$4017 rewritten unchanged
    // every frame for 37 more beats). Cut the dead tail to a ~1s ring-out;
    // any register actually differing anywhere keeps the window live.
    const changedAt = M.lastRegisterChangeFrame(apuLog, frames) - t0;
    const trimmed = M.trimSustainedTail(events, keptFrames, changedAt, Math.round(1 / frameSec));
    events = trimmed.events;
    keptFrames = trimmed.frames;
  }
  const bpm = M.fitBpm(events, frameSec, 120);
  const statedLoop = !loop && res.loopFrame != null && res.loopFrame > t0 ? res.loopFrame - t0 : null; // a log format (VGM) states its loop point; no scan needed
  // snap-residual gate: a through-composed track with a mid-song tempo
  // change fits ONE grid — snapping the off-grid section audibly warps it
  // ("slows down at the end", MM2 title). If too many onsets sit far from
  // the fitted grid, keep raw chip timing (the offline dumper's NO_SNAP,
  // automated). Bar labels stay approximate; the music stays true.
  const grid = 60 / bpm / 4 / frameSec; // frames per 16th
  let far = 0, timed = 0;
  for (const ev of events) {
    if (ev.channel === "noise" || ev.drum != null) continue;
    timed++;
    const ph = ev.startFrame % grid;
    if (Math.min(ph, grid - ph) > 1.6) far++;
  }
  const snap = far / Math.max(1, timed) < 0.12;
  const bytes = M.makeMidi(events, {bpm, tsNum: 4, tsDen: 4, frameSec, snap, ...CHIPS[kind || "nsf"].midiOpts(M)});
  const beatSec = 60 / bpm;
  const backBeats = loop ? (loop.keep - loop.period) * frameSec / beatSec : statedLoop != null ? statedLoop * frameSec / beatSec : 0;
  const bq = beats => { // beats-from-zero -> [bar, beat] on the 16th grid (4/4 until re-barred)
    const qb = Math.round(beats * 4) / 4;
    return [Math.floor(qb / 4) + 1, qb - Math.floor(qb / 4) * 4 + 1];
  };
  const loops = !!loop || statedLoop != null;
  return {bytes, bpm, secs: keptFrames * frameSec, looped: loops, snapped: snap,
          loopAnchor: loops && backBeats > 0.4 ? bq(keptFrames * frameSec / beatSec) : null,
          loopTarget: loops && backBeats > 0.4 ? bq(backBeats) : null};
}
export async function openChipImport(kind, bytes, name, m3uList, files) {
  kind = kind || "nsf";
  const M = await chipModules(kind);
  const perFile = !!CHIPS[kind].perFile;
  let set = null, nsf;
  if (perFile) { // one file per track: parse them all, order the set, the first one names the album
    const parsedFiles = [], libs = {};
    for (const f of files || []) {
      if (CHIPS[kind].libFile && CHIPS[kind].libFile(f.name)) { libs[f.name.toLowerCase()] = f; continue; } // a set's shared library rides beside the songs, not as a row
      let parsed = null; try { parsed = CHIPS[kind].parseAsync ? await CHIPS[kind].parseAsync(M)(f.bytes, f.name) : CHIPS[kind].parse(M)(f.bytes); } catch (err) { parsed = null; }
      parsedFiles.push({name: f.name, bytes: f.bytes, parsed});
    }
    set = chipTrackOrder(parsedFiles.filter(f => f.parsed));
    var libFiles = libs;
    if (!set.length) { setInfo("⚠ none of those " + CHIPS[kind].label + " files could be read"); return; }
    const first = set[0].parsed;
    nsf = {name: first.game || name.replace(/\.[a-z0-9]+$/i, ""), artist: first.artist, songs: set.length};
  } else nsf = CHIPS[kind].parse(M)(bytes);
  S.nsfSess = {chip: kind, M, nsf, bytes: perFile ? null : bytes, set, libs: perFile ? libFiles : null, rows: []};
  document.getElementById("imptitle").textContent =
    ((nsf.name || name) + (nsf.artist && nsf.artist !== "<?>" ? " — " + nsf.artist : "")).toUpperCase();
  document.getElementById("impslug").value = slugify(nsf.name || name.replace(/\.(nsf|gbs|spc)$/i, ""));
  const list = document.getElementById("implist");
  list.innerHTML = "";
  // an m3u names the MUSIC tracks — an NSF like TMNT2 carries 120 slots of
  // which 95 are sound effects; with a playlist we list only the songs, in
  // album order, pre-named. Without one: every slot, as before. A per-file
  // set is its own list: one row per file, the tag's title, its tagged length.
  S.nsfSess.trackList = perFile
    ? set.map((f, i) => { const t = M.parseTrackName ? M.parseTrackName(f.name) : null; return {n: i + 1, title: f.parsed.name || (t && t.title) || f.name.replace(/\.[a-z0-9]+$/i, ""), len: f.parsed.tags && f.parsed.tags.seconds || 0}; })
    : m3uList && m3uList.length
    ? m3uList.filter(e => e.n >= 1 && e.n <= nsf.songs)
    : Array.from({length: nsf.songs}, (_, i) => ({n: i + 1, title: null}));
  for (const {n, title} of S.nsfSess.trackList) {
    const row = document.createElement("div");
    row.className = "row";
    const lbl = document.createElement("input"); // editable: type the real name once you recognize the tune
    lbl.type = "text";
    lbl.value = title || ("track-" + String(n).padStart(2, "0"));
    lbl.style.cssText = "flex:2 1 200px;min-width:160px;max-width:40%;min-height:32px;font-family:var(--mono);font-size:0.75rem"; // the name gets room but not the row: 150px cut tag titles, the first widening took too much (Josh, 2026-09-27, both)
    lbl.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); lbl.blur(); } });
    lbl.addEventListener("change", () => impRename(n));
    const st = document.createElement("span");
    st.className = "st";
    st.textContent = "—";
    st.addEventListener("click", () => { if (st.title) setInfo("ⓘ " + st.title.split("\n").join(" · ")); }); // touch has no tooltip: a tap shows the warnings in the footer
    const cap = document.createElement("button");
    cap.style.cssText = "min-height:32px;padding:4px 10px;flex:none";
    cap.textContent = "capture";
    cap.addEventListener("click", () => captureJobStart([n], impStatus)); // one row = a one-item job
    const open = document.createElement("button");
    open.style.cssText = "min-height:32px;padding:4px 10px;flex:none;display:none";
    open.textContent = "open";
    open.addEventListener("click", () => { // key pinned at capture time — slug edits later don't orphan it
      const k = S.nsfSess.rows[n] && S.nsfSess.rows[n].key;
      if (!k) return;
      stop();
      openDraft(k);
    });
    row.append(lbl, st, cap, open);
    list.appendChild(row);
    S.nsfSess.rows[n] = {name: lbl, st, open, cap, parsed: set ? set[n - 1].parsed : null, bytes: set ? set[n - 1].bytes : null};
  }
  document.getElementById("impall").textContent = "Capture all"; // fresh import, fresh verb
  if (m3uList && m3uList.length) setInfo(S.nsfSess.trackList.length + " songs listed from the playlist (of " + nsf.songs + " NSF slots) — names loaded.");
  const sheet = document.getElementById("importsheet");
  sheet.classList.add("on");
  requestAnimationFrame(() => {
    const w = sheet.offsetWidth;
    sheet.style.left = Math.max(6, (songRegionRight() - w) / 2) + "px";
    sheet.style.top = "56px";
  });
  // a timer-driven GBS runs PLAY at up to 4 kHz: same seconds, a longer emulation
  const libNames = set ? [...new Set(set.flatMap(f => f.parsed.libs || []))] : [];
  const missingLibs = libNames.filter(n => !(S.nsfSess.libs && S.nsfSess.libs[n.toLowerCase()]));
  const pace = kind === "gbs" ? (nsf.timerMode ? " · Game Boy, timer " + Math.round(nsf.playRateHz) + " Hz" : " · Game Boy") : kind === "spc" ? " · Super Nintendo (synth voices; no console audio yet)" : kind === "vgm" ? " · Genesis (synth voices; no console audio yet)" : kind === "psf" ? " · PlayStation (synth voices; no console audio yet)" + (missingLibs.length ? " — ⚠ pick the library file too: " + missingLibs.join(", ") : "") : kind === "psf2" ? " · PlayStation 2 (synth voices; no console audio yet)" + (missingLibs.length ? " — ⚠ pick the library file too: " + missingLibs.join(", ") : "") : kind === "usf" ? " · Nintendo 64 (synth voices; no console audio yet)" + (missingLibs.length ? " — ⚠ pick the library file too: " + missingLibs.join(", ") : "") : "";
  { const b = document.getElementById("impcommit"); b.textContent = publishLabel("kept tracks"); b.disabled = !publishDest(); }
  impStatus(nsf.songs + " tracks" + pace + " — Capture all, audition, then publish the keepers.");
}
export function openNsfImport(bytes, name, m3uList) { return openChipImport("nsf", bytes, name, m3uList); }
export async function impCapture(n, api, i) { // api/i: the capture job and this track's item, when run as one
  if (!S.nsfSess) return;
  const slug = slugify(document.getElementById("impslug").value) || "import";
  S.nsfSess.slug = slug; // the job's Open/↻ find this session by slug
  const item = patch => { if (api) api.update(i, patch); };
  let secs = Math.max(10, Math.min(300, +document.getElementById("impsecs").value || 75));
  // the playlist knows each track's length: size the capture to it (a 10s
  // jingle should not produce a 300s draft), and skip the 300s no-loop
  // retry for known-short jingles — they are through-composed by nature
  const meta = (S.nsfSess.trackList || []).find(e => e.n === n);
  const isJingle = meta && meta.len && meta.len <= 22;
  const tagged = !!CHIPS[S.nsfSess.chip || "nsf"].tagged;
  if (meta && meta.len) secs = tagged ? Math.max(12, Math.min(300, Math.ceil(meta.len + 1))) : Math.max(12, Math.min(300, Math.ceil(meta.len * 2.5 + 4)));
  const row = S.nsfSess.rows[n];
  row.st.textContent = "capturing…";
  row.open.style.display = "none";
  item({st: "running", pct: 0, msg: "capturing…"});
  await new Promise(r => setTimeout(r)); // let the label paint before the CPU burn
  // progress goes to the row (the panel may be hidden — it still exists) and
  // to the job (the ⏳ list, the mirror a reload reads); ✕ on the job aborts
  // at the next tick, inside the emulation
  const tick = (label) => p => {
    if (api && api.aborted) throw new Error("cancelled");
    if (p === "scan") { row.st.textContent = label + "detecting loop…"; item({msg: label + "detecting loop…"}); }
    else { row.st.textContent = label + "capturing… " + Math.round(p * 100) + "%"; item({pct: p, msg: label + "capturing…"}); }
  };
  const pct = tick("");
  try {
    const own = CHIPS[S.nsfSess.chip || "nsf"].capture; // a sequence reader (PSF) writes its MIDI itself
    let cap = own ? await own(S.nsfSess.M, row.parsed, secs, pct, S.nsfSess) : await captureChipTrack(S.nsfSess.chip, S.nsfSess.M, row.parsed || S.nsfSess.nsf, n, secs, pct);
    // the detector needs intro + TWO full passes in frame — a 35s loop with an
    // intro already busts 75s. No loop found? ONE retry straight at the 300s
    // ceiling (a doubling ladder just re-emulates the same song extra times)
    if (cap && !cap.looped && secs < 300 && !isJingle && !tagged && !own) {
      secs = 300;
      cap = await captureChipTrack(S.nsfSess.chip, S.nsfSess.M, row.parsed || S.nsfSess.nsf, n, secs, tick("no loop — 300s: "));
    }
    if (!cap) { row.st.textContent = "silent — nothing to keep"; item({st: "silent", msg: "silent"}); return; }
    let raw = row.name.value.trim() || "track-" + String(n).padStart(2, "0");
    let base = slugify(raw) || "track-" + String(n).padStart(2, "0");
    // two rows of THIS import with one title are two songs, not a mistake:
    // real rips name many different pieces alike (Ocarina of Time has 20
    // "Hyrule Field"s, Banjo-Kazooie 18 "Gruntilda's Lair"s). The old guard
    // failed the second one "name taken" and it was silently missing from
    // the album (49 songs across three games — docs/release-sweep-2026-09-29.md).
    // Number them instead: "Hyrule Field", "Hyrule Field (2)", …, by row
    // order, so a re-import names them the same way. A draft left by an
    // earlier import of the same album is still simply overwritten — that's
    // what re-importing means (Josh 2026-08-16).
    const dir = impDirFor(S.nsfSess.chip) + slug + "/";
    const taken = k => S.nsfSess.rows.some((r, j) => r && j !== n && r.key === k);
    if (taken(dir + base + ".mid")) {
      let i = 2;
      while (taken(dir + base + "-" + i + ".mid")) i++;
      base = base + "-" + i; raw = raw + " (" + i + ")";
    }
    const key = dir + base + ".mid";
    row.key = key;
    localStorage.removeItem("ff1roll-notes-" + key); // stale loop note dies with the old capture
    const parsed = parseMidi(cap.bytes.buffer, {trust: true}); // our own bytes: the corrupt-file guards (8-bar notes, 32-bar tacets) must not cut real music
    draftWrite(key, {
      savedStamp: 0, dirty: true, title: raw, capture: true, ppq: parsed.ppq, timesig: parsed.timesig || [4, 4], // capture: read-only wherever its folder sits
      tempos: parsed.tempos,
      tracks: parsed.tracks.map(tr => ({name: tr.name,
        ...(tr.offset ? {offset: tr.offset} : {}), // tools/sounding.mjs: the roll shows the sounding pitch — carried through so a tap keeps sounding right, and so commitImports' re-serialized .mid keeps it
        ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}), // CC10 — the capture's own channel pan (open-items.md "FORMATS AUDIT" #1: commitImports used to drop this)
        notes: tr.notes.map(nt => {
          const o = {t: nt.t, d: nt.d, p: nt.p, v: nt.v};
          if (nt.ch !== undefined) o.ch = nt.ch; // noise rides ch 9 — dropping it made drums play as pitched tones
          if (nt.duty !== undefined) o.duty = nt.duty; // chip timbre (per-note duty) survives
          if (nt.ve !== undefined) o.ve = nt.ve; // decay target survives
          return o;
        })}))});
    { // capture-time annotations: the hardware loop point (same rule as the FF1
      // dumps) and, for sequence chips with no sound of their own, a soft voice
      // for pad tracks — every note 8+ quarters long, a handful of them — so a
      // held chord hums on a sine instead of buzzing on a saw (Josh, FF7 "You
      // Can Hear the Cry of the Planet": three detuned D2 drones, 2026-09-27)
      const anns = [];
      if (cap.loopAnchor) anns.push({b1: cap.loopAnchor[0], q1: cap.loopAnchor[1], b2: null, q2: null, text: "loop: " + cap.loopTarget[0] + "." + cap.loopTarget[1]});
      if (!CHIPS[S.nsfSess.chip || "nsf"].render) parsed.tracks.forEach((tr, ti) => {
        if (tr.notes.length && tr.notes.length <= 6 && tr.notes.every(x => x.d >= parsed.ppq * 8) && !tr.notes.some(x => x.ch === 9))
          anns.push({b1: 1, q1: 1, b2: null, q2: null, text: "track: tr" + (ti + 1) + " voice=sine"});
      });
      if (anns.length) localStorage.setItem("ff1roll-notes-" + key, JSON.stringify(anns));
    }
    row.secs = cap.secs; // chip-audio render length for this track
    if (chip.key === key) { chip.key = null; updateChipBtn(); } // re-capture invalidates rendered audio
    // NSF bytes + track number persist on this device so chip audio outlives
    // the session (never the repo — *.nsf is gitignored ROM music)
    if (S.nsfSess.bytes) idbNsfPut(slug, S.nsfSess.bytes, {[base]: {n, secs: cap.secs}}, S.nsfSess.chip);
    else if (row.bytes && CHIPS[S.nsfSess.chip || "nsf"].keepBytes) idbNsfPut(slug, null, {[base]: {n: 1, secs: cap.secs, bytes: row.bytes}}, S.nsfSess.chip); // a per-file set with a renderer: the track's own file rides in its entry (64 KB an .spc)
    if (S.nsfSess.libs && Object.keys(S.nsfSess.libs).length && S.nsfSess.libsStored !== slug) { // the set's shared library, once: chip audio after a reload needs it too
      const libs = {}; for (const [k, f] of Object.entries(S.nsfSess.libs)) libs[k] = f.bytes;
      S.nsfSess.libsStored = slug;
      idbNsfPut(slug, null, {}, S.nsfSess.chip, libs);
    }
    row.st.textContent = "✓ saved · " + cap.secs.toFixed(1) + "s · " + cap.bpm + "bpm · " +
                         (cap.looped ? "loop" : tagged ? "tagged length" : "no loop ≤" + secs + "s") +
                         (cap.snapped ? "" : " · raw timing (tempo shifts)") +
                         (cap.warnings && cap.warnings.length ? " · " + cap.warnings.length + " warning" + (cap.warnings.length === 1 ? "" : "s") + " (tap to read)" : ""); // "1 note" read as one musical note (Josh, 2026-09-27)
    if (cap.warnings && cap.warnings.length) { row.st.title = cap.warnings.join("\n"); console.log("[import] " + raw + ":\n" + cap.warnings.join("\n")); }
    row.open.style.display = "";
    row.cap.textContent = "↻"; // captured: tapping again re-runs and overwrites this draft
    row.cap.setAttribute("aria-label", "Re-capture this track");
    item({st: "done", pct: 1, msg: "", key});
    return true;
  } catch (err) {
    const cancelled = /cancelled/.test(err.message);
    row.st.textContent = cancelled ? "cancelled" : "failed: " + err.message;
    item({st: cancelled ? "cancelled" : "failed", msg: cancelled ? "" : err.message});
  }
  return false;
}
export function captureJobStart(ns, statusFn) { // ns: track numbers to capture, in order
  if (!S.nsfSess) return null;
  const live = jobsFind("capture", null, true);
  if (live) { statusFn && statusFn("a capture is running: " + live.title + " " + jobProgress(live) + " — tap ⏳"); return null; }
  const slug = slugify(document.getElementById("impslug").value) || "import";
  S.nsfSess.slug = slug;
  const list = S.nsfSess.trackList || [];
  const items = ns.map(n => ({label: impTrackLabel(list.find(e => e.n === n)) || ("track " + n)}));
  return jobStart("capture", titleCaseSlug(slug), items, async api => {
    let saved = 0;
    for (let i = 0; i < ns.length; i++) {
      if (api.aborted) { for (let j = i; j < ns.length; j++) api.update(j, {st: "cancelled"}); api.cancel(); return; }
      statusFn && statusFn("capturing " + (i + 1) + "/" + ns.length + "… (close this panel any time — ⏳ in the footer keeps the progress)");
      if (await impCapture(ns[i], api, i)) saved++;
      if (api.aborted && api.job.items[i].st !== "done") { for (let j = i + 1; j < ns.length; j++) api.update(j, {st: "cancelled"}); api.cancel(); return; }
    }
    api.note(saved + " saved");
    statusFn && statusFn(saved + " track" + (saved === 1 ? "" : "s") + " saved as local drafts — folder \"" + titleCaseSlug(slug) + "\" in Open → LOCAL. Re-capturing overwrites them.");
  }, {slug, ns, chip: S.nsfSess.chip || "nsf"});
}
// One commit for many files: blobs -> tree -> commit -> ref (Git Data API).
// The per-file Contents API made a commit (and a Pages build) per song —
// Josh's 46-file import took minutes and errored 30 Pages builds.
export async function batchCommit(which, files, message, h, status) {
  if (folderActive()) { // the batch is just files: write each one
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status("writing " + (i + 1) + "/" + files.length + ": " + f.path.split("/").pop() + "…");
      if (f.b64 !== undefined) {
        const bin = atob(f.b64);
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        await folderWrite(f.path, bytes);
      } else await folderWrite(f.path, f.text);
    }
    return;
  }
  const api = "https://api.github.com/repos/" + repoName(which);
  const attempt = async () => {
    const refR = await fetch(api + "/git/ref/heads/main", {headers: h, cache: "no-store"});
    if (!refR.ok) throw apiError(which, refR, "ref");
    const baseSha = (await refR.json()).object.sha;
    const baseC = await (await fetch(api + "/git/commits/" + baseSha, {headers: h})).json();
    const tree = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status("packing " + (i + 1) + "/" + files.length + ": " + f.path.split("/").pop() + "…");
      const br = await fetch(api + "/git/blobs", {method: "POST", headers: h,
        body: JSON.stringify(f.b64 !== undefined ? {content: f.b64, encoding: "base64"}
                                                 : {content: f.text, encoding: "utf-8"})});
      if (!br.ok) throw apiError(which, br, "blob " + f.path);
      tree.push({path: f.path, mode: "100644", type: "blob", sha: (await br.json()).sha});
    }
    status("committing " + files.length + " files in one commit…");
    const tr = await fetch(api + "/git/trees", {method: "POST", headers: h,
      body: JSON.stringify({base_tree: baseC.tree.sha, tree})});
    if (!tr.ok) throw apiError(which, tr, "tree");
    const cr = await fetch(api + "/git/commits", {method: "POST", headers: h,
      body: JSON.stringify({message, tree: (await tr.json()).sha, parents: [baseSha]})});
    if (!cr.ok) throw apiError(which, cr, "commit");
    const newSha = (await cr.json()).sha;
    const ur = await fetch(api + "/git/refs/heads/main", {method: "PATCH", headers: h,
      body: JSON.stringify({sha: newSha, force: false})});
    return {ok: ur.ok, retry: !ur.ok && (ur.status === 409 || ur.status === 422), r: ur};
  };
  let a = await attempt();
  if (!a.ok && a.retry) a = await attempt(); // someone pushed mid-flight: rebuild on the new tip
  if (!a.ok) throw apiError(which, a.r, "ref update");
}
export async function commitImports(status, keys) { // ONE commit for the whole batch
  keys = keys || importDraftKeys();
  if (!keys.length) { status("No import drafts to commit."); return; }
  const token = writeToken();
  if (!token) { status("No GitHub token stored yet — add one in File → Settings."); return; }
  const h = ghHeaders(token);
  try {
    const titles = {}, songFiles = [], analysisFiles = [], bridges = [];
    for (const key of keys) {
      const d = await draftRead(key);
      if (!d) throw new Error("draft missing on this device: " + key);
      const base = key.split("/").pop().replace(/\.mid$/, "");
      titles[key] = impDisplayTitle(d, base);
      songFiles.push({path: key,
        b64: midiBase64(writeMidi({ppq: d.ppq, timesig: d.timesig, ...(d.source ? {source: d.source} : {}), tempos: d.tempos, tracks: d.tracks}))});
      // P4 (docs/annotations-v2.md): stash the origin regardless of whether
      // this commit writes a .rollnotes.json below (no local notes yet) —
      // publishSong's originFor falls back to this for the song's first
      // EVER annotations publish, whenever that happens.
      const importOrigin = {kind: "import", at: new Date().toISOString()};
      setOrigin(key, importOrigin);
      let local = [];
      try { local = LINK_SONGS ? [] : JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); } catch (err) { /* none */ }
      if (local.length) {
        const stamp = Date.now();
        const content = serializeNotesList(local, 4, base, stamp, importOrigin);
        analysisFiles.push({path: key.replace(/\.mid$/, "") + ".rollnotes.json", text: content});
        bridges.push({key, stamp, content});
      }
    }
    const slugs = [...new Set(keys.map(k => k.split("/")[2]))];
    for (const slug of slugs) {
      const overrides = {}; // only names the filename can't spell need album.json
      for (const k of keys) {
        const base = k.split("/").pop().replace(/\.mid$/, "");
        if (k.split("/")[2] === slug && titles[k] !== titleCaseSlug(base)) overrides[base] = titles[k];
      }
      const rec = await idbNsfGet(slug);
      const nsfTracks = {};
      if (rec && rec.tracks) for (const k of keys) {
        const base = k.split("/").pop().replace(/\.mid$/, "");
        const t = rec.tracks[base];
        if (k.split("/")[2] === slug && t !== undefined) nsfTracks[base] = typeof t === "object" && t && t.bytes ? {n: t.n, secs: t.secs} : t; // the file itself never enters album.json
      }
      const chipKind = (rec && rec.chip) || "nsf", vaultFile = slug + chipExt(chipKind);
      const perFile = !!(CHIPS[chipKind] && CHIPS[chipKind].perFile);
      const trackFiles = perFile && rec && rec.tracks ? Object.entries(rec.tracks).filter(([b, t]) => nsfTracks[b] && t && t.bytes) : [];
      const dir = keys.find(k => k.split("/")[2] === slug).replace(/\/[^/]+\.mid$/, "");
      const libFiles = rec && rec.libs ? Object.entries(rec.libs).map(([name, bytes]) => ({name, file: slugify(name.replace(/\.[a-z0-9]+$/i, "")) + (name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase(), bytes})) : [];
      songFiles.push(await computeImportAlbumJson(slug, h, overrides, nsfTracks, chipKind, dir, libFiles.map(l => ({name: l.name, file: l.file}))));
      if (((rec && rec.bytes) || trackFiles.length) && !folderActive() && !cfg().nsfRepo) status("No game files & instruments repo in Settings → GitHub — the game files stay on this device (the game's own sound here; synth voices elsewhere). Settings → GitHub → create mine sets one up.");
      if (trackFiles.length && !folderActive() && cfg().nsfRepo) { // a per-file set: one archive file per track, only the ones not there yet
        let up = 0, failed = 0;
        for (const [b, t] of trackFiles) {
          const file = slug + "/" + b + chipExt(chipKind);
          try {
            const chk = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
            if (chk.ok) continue;
            status("Uploading " + CHIPS[chipKind].label + " " + (++up) + "/" + trackFiles.length + " to the archive…");
            const put = await fetch(repoApi("nsf") + file, {method: "PUT", headers: h, body: JSON.stringify({
              message: CHIPS[chipKind].label + " for " + slug + "/" + b + " (chip audio)", branch: "main",
              content: midiBase64(t.bytes instanceof Uint8Array ? t.bytes : new Uint8Array(t.bytes))})});
            if (!put.ok) throw new Error("HTTP " + put.status);
          } catch (err) { failed++; }
        }
        if (failed) status("⚠ " + failed + " " + CHIPS[chipKind].label + " upload" + (failed === 1 ? "" : "s") + " failed — chip audio for those stays device-local");
      }
      if (libFiles.length && !folderActive() && cfg().nsfRepo) { // the set's shared library, once per album (check-before-PUT: a second publish skips it)
        for (const l of libFiles) {
          const file = slug + "/" + l.file;
          try {
            const chk = await fetch(nsfURL(file) + "?t=" + Date.now(), {cache: "no-cache"});
            if (chk.ok) continue;
            status("Uploading the set's library " + l.file + " to the archive (" + Math.round(l.bytes.length / 1024) + " KB)…");
            const put = await fetch(repoApi("nsf") + file, {method: "PUT", headers: h, body: JSON.stringify({
              message: CHIPS[chipKind].label + " library for " + slug + " (chip audio)", branch: "main",
              content: midiBase64(l.bytes instanceof Uint8Array ? l.bytes : new Uint8Array(l.bytes))})});
            if (!put.ok) throw new Error("HTTP " + put.status);
          } catch (err) { status("⚠ library upload failed (" + err.message + ") — chip audio for this album stays device-local"); }
        }
      }
      if (rec && rec.bytes && !folderActive() && cfg().nsfRepo) { // folder mode: the chip file stays in this device's IndexedDB
        try { // chip file -> archive if it isn't publicly there yet
          const chk = await fetch(nsfURL(vaultFile) + "?t=" + Date.now(), {cache: "no-cache"});
          if (!chk.ok) {
            status("Uploading " + CHIPS[chipKind].label + " to the archive…");
            const put = await fetch(repoApi("nsf") + vaultFile, {
              method: "PUT", headers: h, body: JSON.stringify({
                message: CHIPS[chipKind].label + " for " + slug + " (chip audio)", branch: "main",
                content: midiBase64(rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes))})});
            if (!put.ok) throw new Error("HTTP " + put.status);
          }
        } catch (err) { status("⚠ " + CHIPS[chipKind].label + " upload failed (" + err.message + ") — chip audio stays device-local"); }
      }
      for (const d of Object.keys(albumMetaCache)) if (d.endsWith("/" + slug)) delete albumMetaCache[d];
    }
    let manifestNow = null; // the manifest as this publish writes it: the dropdown applies it directly (Pages serves the old one for a minute)
    if (!folderActive()) { // manifest: GET repo truth, apply the same mutation updateManifest would
      // (the folder has no manifest — initCatalog rescans it)
      const mg = await fetch(repoApi("songs") + "albums/manifest.json?ref=main", {headers: h, cache: "no-store"});
      if (!mg.ok) throw apiError("songs", mg, "manifest GET");
      const albums = JSON.parse(decodeURIComponent(escape(atob((await mg.json()).content.replace(/\n/g, "")))));
      manifestNow = albums;
      for (const k of keys) {
        manifestPlace(albums, null, k);
        const album = albums.find(a => a.title === albumTitleFor(k));
        const entry = album && album.songs.find(x => x.path === k);
        if (entry && titles[k]) entry.title = titles[k];
      }
      for (const a of albums) a.songs.sort((x, y) => x.title.localeCompare(y.title));
      songFiles.push({path: "albums/manifest.json", text: JSON.stringify(albums, null, 1) + "\n"});
    }
    const msg = "Import " + slugs.join(", ") + ": " + keys.length + " song" +
                (keys.length === 1 ? "" : "s") + " from Night Roll";
    if (repoName("songs") === repoName("analysis")) {
      await batchCommit("songs", songFiles.concat(analysisFiles), msg, h, status);
    } else { // split repos: one commit each
      await batchCommit("songs", songFiles, msg, h, status);
      if (analysisFiles.length) await batchCommit("analysis", analysisFiles, msg + " (annotations)", h, status);
    }
    for (const b of bridges)
      localStorage.setItem("ff1roll-lastsync-" + b.key, JSON.stringify({t: b.stamp, text: b.content}));
    for (const key of keys) { // repo owns them now; drafts + note stashes retire
      localStorage.removeItem(draftStoreKey(key));
      localStorage.removeItem("ff1roll-notes-" + key);
      if (key === S.songKey && S.song) S.song.savedStamp = Date.now();
    }
    // the site serves the OLD manifest for about a minute after the commit, so
    // initCatalog alone brought back a list without the album just published
    // (Josh, 2026-09-27: "I published Final Fantasy V … I don't see it in Open";
    // FF4 'worked' only because he looked later). Apply what we wrote, on top.
    const applyNow = () => { if (manifestNow) for (const a of manifestNow) S.CATALOG[a.title] = a.songs.map(x => [x.title, x.path]); };
    applyNow();
    await initCatalog().catch(() => { /* Pages lag; dropdown refreshes next boot */ });
    applyNow();
    updateSongBtn();
    updateSyncBtn();
    status("Published " + keys.length + " track" + (keys.length === 1 ? "" : "s") +
           " in one commit ✓ (Pages takes ~1 min to serve them).");
  } catch (err) { status("Publish failed: " + err.message); }
}

export function initCapture1() {
  JOB_KINDS.capture = {
    label: j => "Capture · " + j.title,
    open: j => { // the panel, if this session is still the one; else say what a retry needs
      if (S.nsfSess && S.nsfSess.slug === j.slug) { document.getElementById("importsheet").classList.add("on"); return; }
      setInfo(j.title + ": " + jobProgress(j) + " — the files are no longer open; Import them again to continue (captured tracks are kept)");
    },
    retry: j => { // what is not done, in the same session; a re-import of the same set attaches by slug
      if (!(S.nsfSess && S.nsfSess.slug === j.slug)) { setInfo(j.title + ": Import the same files again, then Capture all — tracks already captured are skipped"); return; }
      const left = (j.ns || []).filter((n, i) => !(j.items[i] && j.items[i].st === "done"));
      if (!left.length) { setInfo(j.title + ": nothing left to capture"); return; }
      document.getElementById("importsheet").classList.add("on");
      captureJobStart(left, impStatus);
    },
  };
  document.getElementById("impall").addEventListener("click", e => {
    if (!S.nsfSess) return;
    const btn = e.currentTarget; // currentTarget nulls once the dispatch ends — grab it pre-await
    const list = S.nsfSess.trackList || [];
    // re-capture skips what this session already saved (Josh's rule: a re-run overwrites only what it captures)
    const ns = list.map(x => x.n);
    const job = captureJobStart(ns, impStatus);
    if (!job) return;
    btn.disabled = true;
    const off = jobsOnChange(() => {
      if (job.state === "running") { btn.textContent = "⏳ " + jobProgress(job).split(" · ")[0]; return; }
      btn.disabled = false; btn.textContent = "↻ Re-capture all"; off();
    });
  });
  document.getElementById("impclose").addEventListener("click", () =>
    document.getElementById("importsheet").classList.remove("on")); // captures live on as drafts
  document.getElementById("impcommit").addEventListener("click", e => {
    const btn = e.currentTarget;
    const slug = S.nsfSess && S.nsfSess.slug;
    const job = publishJobStart(slug || null, slug ? importDraftKeys().filter(k => k.split("/")[2] === slug) : importDraftKeys(), impStatus);
    if (!job) return;
    btn.disabled = true;
    const off = jobsOnChange(() => { if (job.state === "running") return; off(); btn.disabled = false; });
  });
   document.getElementById("fileimpcommit").addEventListener("click", e => {
    const btn = e.currentTarget;
    const job = publishJobStart(null, importDraftKeys(), fileStatus);
    if (!job) return;
    btn.disabled = true;
    const off = jobsOnChange(() => {
      if (job.state === "running") return;
      off();
      btn.disabled = false;
      const n = importDraftKeys().length;
      btn.style.display = n ? "" : "none";
      btn.textContent = publishLabel("import (" + n + ")");
    });
  });
}
