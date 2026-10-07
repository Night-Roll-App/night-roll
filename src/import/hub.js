import { FOLDER_NAMES } from "../model/catalog.js";
import { S } from "../state.js";
import { renameImportDraft } from "./capture.js";
import { impRowId } from "./capture.js";
import { chipVaultFileSlug } from "../audio/chip.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { albumMetaFor } from "../model/provenance.js";
import { isCaptureKey } from "../model/provenance.js";
import { idbNsfGet } from "../platform/storage.js";
import { draftStoreKey } from "../platform/storage.js";
import { catalogHas } from "../model/catalog.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { writeToken } from "../sync/publish.js";
import { renameRepoTitles } from "../sync/publish.js";
import { ghHeaders } from "../audio/chip.js";
import { songsheet } from "../ui/chrome.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { saveCfg } from "../platform/storage.js";
import { cfg } from "../platform/storage.js";
import { chipKindOf } from "./capture.js";
import { sf2Magic } from "./capture.js";
import { audioMagic } from "./capture.js";
import { streamedAudioMagic } from "./capture.js";
import { createComposition } from "../session/files.js";
import { CHIPS } from "../audio/chip.js";
import { openChipImport } from "./capture.js";
import { importSf2File } from "./capture.js";
import { parseMidi } from "../midi/parse.js";
import { nativeFs } from "../platform/folder.js";
import { stop } from "../audio/transport.js";
import { closeFileMenus } from "../ui/chrome.js";
import { isComposition } from "../model/provenance.js";
import { isLocalDraft } from "../model/edits.js";
import { barTicks } from "../model/rollnotes.js";
import { AUDIO_SIZE_GATE } from "./capture.js";
import { monoWavBytes } from "./capture.js";
import { decodeAudioBytes } from "../audio/clips.js";
import { slugFile } from "./capture.js";
import { forEachClip } from "../audio/clips.js";
import { idbAudioPut } from "../platform/storage.js";
import { writeClips } from "../audio/clips.js";
import { annoSnapshot } from "../model/edits.js";
import { addTrackUndoable } from "../model/edits.js";
import { pushUndo } from "../model/edits.js";
import { audioDirText } from "../model/rollnotes.js";
import { setAnchorBQImpl as setAnchorBQ } from "../ui/note-editor.js";
import { resolveNote } from "../model/rollnotes.js";
import { deriveNoteTypes } from "../model/rollnotes.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { saveLocalNotes } from "../model/edits.js";
import { saveDraft } from "../model/versions.js";
import { renderTrackbarImpl as renderTrackbar } from "../ui/trackbar.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { updateTrackGains } from "../audio/engine.js";
import { computeSongEnd } from "../model/song.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { slugify } from "../model/provenance.js";
import { draftWrite } from "../model/versions.js";
import { openDraft } from "../session/song.js";
import { iconSvg } from "../ui/icons.js";
import { filesub } from "../ui/chrome.js";
import { folderTree } from "../model/catalog.js";
import { draftKeys } from "../model/versions.js";
import { subfolderKeys } from "../model/catalog.js";
import { localLabel } from "../ui/chrome.js";
import { segTitle } from "../model/catalog.js";
import { nodeCount } from "../model/catalog.js";
import { publishedLabel } from "../model/catalog.js";
import { publishedPaths } from "../model/catalog.js";
import { nodeAt } from "../model/catalog.js";
import { parentFolder } from "../model/catalog.js";
import { folderTitle } from "../model/catalog.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { draftRow } from "../ui/chrome.js";
import { songStatus } from "../ui/chrome.js";
import { groupOf } from "../model/catalog.js";
import { albumHasTrackData } from "../model/album-order.js";
import { albumOrderControl } from "../model/album-order.js";
import { albumEffectiveOrder } from "../model/album-order.js";
import { albumStart } from "../session/album.js";
import { albumClear } from "../session/album.js";
import { rememberLastSong } from "../platform/base.js";
import { reflectSongURL } from "../session/song.js";
import { loadSong } from "../session/song.js";
import { folderOf } from "../model/catalog.js";
import { importDraftKeys } from "./capture.js";
import { publishLabel } from "../ui/sheets.js";
import { publishDest } from "../ui/sheets.js";
import { jobsFind } from "../model/jobs.js";
import { titleCaseSlug } from "../model/catalog.js";
import { publishJobStart } from "../sync/publish.js";
import { openPubJobSheet } from "../ui/sheets.js";
import { jobsOnChange } from "../model/jobs.js";
import { idbDraftDelete } from "../platform/storage.js";
import { fileStatus } from "../ui/chrome.js";
import { folderFromInput } from "../model/provenance.js";
import { ctlCopy } from "../midi/parse.js";

// ---- Import hub (docs/import-hub-design.md): File → Import… opens one screen,
// one section per format, instead of the old <label for="fileinput"> that just
// listed every extension in a row. Every section's Choose files… calls the SAME
// #fileinput.click() — a data-kind on the button only changes the status line's
// wording before the native picker opens; a file picked from the "wrong" section
// still falls through to openPickedFiles' own byte-sniff and routes correctly.
// a function, not a const object literal: FOLDER_NAMES is declared later in
// this same script (below the folders/save-form code) — evaluating its
// lookups here at top-level, at parse time, would hit the TDZ; a function
// body only reads FOLDER_NAMES once actually called, well after boot
export function importHubLabel(kind) {
  return {midi: "MIDI", nes: FOLDER_NAMES.nes, gb: FOLDER_NAMES["game-boy"],
    snes: FOLDER_NAMES.snes, genesis: FOLDER_NAMES.genesis, ps1: FOLDER_NAMES.ps1, ps2: FOLDER_NAMES.ps2,
    n64: FOLDER_NAMES.n64, sf2: "SoundFont", audio: "recording"}[kind];
}

// .m3u track-name playlists (the emu-scene convention: NSF rips ship with
// one). Zero-typing names (Josh, 2026-08-17 — hands hurt; data entry that a
// file already did is theft): pick the m3u with the NSF, or alone while an
// import session is open, and every row gets its real title.
// Zophar's playlists are latin-1, not UTF-8: the © in "©1989-12-15 Square" is
// one byte (0xA9). A plain UTF-8 decode turns it into U+FFFD, which defeated
// the copyright test below and made every FFL row read the same (Josh,
// 2026-09-27). Strict UTF-8 first — real UTF-8 rips keep working — else 1252.
export function decodeM3u(bytes) {
  try { return new TextDecoder("utf-8", {fatal: true}).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}
export function parseM3u(text) { // ordered [{file, n, title, len}] — playlist order IS album order
  const list = [];
  for (const line of text.split(/\r?\n/)) {
    // NSF and GBS rips share the line shape; the length is M:SS (Game Boy rips)
    // or H:MM:SS(.fff) (every Zophar NES rip). Read as M:SS, "0:01:16" was 1 s:
    // every track a "jingle", captured 12 s, never retried (2026-09-27, the
    // Castlevania batch — Stalker came back 12 s of a 64 s song).
    // The part before "::" is the chip file the line belongs to. A rip can
    // hold more than one (Zophar's GB Tetris: DMG-TRA-0.gbs v1.0 and
    // DMG-TRA-1.gbs v1.1, with ONE line naming the second) — dropping it
    // applied that line to the first file's slot 2, over the v1.0 title
    // (docs/investigations/2026-10-04-gb-tetris-korobeiniki.md).
    const m = line.match(/^(.*?)::(?:NSF|GBS),(\d+),(.+?),(?:(\d+):)?(\d+):(\d\d(?:\.\d+)?)/);
    if (!m) continue;
    const raw = m[3].replace(/\\,/g, ",");
    // split only OUTSIDE brackets: "Bloody Tears (Street - Day time BGM)" is
    // one title, not "Bloody Tears (Street" + "Day time BGM)" (Castlevania II,
    // 2026-09-29 — the song came out as "Day time BGM)")
    const parts = []; let depth = 0, cur = "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      if (depth === 0 && raw.startsWith(" - ", i)) { parts.push(cur); cur = ""; i += 2; continue; }
      cur += ch;
    }
    parts.push(cur);
    // two scenes, two layouts (the real FFL1 rip, 2026-09-27): NSF lines are
    // "Game - Artist - Title" with 1-based tracks; GBS lines are "Title -
    // Artist - Game - ©1989-12-15 Square" with 0-BASED tracks (gbsplay's
    // numbering, 0-16 for 17 subsongs) — title first, and +1 to the app's
    // rows. Keyed on the ::GBS marker, so a single picked per-track file
    // (no track 0 in sight) still lands on the right subsong.
    const gb = m[0].includes("::GBS,");
    const title = (gb && parts.length >= 2 ? parts[0] : parts.length >= 3 ? parts.slice(2).join(" - ") : parts[parts.length - 1]).trim();
    if (title) list.push({file: m[1].trim() || null, n: +m[2] + (gb ? 1 : 0), title, len: (+m[4] || 0) * 3600 + +m[5] * 60 + +m[6]});
  }
  return list;
}
// A playlist line's file, as a slug ("DMG-TRA-1.gbs" → "dmg-tra-1"): the
// half of chipExtraVault's name that identifies a set's non-first file, so a
// line can be matched to the album track whose nsf.tracks[base].vault ends
// in ".dmg-tra-1.gbs". Null when the line names no file.
export function m3uFileSlug(file) { return file ? slugify(file.replace(/\.[a-z0-9]+$/i, "")) : null; }
// album.json's (or the device record's) nsf.tracks → the two lookups a
// playlist line resolves through: a line naming a non-first file matches a
// track with that file's slug in its own vault; every other line matches a
// track with no vault of its own. Lets the same n live once per chip file.
export function m3uTrackKeys(tracks) {
  const byN = {}, byFile = {};
  for (const [base, t] of Object.entries(tracks)) {
    const n = typeof t === "number" ? t : t && t.n;
    if (n == null) continue;
    const fs = chipVaultFileSlug(t && t.vault);
    if (fs) { if (byFile[fs + "::" + n] === undefined) byFile[fs + "::" + n] = base; }
    else if (byN[n] === undefined) byN[n] = base;
  }
  return {byN, byFile};
}
export function m3uTrackFor(keys, line) { const fs = m3uFileSlug(line.file); return (fs && keys.byFile[fs + "::" + line.n]) || keys.byN[line.n] || null; }
export function applyM3uNames(list) {
  if (!S.nsfSess) return 0;
  let applied = 0;
  for (const e of list) {
    const {title} = e;
    const row = S.nsfSess.rows[impRowId(e, list)];
    if (!row) continue;
    row.name.value = title;
    if (row.key) { // captured already: rename the draft in place
      const nk = renameImportDraft(row.key, title);
      if (nk !== null) row.key = nk;
    }
    applied++;
  }
  return applied;
}
// A playlist picked AFTER the import (Josh, 2026-09-28: Zelda and Super Mario
// Bros. 3 arrived as track-01…): the open song's album is the target; each
// playlist line names the song whose chip slot number matches — local drafts
// are renamed in place (file and title, as the import session does), a
// published album gets its titles in one album.json write.
export async function applyM3uToAlbum(list) {
  if (!S.songKey || !S.songKey.startsWith("albums/")) { setInfo("⚠ that is a track-name playlist — open a song from the album it names first"); return 0; }
  const dir = S.songKey.replace(/\/(?:songs\/)?[^/]+\.mid$/, "");
  const meta = await albumMetaFor(S.songKey);
  let tracks = meta && meta.nsf && meta.nsf.tracks;
  if (!tracks && isCaptureKey(S.songKey)) { const rec = await idbNsfGet(dir.split("/").pop()); tracks = rec && rec.tracks; } // unpublished: the device record
  if (!tracks) { setInfo("⚠ this album has no chip slot numbers to match the playlist against"); return 0; }
  const keys = m3uTrackKeys(tracks);
  const local = {}, published = {};
  for (const e of list) {
    const base = m3uTrackFor(keys, e), title = e.title;
    if (!base || !title) continue;
    const key = dir + "/" + base + ".mid";
    const draft = localStorage.getItem(draftStoreKey(key));
    if (draft !== null && !(JSON.parse(draft) || {}).savedStamp) local[key] = title; else if (catalogHas(key)) published[key] = title;
  }
  const count = Object.keys(local).length + Object.keys(published).length;
  if (!count) { setInfo("⚠ no playlist line matched a song of this album (slot numbers differ?)"); return 0; }
  const ok = await appConfirm("NAME " + count + " SONG" + (count === 1 ? "" : "S") + "?",
    "From the playlist, by chip slot number: " + Object.keys(local).length + " local, " + Object.keys(published).length + " published" +
    (Object.keys(published).length ? " (one album.json write on GitHub)" : "") + ".", "Name them", "Cancel");
  if (!ok) return 0;
  let done = 0;
  for (const [key, title] of Object.entries(local)) { if (renameImportDraft(key, title) !== null) done++; }
  if (Object.keys(published).length) {
    const token = writeToken();
    if (!token) { setInfo("✓ " + done + " local song(s) named; the published ones need a GitHub token (File → Settings)"); return done; }
    setInfo("naming " + Object.keys(published).length + " published song(s)…");
    await renameRepoTitles(published, ghHeaders(token));
    for (const [key, title] of Object.entries(published)) { for (const songs of Object.values(S.CATALOG)) { const e = songs.find(x => x[1] === key); if (e) e[0] = title; } done++; } // the manifest write is done; the CDN copy lags
  }
  if (songsheet.classList.contains("on") && S.songViewRedraw) S.songViewRedraw();
  updateSongBtn();
  setInfo("✓ " + done + " song" + (done === 1 ? "" : "s") + " named from the playlist");
  return done;
}
// "create mine": a public <login>/night-roll-archive for this user's game files
// and instruments. A user on their own songs repo started with none, so their
// published imports played only on the importing device (Josh, 2026-09-28).
// Reuses an existing repo of that name; creating needs a token allowed to
// create repositories, and the status line says so when GitHub refuses.
export async function createGameFilesRepo(say) {
  const token = writeToken();
  if (!token) { say("Add your token (step 2) first."); return null; }
  const h = ghHeaders(token);
  const me = await fetch("https://api.github.com/user", {headers: h});
  if (!me.ok) { say("GitHub didn't accept the token (HTTP " + me.status + ")."); return null; }
  const login = (await me.json()).login, name = "night-roll-archive", full = login + "/" + name;
  const have = await fetch("https://api.github.com/repos/" + full, {headers: h});
  if (!have.ok) {
    const r = await fetch("https://api.github.com/user/repos", {method: "POST", headers: h,
      body: JSON.stringify({name, description: "Game files and instruments for Night Roll", private: false, auto_init: true})});
    if (!r.ok) { say("GitHub wouldn't create " + full + " (HTTP " + r.status + "). The token needs permission to create repositories — or create it on github.com and type its name here."); return null; }
  }
  saveCfg({nsfRepo: full, nsfBase: "https://raw.githubusercontent.com/" + full + "/main"}); cfg.c = null;
  say("✓ " + full + (have.ok ? " (already there) " : " created ") + "— your game files and instruments go there from now on. If your token only lists some repos, add this one to it.");
  return full;
}
export async function openPickedFiles(loaded) { // [{name, bytes}] from the picker, a drop, or a file handed to the iPad app
  {
    const isM3u = x => /\.m3u8?$/i.test(x.name);
    const m3us = loaded.filter(isM3u);
    const rest = loaded.filter(x => !isM3u(x));
    // Game Boy rips (Zophar) ship ONE .m3u per track — "02 Main Theme.m3u" —
    // so every picked playlist merges, in file-name order (Josh, from the
    // Final Fantasy Legend zip, 2026-09-27)
    const names = m3us.length
      ? [].concat(...m3us.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true})).map(x => parseM3u(decodeM3u(x.bytes))))
      : null;
    const nsfs = rest.filter(x => chipKindOf(x.bytes, x.name));
    const sf2s = rest.filter(x => sf2Magic(x.bytes));
    const audios = rest.filter(x => audioMagic(x.bytes));
    // PS2 rips that are only streamed audio, not sequence data (Zophar's Ico
    // is GENH-tagged, XIII is Ubisoft's own SShd/SSbd — docs/plans/ps2.md
    // "Findings, milestone 1"): refused by name at import, not a MIDI parse
    // error. Format identification only (no game table — CLAUDE.md).
    const streamed = nsfs.length ? [] : rest.filter(x => streamedAudioMagic(x.bytes));
    if (audios.length && audios.length === rest.length && !m3us.length) { // recordings → a new song (Import hub's "New song from a recording", no song open) or a track on the open one (the ＋∿ chip's own #audioinput never reaches here)
      const freshSong = !S.song;
      if (freshSong) createComposition(120, 4, 4);
      S.audioReplaceTi = null;
      await importAudioFiles(audios.map(x => ({name: x.name, bytes: x.bytes, type: ""})));
      if (freshSong) setInfo("new song — Edit → Pencil to write notes against the recording. It lives on this device until Save.");
    } else if (nsfs.length) { // a chip-music file (NSF or GBS) is an album by itself
      // every chip file of the first one's kind, in name order (numeric, so
      // DMG-TRA-0 precedes DMG-TRA-1 and "2" precedes "10"): a per-file set's
      // tracks, or — for a one-file-per-album kind — a rip that ships more
      // than one file (two ROM revisions). The first by name is the album's
      // vault; the importer used to take nsfs[0] alone and silently drop the rest.
      const kind = chipKindOf(nsfs[0].bytes, nsfs[0].name);
      const same = nsfs.filter(x => chipKindOf(x.bytes, x.name) === kind).sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
      if (rest.length > same.length) setInfo("importing the " + CHIPS[kind].label + " file" + (same.length === 1 ? "" : "s") + "; pick other formats separately");
      await openChipImport(kind, same[0].bytes, same[0].name, names, same);
    } else if (sf2s.length) { // a SoundFont: parse, keep a device copy, push to the archive — its presets become track voices, no song open needed
      if (sf2s.length < rest.length) setInfo("importing the SoundFont" + (sf2s.length === 1 ? "" : "s") + "; pick other formats separately");
      for (const f of sf2s) await importSf2File(f);
    } else if (m3us.length && !rest.length) { // playlist alone: name the open session's tracks/drafts — or, with no session, the open song's album
      if (!S.nsfSess) await applyM3uToAlbum(names);
      else setInfo("✓ " + applyM3uNames(names) + " tracks named from the playlist" +
                   " — captured drafts renamed in place.");
    } else if (streamed.length && streamed.length === rest.length) {
      setInfo("this is streamed audio, not note data — Night Roll reads sequence data (notes), not pre-rendered streams");
    } else {
      S.pendingMidis = loaded.map(x => ({name: x.name, parsed: parseMidi(x.bytes.buffer, {trust: true, foreign: true})})); // sniffed: MThd found anywhere; foreign: carries its own source (declared-vs-learner-spec.md C2)
      document.getElementById("miditle").textContent =
        "IMPORT " + loaded.length + " MIDI FILE" + (loaded.length === 1 ? "" : "S");
      document.getElementById("midlocal").style.display = loaded.length === 1 ? "" : "none";
      const guess = loaded[0].name.replace(/\.(midi?|smf|kar|rmi)$/i, "").replace(/[-_ ]*\d+$/, "");
      document.getElementById("midalbum").value = loaded.length === 1 ? "" : guess;
      document.getElementById("midisheet").classList.add("on");
    }
  }
}
// The iPad app is registered for .mid and chip files: one tapped in Files,
// or handed over from another app's share sheet, arrives as a file: URL
// (iOS copies it into Documents/Inbox — documents are not opened in place).
// Read it through the Filesystem plugin, open it like a picked file, drop
// the Inbox copy. A lone MIDI skips the import sheet and becomes a local
// draft straight away: one tap from Files to the roll (hands hurt).
export async function nativeOpenUrl(url) {
  const fs = nativeFs();
  if (!fs || !url || !/^file:/i.test(url)) return false;
  const name = decodeURIComponent(url.split("/").pop() || "file");
  let bytes;
  try {
    const r = await fs.readFile({path: url});
    bytes = typeof r.data === "string" ? Uint8Array.from(atob(r.data), c => c.charCodeAt(0)) : new Uint8Array(await r.data.arrayBuffer());
  } catch (err) { setInfo("couldn't read " + name + ": " + err.message); return false; }
  stop();
  closeFileMenus();
  try {
    if (!chipKindOf(bytes, name) && !audioMagic(bytes) && !streamedAudioMagic(bytes) && !/\.m3u8?$/i.test(name)) localMidiOpen(parseMidi(bytes.buffer, {trust: true, foreign: true}), name);
    else await openPickedFiles([{name, bytes}]);
  } catch (err) { setInfo("could not import " + name + ": " + err.message); return false; }
  if (/\/Inbox\//.test(url)) fs.deleteFile({path: url}).catch(() => {});
  return true;
}
export function nativeOpenHook() { // boot, after the first song: the cold-start hand-over, then every later one
  try {
    const c = typeof window !== "undefined" && window.Capacitor;
    const app = c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.App;
    if (!app) return;
    app.addListener("appUrlOpen", e => { nativeOpenUrl(e && e.url); });
    if (app.getLaunchUrl) app.getLaunchUrl().then(r => { if (r && r.url) nativeOpenUrl(r.url); }).catch(() => {});
  } catch (err) { /* the web: no shell */ }
}
export async function importAudioFiles(items) { // items: {name, bytes: Uint8Array, type}
  if (!S.song) return;
  if (!(isComposition() || isLocalDraft())) {
    setInfo("this song is locked — File → Save As… makes an editable copy, then add the recording there");
    return;
  }
  const cursorBar = Math.floor(S.playCursor / barTicks()) * barTicks();
  let lastTi = -1;
  for (const it of items) {
    let bytes = it.bytes;
    if (!audioMagic(bytes)) { setInfo(it.name + " isn't an audio file this browser knows"); continue; }
    if (bytes.length > AUDIO_SIZE_GATE) {
      const mb = (bytes.length / 1e6).toFixed(0);
      const mono = await appConfirm("BIG RECORDING — " + mb + " MB",
        "A 3-minute stereo WAV is ~30 MB; the same take as 16-bit mono WAV is half that, and lossless for a guitar or a voice. It stays this size on every device and in every Save.",
        "Store as 16-bit mono WAV", "Import as-is (" + mb + " MB)");
      if (mono) {
        setInfo("converting " + it.name + " to mono…");
        try { bytes = monoWavBytes((await decodeAudioBytes(bytes.buffer)).buffer); }
        catch (err) { setInfo("couldn't decode " + it.name + " — importing as-is"); }
        it.name = it.name.replace(/\.[^.]+$/, "") + ".wav";
      }
    }
    // unique slug and track name within the song
    let file = slugFile(it.name), k = 2;
    const taken = f => { let t = false; forEachClip(c => { if (c.file === f) t = true; }); return t; };
    while (taken(file)) { file = slugFile(it.name).replace(/(\.[^.]+)?$/, "-" + k++ + "$1"); }
    const stem = file.replace(/\.[^.]+$/, "");
    let name = stem, j = 2;
    while (S.song.tracks.some(t => (t.name || "").toLowerCase() === name.toLowerCase())) name = stem + "-" + j++;
    const stored = await idbAudioPut(S.songKey + "|" + file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), it.type || "");
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (S.audioReplaceTi !== null && S.song.tracks[S.audioReplaceTi] && S.song.tracks[S.audioReplaceTi].kind === "audio") {
      const ti = S.audioReplaceTi; S.audioReplaceTi = null;
      // every piece of the old file swaps to the new one, placement kept
      const old = (S.song.tracks[ti].clips[0] || {}).file;
      writeClips(ti, S.song.tracks[ti].clips.map(c => c.file === old ? {...c, file, offset: 0, len: null} : c));
      lastTi = ti;
      setInfo("replaced the recording on " + (S.song.tracks[ti].name || "the track") + " — one undo brings the old one back");
      continue;
    }
    const before = annoSnapshot();
    S.autoAlignFiles.add(file);
    const ti = addTrackUndoable({name, notes: []});
    pushUndo({kind: "group", entries: [{kind: "trackRemove", ti}, {kind: "anno", json: before}]});
    const n = {b1: 1, q1: 1, b2: null, q2: null, text: audioDirText({track: name, file, offset: 0, local: false}), added: true};
    setAnchorBQ(n, cursorBar);
    S.rollnotes.push(resolveNote(deriveNoteTypes([n])[0]));
    finalizeNotes();
    saveLocalNotes();
    saveDraft();
    lastTi = ti;
    S.selTrack = ti; S.selClip = ti; S.trackExpand = true;
    setInfo("added " + name + " ∿ at bar " + (cursorBar / barTicks() + 1) +
            (stored ? "" : " — ⚠ this browser wouldn't store the bytes; the take lives for this session only") +
            (S.viewMode === "tracks" ? "" : " — the Tracks view shows the waveform") +
            " · tap its chip again to nudge it");
  }
  if (lastTi < 0) return;
  renderTrackbar(); buildScoreModel(); updateTrackGains(); computeSongEnd(); draw();
  requestAnimationFrame(renderTrackbar);
}
// The Normal auto-seed that used to write the file's own meter/key straight
// into a real annotation at import (P2, 2026-09-29) is GONE
// (docs/declared-vs-learner-spec.md C5, superseding that ruling): the file's
// own labels now live apart, in source (see parseMidi/checkKeyVsFile/
// checkMeterVsFile), never written as his answer just because Normal mode is
// on. An import writes NO ff1roll-notes-* in either mode.
export function localMidiOpen(parsed, name) {
  // a local MIDI becomes a device-local draft (Josh's report 2026-08-15:
  // switching songs used to lose it with no way back) — reopen from
  // Open → drafts; ✕ there to let it go; never synced to the repo
  const key = "local/" + slugify(name.replace(/\.(midi?|smf|kar|rmi)$/i, "")) + ".mid";
  draftWrite(key, {
    savedStamp: 0, dirty: true, title: name, ppq: parsed.ppq, timesig: parsed.timesig || [4, 4],
    ...(parsed.source ? {source: parsed.source} : {}), // the file's OWN meter/key history, kept apart from what he later declares (docs/declared-vs-learner-spec.md)
    tempos: parsed.tempos,
    tracks: parsed.tracks.map(tr => ({name: tr.name,
      ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}), // CC10 in the dropped file — survives to the republished copy
      ...ctlCopy(tr), // its bends, volumes, sustain, reverb sends, programs too
      ...(tr.offset ? {offset: tr.offset} : {}),
      ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how the raw metas in source.metas reattach after edits
      notes: tr.notes.map(nt => {
      const o = {t: nt.t, d: nt.d, p: nt.p, v: nt.v};
      if (nt.ch !== undefined) o.ch = nt.ch; // drums live on ch 9 — must survive the round-trip
      if (nt.duty !== undefined) o.duty = nt.duty; // chip timbre survives too
      if (nt.ve !== undefined) o.ve = nt.ve; // decay target survives
      if (nt.env) o.env = nt.env.map(q => ({...q})); // volume shape survives
      if (nt.duties) o.duties = nt.duties.map(q => ({...q})); // duty changes inside the note survive
      if (nt.lg) o.lg = 1; // glide link (CC84): plays on from the note before it
      return o;
    })}))});
  openDraft(key);
  setInfo(name + " imported — edits stay on this device; reopen from Open → LOCAL");
}
export function fsubItem(label, onTap, dim, icon) { // icon: an ICON table name — label is always a hardcoded string, never user text, so innerHTML is safe here
  const b = document.createElement("button");
  b.className = "fitem";
  if (dim) b.style.color = "var(--dim)";
  if (icon) b.innerHTML = iconSvg(icon) + "  " + label;
  else b.textContent = label;
  b.addEventListener("click", onTap);
  filesub.appendChild(b);
}
export function fsubHeader(text) {
  const h = document.createElement("div");
  h.className = "meta";
  h.style.cssText = "padding:8px 10px 2px;letter-spacing:.1em;white-space:normal";
  h.textContent = text;
  filesub.appendChild(h);
}
export function fsubAlbums() { // File → Open, top: LOCAL's top-level folders, then PUBLISHED's
  filesub.innerHTML = "";
  const local = folderTree(draftKeys());
  if (subfolderKeys(local).length) {
    fsubHeader(localLabel());
    for (const seg of subfolderKeys(local)) fsubItem(segTitle(local.sub[seg].path) + "  (" + nodeCount(local.sub[seg]) + ")  ›", () => fsubFolder("local", local.sub[seg].path));
  }
  fsubHeader(publishedLabel());
  const pub = folderTree(publishedPaths());
  for (const seg of subfolderKeys(pub)) fsubItem(segTitle(pub.sub[seg].path) + "  (" + nodeCount(pub.sub[seg]) + ")  ›", () => fsubFolder("published", pub.sub[seg].path));
  { // build stamp: which deploy THIS tab is actually running (stale-cache tell)
    // ONE stamp: this runs on every open and every "‹ back", and each run
    // appended another line (Josh, 2026-09-27: "there's two of them … earlier three")
    const old = document.getElementById("fsubbuild"); if (old) old.remove();
    const d = document.createElement("div");
    d.id = "fsubbuild";
    d.className = "meta";
    d.style.cssText = "padding:6px 10px;opacity:.6;white-space:normal";
    const installed = typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches;
    d.textContent = "build " + (document.lastModified || "unknown") + (installed ? " · installed" : "") + (typeof navigator !== "undefined" && navigator.onLine === false ? " · offline" : "");
    document.getElementById("filesheet").appendChild(d);
  }
}
export function fsubFolder(section, folder) { // one level: subfolders, then this folder's songs
  const root = folderTree(section === "local" ? draftKeys() : publishedPaths());
  const node = nodeAt(root, folder);
  if (!node) return fsubAlbums();
  if (section === "local" && node.songs.length && node.songs.every(isCaptureKey) && !subfolderKeys(node).length)
    return fsubImportAlbum(folder.split("/").pop()); // captures: publish-all + per-track rows
  filesub.innerHTML = "";
  const up = parentFolder(folder);
  fsubItem("‹ " + (up ? segTitle(up) : "All folders"), () => up ? fsubFolder(section, up) : fsubAlbums(), true);
  fsubHeader((section === "local" ? localLabel() : publishedLabel()) + "  ·  " + folderTitle(folder));
  for (const seg of subfolderKeys(node)) fsubItem(segTitle(node.sub[seg].path) + "  (" + nodeCount(node.sub[seg]) + ")  ›", () => fsubFolder(section, node.sub[seg].path));
  if (section === "local") {
    const songs = node.songs.slice().sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b)));
    const rerender = () => { (nodeAt(folderTree(draftKeys()), folder) || {songs: []}).songs.length ? fsubFolder("local", folder) : fsubAlbums(); };
    for (const key of songs) draftRow(key, songTitleOf(key) + "  · " + songStatus(key), rerender);
    return;
  }
  const group = node.songs.length && groupOf(node.songs[0]);
  const oneAlbum = !!(group && node.songs.every(p => groupOf(p) === group)); // this folder is one album: the only way into an album run
  if (oneAlbum && albumHasTrackData(group)) filesub.appendChild(albumOrderControl(group, () => fsubFolder(section, folder)));
  const songs = oneAlbum
    ? albumEffectiveOrder(group).map(([, p]) => p).filter(p => node.songs.includes(p))
    : node.songs.slice().sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b)));
  if (oneAlbum) { // play follows the SAME order the list just showed (Josh: WYSIWYG)
    const here = songs.indexOf(S.currentPath);
    const from = here >= 0 ? here : 0;
    fsubItem("Play album" + (here >= 0 ? " from " + (here + 1) + "/" + songs.length : ""),
             () => { closeFileMenus(); albumStart(group, from); }, false, "album");
  }
  for (const path of songs)
    fsubItem(songTitleOf(path) + (localStorage.getItem(draftStoreKey(path)) !== null ? "  · local copy" : "") + (path === S.currentPath ? "   ✓" : ""), () => {
      closeFileMenus();
      albumClear(); // picking a song by hand ends an album run
      S.currentPath = path;
      rememberLastSong(path);
      reflectSongURL(path);
      updateSongBtn();
      loadSong(path).catch(err => setInfo(err.message));
    });
}
export function fsubSongs(group) { fsubFolder("published", folderOf(S.CATALOG[group][0][1])); } // an album is its folder
export function fsubLocalFolder(folder) { return fsubFolder("local", folder); }
export function fsubImportAlbum(slug) {
  filesub.innerHTML = "";
  { const f = folderOf(importDraftKeys().find(k => k.split("/")[2] === slug) || "albums/imports/" + slug + "/x.mid");
    fsubItem("‹ " + (parentFolder(f) ? segTitle(parentFolder(f)) : "All folders"), () => parentFolder(f) ? fsubFolder("local", parentFolder(f)) : fsubAlbums(), true); }
  fsubHeader(localLabel());
  const keys = importDraftKeys().filter(k => k.split("/")[2] === slug);
  const all = document.createElement("button"); // whole folder in one publish
  all.className = "fitem";
  all.style.color = "var(--gold)";
  all.dataset.impcommit = slug;
  all.textContent = publishLabel("folder (" + keys.length + " track" + (keys.length === 1 ? "" : "s") + ")");
  all.disabled = !publishDest();
  { const live = jobsFind("publish", slug, true); if (live) { all.disabled = true; all.textContent = "⏳ " + (live.note || "publishing…"); } } // reopened mid-run: the job carries the line
  all.addEventListener("click", () => {
    const status = s => { // the button if the menu shows it, and the footer strip always
      const b = filesub.querySelector('[data-impcommit="' + slug + '"]');
      if (b) b.textContent = s;
      setInfo("⇪ " + titleCaseSlug(slug) + ": " + s);
    };
    const job = publishJobStart(slug, keys, status);
    if (!job) return;
    all.disabled = true;
    closeFileMenus(); // Josh's ask (3a): starting a folder publish from File → Open opens the dialog, not a bare status line
    openPubJobSheet(job);
    const off = jobsOnChange(() => { if (job.state === "running") return; off(); importDraftKeys().some(k => k.split("/")[2] === slug) ? fsubImportAlbum(slug) : fsubAlbums(); });
  });
  filesub.appendChild(all);
  { // the folder's ✕ (tap twice) discards the WHOLE album's captures at once (Josh 2026-08-16)
    const del = document.createElement("button");
    del.className = "fitem";
    del.style.cssText = "color:var(--dim)";
    del.textContent = "✕ Discard this folder's captures";
    del.addEventListener("click", () => {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "✕ Discard all " + keys.length + "? Tap again"; del.style.color = "#e66767"; return; }
      for (const k of importDraftKeys().filter(k => k.split("/")[2] === slug)) {
        for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-"])
          localStorage.removeItem(pre + k);
        idbDraftDelete(k);
      }
      fsubAlbums();
    });
    filesub.appendChild(del);
  }
  for (const key of keys) {
    const up = document.createElement("button"); // single track -> same album, top level
    up.className = "fitem";
    up.style.cssText = "flex:none;width:auto;color:var(--dim)";
    up.textContent = "⇪";
    up.setAttribute("aria-label", "Publish this track");
    up.disabled = !publishDest();
    up.addEventListener("click", () => {
      const job = publishJobStart(slug, [key], s => fileStatus(s));
      if (!job) return;
      up.disabled = true;
      const off = jobsOnChange(() => { if (job.state === "running") return; off(); importDraftKeys().some(k => k.split("/")[2] === slug) ? fsubImportAlbum(slug) : fsubAlbums(); });
    });
    draftRow(key, songTitleOf(key) + "  · " + songStatus(key),
             () => { importDraftKeys().some(k => k.split("/")[2] === slug) ? fsubImportAlbum(slug) : fsubAlbums(); },
             up);
  }
}

// [{name, parsed}] awaiting a destination choice
export function initHub1() {
  document.getElementById("cfgnsfcreate").addEventListener("click", async e => {
    const btn = e.currentTarget, out = document.getElementById("cfgnsfstatus");
    btn.disabled = true;
    try { const full = await createGameFilesRepo(t => { out.textContent = t; }); if (full) document.getElementById("cfgnsfrepo").value = full; }
    catch (err) { out.textContent = "⚠ " + err.message; }
    finally { btn.disabled = false; }
  });
  document.getElementById("fileinput").addEventListener("change", async e => {
    const files = [...e.target.files];
    if (!files.length) return;
    stop();
    closeFileMenus();
    try {
      const loaded = [];
      for (const f of files) loaded.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer())});
      await openPickedFiles(loaded);
    } catch (err) { setInfo("could not import: " + err.message); }
    e.target.value = ""; // allow re-picking the same file
  });
  document.getElementById("fileimporthub").addEventListener("click", () => {
    closeFileMenus();
    document.getElementById("importhubstatus").textContent = "Drop files anywhere on this panel, or use a section's Choose files… above.";
    document.getElementById("importhub").classList.add("on");
  });
  // by id, not document.querySelectorAll("[data-kind]") — the vm harness's
  // document stub has no querySelectorAll, only getElementById (NIGHT-ROLL.md/
  // CLAUDE.md: the harness strings-match the hub's markup instead)
  for (const [id, kind] of [["ihMidi", "midi"], ["ihNes", "nes"], ["ihGb", "gb"], ["ihSnes", "snes"],
                            ["ihGenesis", "genesis"], ["ihPs1", "ps1"], ["ihPs2", "ps2"], ["ihN64", "n64"],
                            ["ihSf2", "sf2"], ["ihAudio", "audio"]]) {
    document.getElementById(id).addEventListener("click", () => {
      document.getElementById("importhubstatus").textContent = "choose your " + importHubLabel(kind) + " file(s)…";
      document.getElementById("fileinput").click();
    });
  }
  // the drop target (phase 2 of the design): dragover/drop on #importhub only,
  // feeding the dropped files to the same openPickedFiles the picker uses —
  // its own comment above already anticipated a drop.
  document.getElementById("importhub").addEventListener("dragover", e => {
    e.preventDefault();
    document.getElementById("importhub").classList.add("dragover");
  });
  document.getElementById("importhub").addEventListener("dragleave", e => {
    if (e.target === document.getElementById("importhub")) document.getElementById("importhub").classList.remove("dragover");
  });
  document.getElementById("importhub").addEventListener("drop", async e => {
    e.preventDefault();
    document.getElementById("importhub").classList.remove("dragover");
    const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
    if (!files.length) return;
    stop();
    try {
      const loaded = [];
      for (const f of files) loaded.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer())});
      await openPickedFiles(loaded);
    } catch (err) { setInfo("could not import: " + err.message); }
    closeFileMenus();
  });
  document.getElementById("midcancel").addEventListener("click", () => {
    S.pendingMidis = null;
    document.getElementById("midisheet").classList.remove("on");
  });
   document.getElementById("audioinput").addEventListener("change", async e => {
    const files = [...e.target.files];
    e.target.value = "";
    if (!files.length) return;
    stop();
    try {
      const items = [];
      for (const f of files) items.push({name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), type: f.type});
      await importAudioFiles(items);
    } catch (err) { setInfo("could not import: " + err.message); }
  });
  document.getElementById("midlocal").addEventListener("click", () => {
    if (!S.pendingMidis || !S.pendingMidis.length) return;
    const {name, parsed} = S.pendingMidis[0];
    S.pendingMidis = null;
    document.getElementById("midisheet").classList.remove("on");
    localMidiOpen(parsed, name);
  });
  document.getElementById("midcreate").addEventListener("click", () => {
    if (!S.pendingMidis || !S.pendingMidis.length) return;
    const alb = document.getElementById("midalbum").value.trim();
    if (!alb) { setInfo("⚠ name the album first"); return; }
    const slug = folderFromInput(alb) || slugify(alb);
    let firstKey = null;
    for (const {name, parsed} of S.pendingMidis) {
      const base = slugify(name.replace(/\.(midi?|smf|kar|rmi)$/i, ""));
      const key = "albums/" + slug + "/" + base + ".mid"; // MIDI files: a folder of the user's own, editable, published like any song
      if (!firstKey) firstKey = key;
      draftWrite(key, {
        savedStamp: 0, dirty: true, title: name.replace(/\.(midi?|smf|kar|rmi)$/i, ""),
        ppq: parsed.ppq, timesig: parsed.timesig || [4, 4],
        ...(parsed.source ? {source: parsed.source} : {}), // the file's OWN meter/key history, kept apart from what he later declares (docs/declared-vs-learner-spec.md)
        tempos: parsed.tempos,
        tracks: parsed.tracks.map(tr => ({name: tr.name,
          ...(tr.midiPan !== undefined ? {midiPan: tr.midiPan} : {}),
          ...ctlCopy(tr),
          ...(tr.offset ? {offset: tr.offset} : {}),
          ...(tr.srcIndex !== undefined ? {srcIndex: tr.srcIndex} : {}), // docs/declared-vs-learner-spec.md phase 2: how the raw metas in source.metas reattach after edits
          notes: tr.notes.map(nt => {
          const o = {t: nt.t, d: nt.d, p: nt.p, v: nt.v};
          if (nt.ch !== undefined) o.ch = nt.ch;
          if (nt.duty !== undefined) o.duty = nt.duty;
          if (nt.ve !== undefined) o.ve = nt.ve;
          if (nt.env) o.env = nt.env.map(q => ({...q})); // volume shape survives
          if (nt.duties) o.duties = nt.duties.map(q => ({...q})); // duty changes inside the note survive
          if (nt.lg) o.lg = 1; // glide link (CC84): plays on from the note before it
          return o;
        })}))});
    }
    const count = S.pendingMidis.length;
    S.pendingMidis = null;
    document.getElementById("midisheet").classList.remove("on");
    stop();
    openDraft(firstKey);
    setInfo(count + " song" + (count === 1 ? "" : "s") + " in album \"" + alb +
            "\" — Open → LOCAL to audition/rename, ⇪ Publish sends it to the songs repo.");
  });
}
