import { jobControls } from "../model/jobs.js";
import { S, prof } from "../state.js";
import { JOB_KINDS } from "../model/jobs.js";
import { jobBarSet } from "../model/jobs.js";
import { jobFraction } from "../model/jobs.js";
import { jobProgress } from "../model/jobs.js";
import { iconSvg } from "./icons.js";
import { folderActive } from "../platform/folder.js";
import { fsRoot } from "../platform/folder.js";
import { catalogHas } from "../model/catalog.js";
import { readVersions } from "../model/versions.js";
import { appConfirmImpl as appConfirm } from "./chrome.js";
import { pushVersion } from "../model/versions.js";
import { draftStoreKey } from "../platform/storage.js";
import { setInfoImpl as setInfo } from "./chrome.js";
import { askUnsavedCount } from "../ask/bridge.js";
import { askRevertToSaved } from "../ask/bridge.js";
import { updateSyncBtnImpl as updateSyncBtn } from "./chrome.js";
import { updateSongBtnImpl as updateSongBtn } from "./chrome.js";
import { asksheet } from "../ask/sheet.js";
import { askStoreKey } from "../ask/sheet.js";
import { editableSong } from "../model/song.js";
import { barTicks } from "../model/rollnotes.js";
import { visibleNotes } from "../model/rollnotes.js";
import { trackIsDrums } from "../model/grid.js";
import { drBassTrack } from "../gen/drummer.js";
import { snapBeat } from "../model/grid.js";
import { beatTicks } from "../model/grid.js";
import { setBeatPair } from "./note-editor.js";
import { effTs } from "../model/grid.js";
import { isComposition } from "../model/provenance.js";
import { cfg } from "../platform/storage.js";
import { LINK_SONGS } from "../platform/base.js";
import { linkRepoLabel } from "../platform/base.js";
import { writeToken } from "../sync/publish.js";
import { isUnsaved } from "../model/provenance.js";
import { appMode } from "../platform/mode.js";
import { debugLogOn } from "../model/jobs.js";
import { chipStreamMode } from "../audio/chip-stream.js";
import { recSnapOn } from "../input/record.js";
import { aiBrowserMenu } from "../ask/backend.js";
import { aiBackendRows } from "../ask/backend.js";
import { aiModelMenu } from "../ask/backend.js";
import { shareLinkFor } from "../sync/publish.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { jobsSave } from "../model/jobs.js";
import { draftKeys } from "../model/versions.js";
import { syncable } from "./chrome.js";
import { logDebugImpl as logDebug } from "./chrome.js";
import { idbDraftDelete } from "../platform/storage.js";
import { bsChordTimeline } from "../gen/bassist.js";
import { drBoundaries } from "../gen/drummer.js";
import { fmtBarBeat } from "../gen/drummer.js";
import { drNormParts } from "../gen/drummer.js";
import { askDraftLoad } from "../ask/sheet.js";
import { asklog } from "../ask/sheet.js";
import { askStore } from "../ask/bridge.js";
import { askMsgMode } from "../ask/context.js";
import { askClock } from "../ask/sheet.js";
import { askNoteLabel } from "../ask/sheet.js";
import { askStripContext } from "../ask/context.js";
import { askPartial } from "../ask/sheet.js";
import { pendingSongs } from "./chrome.js";
import { pendingChats } from "./chrome.js";
import { pendingChatLabel } from "../sync/publish.js";
import { wmWhereIs } from "./wm.js";
import { takeToken } from "../sync/publish.js";
import { ghHeaders } from "../audio/chip.js";
import { draftDirtyState } from "./chrome.js";
import { aiSay } from "../ask/backend.js";
import { jobListeners } from "../model/jobs.js";
import { updateJobsBtnImpl as updateJobsBtn } from "./chrome.js";
import { JOBS_AUTOCLEAR_MS } from "../model/jobs.js";
import { readData } from "../platform/folder.js";
import { parseMidi } from "../midi/parse.js";
import { cmpDiff } from "../render/compare.js";
import { musicSig } from "../model/versions.js";
import { askLogPath } from "../ask/bridge.js";
import { folderRead } from "../platform/folder.js";
import { songsURL } from "../platform/storage.js";
import { analysisURL } from "../platform/storage.js";
import { askScrollEnd } from "../ask/sheet.js";
import { draftInIdb } from "../platform/storage.js";
import { askPendingAll } from "../ask/bridge.js";
import { askJobsSupported } from "../ask/bridge.js";
import { aiUrl } from "../ask/backend.js";
import { aiHeaders } from "../ask/backend.js";
import { askstatus } from "../ask/sheet.js";
import { askPendingIndex } from "../ask/bridge.js";
import { askSpan } from "../ask/context.js";
import { askBudget } from "../ask/context.js";
import { askBuildMessages } from "../ask/context.js";
import { askJobId } from "../ask/bridge.js";
import { logErrImpl as logErr } from "./chrome.js";
import { idbDraftOp } from "../platform/storage.js";
import { idbOpen } from "../platform/storage.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { addTrackUndoable } from "../model/edits.js";
import { saveDraft } from "../model/versions.js";
import { sectionLane } from "../gen/drummer.js";
import { drumRng } from "../gen/drummer.js";
import { DR_FILLS } from "../gen/drummer.js";
import { drBackbeats } from "../gen/drummer.js";
import { pushUndo } from "../model/edits.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { clampViewImpl as clampView } from "./chrome.js";
import { drawImpl as draw } from "./chrome.js";
import { bsInferTimeline } from "../gen/bassist.js";
import { keyNameAt } from "../model/song.js";
import { sfDeclaredAt } from "../model/song.js";
import { tonicPcOfName } from "../theory/chords.js";
import { chordAt } from "../gen/bassist.js";
import { nextChange } from "../gen/bassist.js";
import { isLocalDraft } from "../model/edits.js";
import { editsKey } from "../model/edits.js";
import { updateClearBtn } from "../model/edits.js";
import { idbDraftPut } from "../platform/storage.js";
import { jobsNotify } from "../model/jobs.js";
import { draftWrite } from "../model/versions.js";
import { albumMetaFor } from "../model/provenance.js";
import { instAlbums } from "../audio/voices.js";
import { ensureAudio } from "../audio/engine.js";
import { resumeAudio } from "../audio/engine.js";
import { openMaster } from "../audio/engine.js";
import { previewOut } from "../audio/engine.js";
import { instPlayer } from "../audio/voices.js";
import { instSamples } from "../audio/voices.js";
import { FOLDER_NAMES } from "../model/catalog.js";
import { instLibrary } from "../audio/voices.js";
import { songRow } from "./chrome.js";
import { bsGenerate } from "../gen/bassist.js";
import { drGenerate } from "../gen/drummer.js";
import { fingerprintOldDrafts } from "../sync/publish.js";
import { askCommitLog } from "../ask/bridge.js";
import { openDraft } from "../session/song.js";
import { loadSong } from "../session/song.js";
import { publishAllJobStart } from "../sync/publish.js";
import { revertSongToRepo } from "../session/files.js";
import { cmpEnter } from "./chrome.js";
import { discardPending } from "../sync/publish.js";
import { askRenderImpl as askRender } from "../ask/sheet.js";
import { syncDurSeg } from "./note-editor.js";
import { clipboardHas } from "../model/selection.js";
import { nativeFs } from "../platform/folder.js";
import { folderSupported } from "../platform/folder.js";
import { albumMetaCache } from "../model/provenance.js";
import { initCatalog } from "../model/catalog.js";
import { folderPermission } from "../platform/folder.js";
import { idbFsPut } from "../platform/storage.js";
import { setAppMode } from "../platform/mode.js";
import { applyMode } from "./chrome.js";
import { errChip } from "./chrome.js";
import { saveCfg } from "../platform/storage.js";
import { askRefresh } from "../ask/sheet.js";
import { insertTime } from "../model/selection.js";
import { deleteTime } from "../model/selection.js";
import { jobsOnChange } from "../model/jobs.js";
import { met } from "../audio/metronome.js";
import { metBuildCells } from "../audio/metronome.js";
import { applyMetMode } from "../audio/metronome.js";
import { metHalt } from "../audio/metronome.js";
import { metStart } from "../audio/metronome.js";
import { songRegionRight } from "./chrome.js";
import { metSave } from "../audio/metronome.js";
import { metDefaultAccents } from "../audio/metronome.js";
import { metFollowNum } from "../audio/metronome.js";
import { chordLabel } from "./note-editor.js";
import { CHORD_ROOTS } from "./note-editor.js";
import { CHORD_QUALS } from "../theory/chords.js";
import { INS_DURS } from "./note-editor.js";
import { insertChordAt } from "../model/selection.js";
import { PROG_LIB } from "./note-editor.js";
import { insertProgressionAt } from "../model/selection.js";
import { splitProgression } from "../theory/chords.js";
import { parseNumeral } from "../theory/chords.js";
import { repoName } from "../platform/storage.js";
import { renderTrackbarImpl as renderTrackbar } from "./trackbar.js";
import { undoTrackAdd } from "../model/edits.js";
import { saveEdits } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { getBeatPair } from "./note-editor.js";
import { selEditItems } from "../model/selection.js";
import { moveSelectionToTrack } from "../model/selection.js";
import { dedupeSong } from "../model/selection.js";
import { pasteClipboard } from "../model/selection.js";
import { clipSummary } from "../model/selection.js";
import { closeFileMenus } from "./chrome.js";
import { serializeRollnotes } from "../model/rollnotes.js";
import { baseName } from "../model/rollnotes.js";
import { openSaveForm } from "../session/files.js";
import { publishOpenComposition } from "../sync/publish.js";
import { publishSong } from "../sync/publish.js";
import { renderNoteList } from "./notes.js";
import { notelistSheet } from "./notes.js";

export function jobCancel(id) { const c = jobControls[id]; if (c) c.aborted = true; const j = S.jobs.find(x => x.id === id); if (j && j.state === "queued") jobApi(j).cancel(); }
export function renderJobs() {
  const list = document.getElementById("jobslist");
  list.innerHTML = "";
  if (!S.jobs.length) { const d = document.createElement("div"); d.className = "status"; d.textContent = "No jobs."; list.appendChild(d); return; }
  for (const job of S.jobs.slice().reverse()) {
    const kind = JOB_KINDS[job.kind] || {};
    const row = document.createElement("div");
    row.className = "row";
    const body = document.createElement("span");
    body.className = "jobbody";
    body.style.cssText = "flex:1;min-width:0;font-size:0.8125rem";
    const word = {running: "⏳", queued: "· queued", done: "✓", failed: "✗ failed", cancelled: "✕ cancelled", interrupted: "⚠ interrupted"}[job.state] || job.state;
    const line = document.createElement("div");
    line.textContent = (kind.label ? kind.label(job) : job.title) + "  " + word + (job.err ? "  " + job.err : "");
    body.appendChild(line);
    if (job.err) { // a failed job's error text, selectable above (.jobbody) but easy to miss on the iPad — Copy it directly
      const cp = document.createElement("button");
      cp.className = "copybtn sm"; cp.type = "button"; cp.setAttribute("aria-label", "Copy this error");
      cp.addEventListener("click", ev => { ev.stopPropagation(); askCopyText(job.err, cp); });
      line.appendChild(cp);
    }
    const barrow = document.createElement("div");
    barrow.className = "jobbarrow";
    const bar = document.createElement("div");
    bar.className = "jobbar";
    jobBarSet(bar, jobFraction(job));
    barrow.appendChild(bar);
    const prog = jobProgress(job);
    if (prog) { const p = document.createElement("span"); p.className = "jobprog"; p.textContent = prog; barrow.appendChild(p); }
    body.appendChild(barrow);
    row.appendChild(body);
    const btn = (label, fn, aria, icon) => { const b = document.createElement("button"); if (icon) b.innerHTML = iconSvg(icon); else b.textContent = label; b.style.minHeight = "36px"; if (aria) b.setAttribute("aria-label", aria); b.addEventListener("click", fn); row.appendChild(b); };
    if (kind.open) btn("Open", () => { document.getElementById("jobssheet").classList.remove("on"); kind.open(job); });
    if (job.state === "running" || job.state === "queued") btn("✕", () => { jobCancel(job.id); renderJobs(); }, "Cancel");
    else {
      if (kind.retry && job.state !== "done") btn(null, () => { document.getElementById("jobssheet").classList.remove("on"); kind.retry(job); }, "Retry what is left", "refresh");
      btn("✕", () => { jobsDismiss(job.id); renderJobs(); }, "Dismiss");
    }
    list.appendChild(row);
  }
}
export function openPubJobSheet(job) {
  S.pubJobShown = job.id;
  renderPubJob();
  document.getElementById("pubjobsheet").classList.add("on");
}
export function renderPubJob() {
  const sheet = document.getElementById("pubjobsheet");
  const job = S.jobs.find(j => j.id === S.pubJobShown);
  if (!job) { sheet.classList.remove("on"); return; }
  document.getElementById("pubjobtitle").textContent = job.title || "Publish";
  jobBarSet(document.getElementById("pubjobbar"), jobFraction(job));
  document.getElementById("pubjobnote").textContent = job.note || (job.err ? "⚠ " + job.err : ""); // a job that failed before any item ran (no token) has only job.err to show
  const list = document.getElementById("pubjoblist");
  list.innerHTML = "";
  for (const it of job.items || []) {
    const row = document.createElement("div");
    row.className = "pubjobrow";
    const name = document.createElement("span");
    name.className = "pjname";
    name.textContent = it.label;
    row.appendChild(name);
    if (it.st === "running") {
      const bar = document.createElement("div");
      bar.className = "jobbar sm";
      jobBarSet(bar, it.pct || 0);
      const state = document.createElement("span");
      state.className = "pjstate";
      state.appendChild(bar);
      row.appendChild(state);
    } else {
      const {cls, text} = pubItemIcon(it);
      const state = document.createElement("span");
      state.className = "pjstate" + (cls ? " " + cls : "");
      state.textContent = text;
      row.appendChild(state);
      if (it.st === "failed" && it.msg) { // the failure text, copyable (same need as a job's .jobbody error)
        const cp = document.createElement("button");
        cp.className = "copybtn sm"; cp.type = "button"; cp.setAttribute("aria-label", "Copy this error");
        cp.addEventListener("click", ev => { ev.stopPropagation(); askCopyText(it.msg, cp); });
        row.appendChild(cp);
      }
    }
    list.appendChild(row);
  }
  const running = job.state === "running" || job.state === "queued";
  document.getElementById("pubjobcancel").style.display = running ? "" : "none";
  const kind = JOB_KINDS[job.kind]; // Retry: the Jobs list's rule — over and not done, and the kind knows how
  document.getElementById("pubjobretry").style.display = !running && job.state !== "done" && kind && kind.retry ? "" : "none";
}
export function publishDest() { // where Publish would send things: "github" | "folder" | null
  if (folderActive()) return "folder";
  return localStorage.getItem("ff1roll-ghtoken") ? "github" : null;
}
export function publishLabel(what) { // the button says where it goes; with nowhere to go it says what to do (never "Commit")
  const d = publishDest();
  return d === "github" ? "⇪ Publish " + what : d === "folder" ? "Save " + what + " to " + (fsRoot.mode === "native" ? "Files" : "folder") : "Connect GitHub to publish";
}
// ---- Versions… sheet (File menu, replaces the old Revert to last save… /
// Revert to repo copy… / Restore unsaved copy…): the published copy (when
// there is one) at the top, then this device's dated versions newest first.
// "Go back to this" on any row pushes the CURRENT state as a version first
// ("Before going back"), so a wrong tap never loses anything.
export function versionLabel(v) { // "Version 3 · Sep 29 14:02" / a migrated or manual label as-is
  const d = new Date(v.at);
  const stamp = d.toLocaleDateString(undefined, {month: "short", day: "numeric"}) + " " +
                d.toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit", hour12: false});
  return v.label + " · " + stamp;
}
export function openAnalyzeSheet(target) { // target: {kind:"chord"|"key", start, end, text}
  S.analyzeTarget = target;
  const isChord = target.kind === "chord";
  document.getElementById("analyzetext").textContent =
    (isChord ? "Chord (analysis estimate): " + target.text : "Key (analysis estimate): " + target.text) +
    " — an estimate, not written as an annotation until you adopt it.";
  document.getElementById("analyzeadopt").textContent = isChord ? "Adopt this chord" : "Adopt this key";
  document.getElementById("analyzeadoptall").style.display = isChord && S.analysisBands.chords.length > 1 ? "" : "none";
  document.getElementById("analyzesheet").classList.add("on");
}
export function openSettingsSheet() {
  const c = cfg();
  cfgShowPane(localStorage.getItem("ff1roll-cfgpane") || "saving");
  document.getElementById("ghtoken").value = localStorage.getItem("ff1roll-ghtoken") || "";
  document.getElementById("cfgsongsrepo").value = c.songsRepo;
  document.getElementById("cfglearning").checked = appMode() === "learning";
  document.getElementById("cfgdebuglog").checked = debugLogOn();
  document.getElementById("cfgchipstream").value = chipStreamMode();
  document.getElementById("cfgpeninstant").checked = penInstant();
  document.getElementById("cfgnotetapcursor").checked = noteTapMovesCursor();
  document.getElementById("cfgrecsnap").checked = recSnapOn();
  document.getElementById("cfgtextsize").value = textSizePref();
  ghCheckOut("");
  if (localStorage.getItem("ff1roll-ghtoken")) ghCheck(); // one small GET: "connected" shows without a tap
  document.getElementById("cfgnsfrepo").value = c.nsfRepo;
  document.getElementById("cfgaibackend").value = c.aiBackend;
  aiBrowserMenu(c.aiBrowserModel);
  aiBackendRows();
  document.getElementById("cfgaiurl").value = c.aiUrl;
  aiModelMenu(S.askModelCache && S.askModelCache.url === c.aiUrl.replace(/\/+$/, "") ? S.askModelCache.ids : [], c.aiModel);
  document.getElementById("cfgaikey").value = localStorage.getItem("ff1roll-aikey") || "";
  document.getElementById("cfgaiwindow").value = c.aiWindow;
  const out = document.getElementById("cfgaitestout");
  out.textContent = ""; out.classList.remove("ok", "err");
  document.getElementById("settingssheet").classList.add("on");
}
export function openShareSheet() { // File → Share link: the link, visible, with Copy and the system share sheet
  const has = !!S.songKey && /^albums\//.test(S.songKey);
  const link = has ? shareLinkFor(S.songKey) : "";
  document.getElementById("shBody").textContent = has
    ? songTitleOf(S.songKey) + " — anyone with this link can listen:"
    : "This song only lives on this device, so it has no link yet — Publish it first (File → Publish…).";
  const url = document.getElementById("shUrl");
  url.value = link; url.style.display = has ? "" : "none";
  document.getElementById("shCopy").style.display = has ? "" : "none";
  document.getElementById("shSend").style.display = has && navigator.share ? "" : "none";
  document.getElementById("sharesheet").classList.add("on");
}

export function jobApi(job) {
  const ctl = jobControls[job.id] || (jobControls[job.id] = {aborted: false});
  const finish = (state, err) => { job.state = state; job.ended = Date.now(); if (err) job.err = String(err && err.message || err); delete jobControls[job.id]; jobsSave(true); jobsNotify(); if (state === "done" || state === "cancelled") jobsAutoClear(job.id); };
  return {
    job,
    get aborted() { return ctl.aborted; },
    update(i, patch) { const it = job.items[i]; if (!it) return; Object.assign(it, patch); if (patch.st) jobsSave(true); else jobsSave(); jobsNotify(); },
    note(text) { job.note = text; jobsSave(); jobsNotify(); },
    done() { finish("done"); },
    fail(err) { finish("failed", err); },
    cancel() { finish("cancelled"); },
  };
}
export function jobsDismiss(id) { S.jobs = S.jobs.filter(j => j.id !== id); jobsSave(true); jobsNotify(); }
export function pubItemIcon(it) {
  if (it.st === "done" || it.st === "silent") return {cls: "done", text: "✓"};
  if (it.st === "failed") return {cls: "fail", text: "⚠ " + (it.msg || "failed")};
  if (it.st === "cancelled") return {cls: "", text: "✕ cancelled"};
  if (it.st === "interrupted") return {cls: "", text: "⚠ interrupted"};
  return {cls: "", text: "…"};
}
// ---------------------------------------------------------------- sync
export const syncsheet = document.getElementById("syncsheet");
// The Publish sheet checks every listed draft against the PUBLISHED copy the
// way Compare does (notes by tick+pitch, length and velocity; tempo map), not
// by a byte fingerprint: a draft whose music matches is taken off the list
// (and an unstamped one adopts the repo's stamp — identical music can mask
// nothing), and one that differs says how, on its line. The strict fingerprint
// left songs "edited" whose Compare showed +0 −0 ~0 (Josh, 2026-09-29), and
// guessing why cost three rounds; the sheet now shows the facts.
export const pubCheck = new Map();
export async function pubCompareDraft(key, d) { // -> {same, text}
  let repoStamp = 0;
  try { const r = await readData("analysis", key.replace(/\.mid$/, "") + ".rollnotes.json", true); if (r.ok) repoStamp = JSON.parse(await r.text()).saved || 0; } catch (err) { /* no annotations file: fine */ }
  let pub;
  try {
    const r = await readData("songs", key, true);
    if (!r.ok) return {same: false, text: "not in the repo yet (HTTP " + r.status + ")"};
    pub = parseMidi(await r.arrayBuffer());
  } catch (err) { return {same: false, text: "couldn't read the published copy: " + err.message}; }
  const scale = d.ppq / pub.ppq;
  const repoTracks = pub.tracks.map(t => ({name: t.name, notes: t.notes.map(n => scale === 1 ? n : {...n, t: Math.round(n.t * scale), d: Math.round(n.d * scale)})}));
  const diff = cmpDiff(repoTracks, d.tracks);
  const same = !diff.tracks.length; // notes only: tempo is an annotation (see musicSig)
  if (same) {
    d.dirty = false; d.pubSig = musicSig(d);
    if (repoStamp && !d.savedStamp) d.savedStamp = repoStamp;
    try { draftWrite(key, d); } catch (err) { /* full: stays listed */ }
    return {same, text: ""};
  }
  const parts = [];
  parts.push("+" + diff.added + " −" + diff.removed + " ~" + diff.changed + " notes (" + diff.tracks.map(t => t.name).join(", ") + ")");
  return {same, text: "vs published: " + parts.join("; ")};
}
export function dropLocalSong(key) { // Revert to repo copy's discard: the current state is saved as a version first ("Before going back"), so nothing is lost
  pushVersion(key, "Before going back"); // migrates any pre-versions checkpoint/stash too; a no-op when there's nothing local yet
  for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-",
                     "ff1roll-tombs-", "ff1roll-lastsync-"])
    localStorage.removeItem(pre + key);
  idbDraftDelete(key);
}
export async function askCopyText(text, b) {
  let ok = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (err) { ok = false; }
  if (!ok) { // older Safari / no secure context: the selection way
    try { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch (err) { ok = false; }
  }
  if (!b) return ok;
  if (ok) { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1400); }
  else setInfo("⚠ couldn't copy — select the text in the bubble instead");
  return ok;
}
export function cfgShowPane(name) { // one pane at a time; the choice is a device pref
  if (!CFG_PANES.includes(name)) name = "saving";
  for (const p of CFG_PANES) {
    document.getElementById("cfgpane-" + p).classList.toggle("on", p === name);
    document.getElementById("cfgtab-" + p).classList.toggle("on", p === name);
    document.getElementById("cfgtab-" + p).setAttribute("aria-selected", String(p === name));
  }
  try { localStorage.setItem("ff1roll-cfgpane", name); } catch (err) { /* private mode */ }
}
// Autosave: each field persists itself on change, so there is nothing to lose
// on Close/✕/backdrop/Esc and no Save to find (Josh, 2026-09-25). A blank
// token/key removes the stored one; blank locations fall back to defaults.
export function noteTapMovesCursor() { try { return localStorage.getItem("ff1roll-notetapcursor") === "1"; } catch (err) { return false; } }
// OFF by default (2026-09-30): Josh works with a stylus and pans with it —
// an instant grab turned a swipe that started on a note into a move. Back to
// last night's behaviour; the setting stays for anyone who wants it on.
export function penInstant() { try { return localStorage.getItem("ff1roll-peninstant") === "1"; } catch (err) { return false; } }
// Settings → Other → Text size (DAW review item 12, 2026-09-30): multiplies
// the root rem size (--userscale in the :root font-size calc, boot script
// applies it before first paint too). "1" (Default) is a no-op — same as
// never having set it.
export function textSizePref() { try { return localStorage.getItem("ff1roll-textsize") || "1"; } catch (err) { return "1"; } }
export function ghCheckOut(t) { const el = document.getElementById("ghcheckout"); if (el) aiSay(el, t); }
export async function ghCheck() {
  const repo = (document.getElementById("cfgsongsrepo").value.trim() || cfg().songsRepo);
  const token = document.getElementById("ghtoken").value.trim() || localStorage.getItem("ff1roll-ghtoken") || "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { ghCheckOut("⚠ the repo is owner/repo, like Night-Roll-App/night-roll"); return; }
  if (!token) { ghCheckOut("⚠ no token yet — make one (the button) and paste it"); return; }
  ghCheckOut("checking " + repo + "…");
  try {
    const r = await fetch("https://api.github.com/repos/" + repo, {headers: ghHeaders(token), cache: "no-store"});
    let j = null; try { j = await r.json(); } catch (err) { /* no body */ }
    ghCheckOut(ghCheckMessage(repo, r.status, j));
  } catch (err) { ghCheckOut("⚠ could not reach GitHub — offline?"); }
}

// Josh, 2026-09-29: done/cancelled jobs clear themselves a few seconds after they end; failed/interrupted stay until looked at
export function jobsAutoClear(id) {
  setTimeout(() => {
    const j = S.jobs.find(x => x.id === id);
    if (j && (j.state === "done" || j.state === "cancelled")) jobsDismiss(id);
  }, JOBS_AUTOCLEAR_MS);
}
// at boot too: a reply that landed while the app was closed lights ✦ without opening the sheet
export const CFG_PANES = ["saving", "ai", "github", "other"];
export function ghCheckMessage(repo, status, j) { // one line per outcome, the fix in the same line
  if (status === 200 && j && j.permissions && j.permissions.push) return "✓ connected — " + repo + ", the token can publish there";
  if (status === 200) return "⚠ the token can read " + repo + " but not write — its permission needs Contents: Read and write";
  if (status === 401) return "⚠ GitHub rejected the token — expired, or pasted with a stray character";
  if (status === 404) return "⚠ no access to " + repo + " — check the repo name, and that the token's repository access includes it";
  if (status === 403) return "⚠ GitHub said no (403) — rate limit or a token without access to " + repo;
  return "⚠ could not reach GitHub (" + status + ")";
}




// session-ephemeral: the winning take IS the notes
export function drKitCountT(t0, t1) { // counts only what the current parts scope would replace
  const pa = typeof drPartsGet === "function" && document.querySelector("#drparts button")
    ? drNormParts(drPartsGet()) : ["kick", "snare", "hats", "fills"];
  const all = ["kick", "snare", "hats", "fills"].every(g => pa.includes(g));
  const G = {kick: [36, 35], snare: [38, 40, 37], hats: [42, 44, 46]};
  const pcs = new Set(pa.filter(g => g !== "fills").flatMap(g => G[g]));
  const fillsOn = pa.includes("fills");
  const bt = barTicks();
  const bounds = drBoundaries(t0, t1);
  const fillBars = new Set([...bounds].map(b => b - 1));
  let k = 0;
  S.song.tracks.forEach((tr, ti) => { if (trackIsDrums(ti)) tr.notes.forEach(n => {
    if (n.gone || n.t < t0 || n.t >= t1) return;
    if (all || pcs.has(n.p) || (fillsOn && (fillBars.has(Math.floor(n.t / bt) + 1) || n.p === 49))) k++;
  }); });
  return k;
}
export function bsRange() {
  const t0 = dpTick("bsfrom", "bsfromq", "bsfroms");
  let t1 = dpTick("bsto", "bstoq", "bstos");
  if (t1 <= t0) t1 = t0 + barTicks();
  return {t0, t1, from: Math.floor(t0 / barTicks()) + 1, to: Math.ceil(t1 / barTicks())};
}
export function drRange() { // ticks + whole-bar span from the bar/beat/sub selects
  const t0 = dpTick("drfrom", "drfromq", "drfroms");
  let t1 = dpTick("drto", "drtoq", "drtos");
  if (t1 <= t0) t1 = t0 + barTicks();
  return {t0, t1, from: Math.floor(t0 / barTicks()) + 1, to: Math.ceil(t1 / barTicks())};
}
export function segSet(id, v) {
  for (const b of document.querySelectorAll("#" + id + " button")) b.classList.toggle("active", b.dataset.v === String(v));
}
export function drPartsGet() {
  return [...document.querySelectorAll("#drparts button.active")].map(b => b.dataset.part);
}
export function drPartsSet(arr) {
  const a = drNormParts(arr);
  for (const b of document.querySelectorAll("#drparts button")) b.classList.toggle("active", a.includes(b.dataset.part));
  drPartsSync();
}
export function drPartsSync() { // fills chip off = the fills knob is inert (scoped rolls skip fills)
  const on = drPartsGet().includes("fills");
  const row = document.getElementById("drfillsrow");
  row.style.opacity = on ? 1 : 0.35;
  row.style.pointerEvents = on ? "" : "none";
}

export function dpTick(barId, qId, sId) {
  const bar = Math.max(1, parseInt(document.getElementById(barId).value, 10) || 1);
  const q = (+document.getElementById(qId).value || 1) + (+document.getElementById(sId).value || 0);
  return (bar - 1) * barTicks() + (q - 1) * beatTicks();
}

// the systems list's order: console generations, the albums/ folder keys
export const INST_SYS_ORDER = ["nes", "game-boy", "snes", "n64", "ps1", "ps2"];
export function gameInstUsedBySong(inst, songTitle, path) { // usedIn holds song titles (2026-09-28 schema) — matched case-insensitively against the catalog title AND the file slug, since a song's display title and its capture slug can differ
  const usedIn = inst.usedIn;
  if (!usedIn || !usedIn.length) return false;
  const slug = String(path).split("/").pop().replace(/\.mid$/i, "");
  const set = new Set(usedIn.map(s => String(s).toLowerCase()));
  return set.has(String(songTitle).toLowerCase()) || set.has(slug.toLowerCase());
}
export async function gameSongRows(g, lib) { // [[songTitle, path]] of g.songs that have at least one used instrument, in album order
  return (g.songs || []).filter(([title, path]) => lib.instruments.some(i => i.used !== false && gameInstUsedBySong(i, title, path)));
}
// a song's own instruments, in the order of ITS tracks when the browsed song
// is the one actually open (so real track names/order are known) — matched
// by program number against the "ch N prog M[,M…]" fallback name a PS1/N64
// capture gives an unnamed channel (tools/psx/notes.mjs, tools/n64/notes.mjs);
// a Josh-renamed track, or the song not being the open one, falls back to
// just the instrument name, alphabetical (natural sort, usedInstruments' rule)
export function songInstrumentRows(lib, songTitle, path) {
  const matched = lib.instruments.filter(i => i.used !== false && gameInstUsedBySong(i, songTitle, path));
  const kitTag = i => i.kind === "drum-kit" ? "  · kit" : "";
  const isOpen = S.song && path === S.songKey;
  const byTrack = [], leftover = new Set(matched);
  if (isOpen) {
    S.song.tracks.forEach(tr => {
      const m = /prog\s+([\d,]+)/i.exec(tr.name || "");
      if (!m) return;
      const progs = m[1].split(",").map(Number);
      // a SNES instrument (id "spc:<hash8>:drum|inst") has no program number at all —
      // .includes(null) is already false, so it just falls to the alphabetical
      // "leftover" bucket below, same as an instrument no track-name regex matched
      const inst = matched.find(i => leftover.has(i) && i.program != null && progs.includes(i.program));
      if (inst) { leftover.delete(inst); byTrack.push({inst, label: tr.name + " · " + (inst.nameGuess || inst.id) + kitTag(inst)}); }
    });
  }
  const rest = [...leftover].sort((a, b) => (a.nameGuess || a.id).localeCompare(b.nameGuess || b.id, undefined, {numeric: true, sensitivity: "base"}))
    .map(inst => ({inst, label: (inst.nameGuess || inst.id) + kitTag(inst)}));
  return [...byTrack, ...rest];
}
export async function currentSongGameContext() { // {g, songTitle, path} when the open song is a published game song with a library, else null — the "Instruments in this song" shortcut
  if (!S.songKey) return null;
  const entry = Object.entries(S.CATALOG).find(([, songs]) => songs.some(([, p]) => p === S.songKey));
  if (!entry) return null;
  const row = entry[1].find(([, p]) => p === S.songKey);
  if (!row) return null;
  const meta = await albumMetaFor(S.songKey).catch(() => null);
  const vault = meta && meta.nsf && meta.nsf.vault;
  if (!vault) return null;
  const games = await instAlbums();
  const g = games.find(x => x.vault === vault);
  return g ? {g, songTitle: row[0], path: S.songKey} : null;
}
export function instKeys(inst) { // what a tap plays: a kit's first slots; a melodic instrument's root, fifth, octave around the keys its songs used
  if (inst.kind === "drum-kit") return inst.keyRegions.filter(r => r.sample).slice(0, 4).map(r => r.keyLo);
  const k = inst.keysPlayed && inst.keysPlayed.median != null ? Math.round(inst.keysPlayed.median) : 60;
  return [k, k + 7, k + 12];
}
// the on-device index of known soundfonts (name + slug only — the bytes live in
// IndexedDB/the repo, never here): what the voice menu's "Soundfonts ›" top level
// lists without opening IndexedDB just to read a title. A device that has never
// imported or played a given font simply doesn't list it yet — same scope as the
// game-instrument picker, which only ever lists PUBLISHED albums, not every game
// that might exist somewhere.
export function sf2Registry() { try { return JSON.parse(localStorage.getItem("ff1roll-sf2-index") || "[]"); } catch (err) { return []; } }
export function sf2RegistryAdd(slug, name) {
  const reg = sf2Registry().filter(f => f.slug !== slug);
  reg.push({slug, name});
  reg.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: "base"}));
  try { localStorage.setItem("ff1roll-sf2-index", JSON.stringify(reg)); } catch (err) { /* best-effort */ }
}
export async function instAudition(vault, lib, inst) {
  ensureAudio(); await resumeAudio(); openMaster();
  const P = await instPlayer();
  const keys = instKeys(inst);
  const regions = keys.map(k => P.regionFor(inst, k, 100)).filter(Boolean);
  const samples = await instSamples(vault, lib, [...new Set(regions.map(r => r.sample))]);
  let t = S.audio.currentTime + 0.05;
  for (const key of keys) {
    const pcm = P.playNote(inst, samples, {key, vel: 100, hold: 0.3, sampleRate: S.audio.sampleRate, tail: 1.5});
    if (!pcm.length) continue;
    let peak = 0; for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    if (peak > 0.9) for (let i = 0; i < pcm.length; i++) pcm[i] *= 0.9 / peak; // a driver's own scale can run hot; an audition never clips
    const buf = S.audio.createBuffer(1, pcm.length, S.audio.sampleRate);
    buf.copyToChannel(pcm, 0);
    const src = S.audio.createBufferSource(); src.buffer = buf; src.connect(previewOut("audition")); src.start(t);
    t += 0.38;
  }
}
export function usedInstruments(lib) { // a library's used instruments, alphabetical by name, natural sort (Josh, 2026-09-28: "this is just a giant list" — FF7's, most-used-first, read like noise); shared by the games browser and the voice & color menu's Game instruments picker
  return lib.instruments.filter(i => i.used !== false)
    .sort((a, b) => (a.nameGuess || a.id).localeCompare(b.nameGuess || b.id, undefined, {numeric: true, sensitivity: "base"}));
}
export function usedInstrumentRows(lib) { // usedInstruments() + the "in N songs" a leaf list shows — the "All instruments (A–Z)" level
  return usedInstruments(lib).map(inst => {
    const n = (inst.usedIn || []).length;
    return {inst, label: (inst.nameGuess || inst.id) + (inst.kind === "drum-kit" ? "  · kit" : "") + "  · in " + n + " song" + (n === 1 ? "" : "s")};
  });
}
// ONE navigation for both File → 🎛 Instruments… and the voice & color menu's
// Game instruments picker (Josh, 2026-09-28: "a single navigation helper …
// parameterised by what a tap on an instrument does"): games (+ an
// "Instruments in this song ›" shortcut for the open song) → a game's "All
// instruments (A–Z)" or one of its own songs → a leaf list. `nav` ({game,
// sub} — null/null at the top; sub is null, "all", or {title, path}) is the
// CALLER's own state, so each keeps its own back-out point and can reopen
// anywhere; `opts` says how a caller draws a row and what a leaf tap does.
export async function renderGameInstNav(container, nav, opts) {
  // opts: rowFactory(label, onClick, dim) -> element; instrumentLabel(label, inst, g) -> label;
  // onInstrument(g, lib, inst, label); onNavigate() (redraw after nav changes); isCurrent()
  // (a stale async fill from a nav the caller already left must not append); gamesListLabel
  // (the level-2 back button's text for the games list); backLabelAtTop/onBackAtTop (the
  // picker's only: a back row that leaves this nav for its own family list)
  const go = () => { const p = opts.onNavigate(); if (p && p.catch) p.catch(e => setInfo("⚠ " + e.message)); };
  if (!nav.game) { // level 1: which game (+ the open song's own shortcut, first)
    if (opts.backLabelAtTop) container.appendChild(opts.rowFactory("‹ " + opts.backLabelAtTop, opts.onBackAtTop, true));
    const loading = opts.rowFactory("loading games…", () => {}, true);
    container.appendChild(loading);
    const ctx = await currentSongGameContext();
    const games = await instAlbums();
    if (!opts.isCurrent()) return;
    loading.remove();
    if (!games.length) { container.appendChild(opts.rowFactory("No published game has instruments yet.", () => {}, true)); return; }
    if (!nav.sys) { // level 0: which system (Josh: organized "by game system … like the rest of the folders")
      if (ctx) container.appendChild(opts.rowFactory("Instruments in this song ›",
        () => { nav.sys = ctx.g.sys; nav.game = ctx.g; nav.sub = {title: ctx.songTitle, path: ctx.path}; go(); }));
      const present = [...new Set(games.map(g => g.sys))].sort((a, b) => (INST_SYS_ORDER.indexOf(a) + 1 || 99) - (INST_SYS_ORDER.indexOf(b) + 1 || 99));
      for (const sys of present) container.appendChild(opts.rowFactory((FOLDER_NAMES[sys] || sys) + " ›", () => { nav.sys = sys; go(); }));
      return;
    }
    container.appendChild(opts.rowFactory("‹ All systems", () => { nav.sys = null; go(); }, true));
    for (const g of games.filter(x => x.sys === nav.sys)) container.appendChild(opts.rowFactory(g.title + " ›", () => { nav.game = g; nav.sub = null; go(); }));
    return;
  }
  const g = nav.game;
  container.appendChild(opts.rowFactory("‹ " + (nav.sub ? g.title : opts.gamesListLabel),
    () => { if (nav.sub) nav.sub = null; else nav.game = null; go(); }, true));
  if (!nav.sub) { // level 2: this game — All instruments (A–Z), or one of its songs
    const loading = opts.rowFactory("loading " + g.title + "…", () => {}, true);
    container.appendChild(loading);
    const lib = await instLibrary(g.vault);
    if (!opts.isCurrent()) return;
    const songs = await gameSongRows(g, lib);
    if (!opts.isCurrent()) return;
    loading.remove();
    container.appendChild(opts.rowFactory("All instruments (A–Z) ›", () => { nav.sub = "all"; go(); }));
    for (const [title, path] of songs) container.appendChild(opts.rowFactory(title + " ›", () => { nav.sub = {title, path}; go(); }));
    return;
  }
  // level 3: a leaf instrument list — either the flat A–Z list, or one song's own instruments
  const loading = opts.rowFactory("loading instruments…", () => {}, true);
  container.appendChild(loading);
  const lib = await instLibrary(g.vault);
  if (!opts.isCurrent()) return;
  loading.remove();
  const list = nav.sub === "all" ? usedInstrumentRows(lib) : songInstrumentRows(lib, nav.sub.title, nav.sub.path);
  if (!list.length) {
    container.appendChild(opts.rowFactory(nav.sub === "all" ? "No used instruments in " + g.title + "." : "No used instruments found for " + nav.sub.title + ".", () => {}, true));
    return;
  }
  for (const {inst, label} of list) container.appendChild(opts.rowFactory(opts.instrumentLabel(label, inst, g), () => opts.onInstrument(g, lib, inst, label), false));
}
export async function renderInstSheet() { // returns once drawn (tests can await it); the fileinst click below doesn't need to
  const rows = document.getElementById("instrows"); rows.innerHTML = "";
  document.getElementById("instsheettitle").textContent = !S.instNav.game ? "INSTRUMENTS"
    : !S.instNav.sub ? S.instNav.game.title.toUpperCase()
    : S.instNav.sub === "all" ? S.instNav.game.title.toUpperCase() + " — ALL INSTRUMENTS"
    : S.instNav.sub.title.toUpperCase();
  const token = ++S.instNavToken;
  try {
    await renderGameInstNav(rows, S.instNav, {
      rowFactory: (label, onClick, dim) => songRow(label, onClick, dim),
      instrumentLabel: label => "▶ " + label,
      gamesListLabel: "All games",
      onInstrument: (g, lib, inst) => instAudition(g.vault, lib, inst).catch(e => setInfo("⚠ " + e.message)),
      onNavigate: () => renderInstSheet(),
      isCurrent: () => S.instNavToken === token,
    });
  } catch (e) { setInfo("⚠ " + e.message); }
}

export function openBassist() {
  if (!editableSong()) { setInfo("the Bassist works on your own songs — captures are locked"); return; }
  bsBuildControls();
  const bt = barTicks();
  { // follow: drums / tracks / chords; target: melodic tracks + new
    const f = document.getElementById("bsfollow");
    f.innerHTML = "";
    const addOpt = (sel, v, label) => { const o = document.createElement("option"); o.value = v; o.textContent = label; sel.appendChild(o); };
    if (S.song.tracks.some((_, ti) => trackIsDrums(ti))) addOpt(f, "drums", "drums (kick)");
    S.song.tracks.forEach((tr2, ti) => { if (!trackIsDrums(ti)) addOpt(f, "t" + ti, tr2.name || "track " + (ti + 1)); });
    addOpt(f, "chords", "chords");
    f.value = S.song.tracks.some((_, ti) => trackIsDrums(ti)) ? "drums" : "chords";
    const tsel = document.getElementById("bstarget");
    tsel.innerHTML = "";
    S.song.tracks.forEach((tr2, ti) => { if (!trackIsDrums(ti)) addOpt(tsel, String(ti), tr2.name || "track " + (ti + 1)); });
    addOpt(tsel, "new", "＋ new bass track");
    const bi = drBassTrack();
    const r0 = (() => { const sec = visibleNotes().find(n => n.section && n.start <= S.playCursor && (n.end || n.start + bt) > S.playCursor); return sec; })();
    // never default onto a track with notes in range: new track wins then
    tsel.value = "new";
    if (bi >= 0) {
      const t0g = r0 ? r0.start : 0, t1g = r0 ? (r0.end || t0g + bt) : S.songEndTick;
      const has = S.song.tracks[bi].notes.some(n => !n.gone && n.t < t1g && n.t + n.d > t0g);
      if (!has) tsel.value = String(bi);
    }
  }
  const sec = visibleNotes().find(n => n.section && n.start <= S.playCursor && (n.end || n.start + bt) > S.playCursor);
  let from = 1, to = Math.max(1, Math.ceil(S.songEndTick / bt)), q0 = 1, q1 = 1, toBar = to + 1;
  if (S.rangeSel && S.rangeSel.b > S.rangeSel.a) {
    from = Math.floor(S.rangeSel.a / bt) + 1; q0 = snapBeat((S.rangeSel.a % bt) / beatTicks() + 1);
    toBar = Math.floor(S.rangeSel.b / bt) + 1; q1 = snapBeat((S.rangeSel.b % bt) / beatTicks() + 1);
  } else if (sec) {
    from = Math.floor(sec.start / bt) + 1; q0 = snapBeat((sec.start % bt) / beatTicks() + 1);
    const e = sec.end || sec.start + bt;
    toBar = Math.floor(e / bt) + 1; q1 = snapBeat((e % bt) / beatTicks() + 1);
  }
  document.getElementById("bsfrom").value = from;
  document.getElementById("bsto").value = toBar;
  setBeatPair("bsfromq", "bsfroms", q0);
  setBeatPair("bstoq", "bstos", q1);
  bsRefresh();
  document.getElementById("bassistsheet").classList.add("on");
}
export function openDrummer() {
  if (!editableSong()) { setInfo("the Drummer works on your own songs — captures are locked"); return; }
  drBuildControls();
  const bt = barTicks();
  { // follow picker: every melodic track BY NAME (Josh: "no way to tell it what
    // instrument to follow"), then chords / off; default = the detected bass
    const fsel = document.getElementById("drfollow");
    const keep = fsel.value;
    fsel.innerHTML = "";
    S.song.tracks.forEach((tr2, ti) => {
      if (trackIsDrums(ti)) return;
      const o = document.createElement("option");
      o.value = "t" + ti;
      o.textContent = tr2.name || "track " + (ti + 1);
      fsel.appendChild(o);
    });
    for (const [v, label] of [["chords", "chords"], ["off", "off"]]) {
      const o = document.createElement("option");
      o.value = v; o.textContent = label;
      fsel.appendChild(o);
    }
    fsel.value = [...fsel.options].some(o => o.value === keep) ? keep : "t" + Math.max(0, drBassTrack());
  }
  const beats = effTs()[0]; // beat + subdivision selects, drum-fill convention
  for (const id of ["drfromq", "drtoq"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (let b = 1; b <= beats; b++) {
      const o = document.createElement("option");
      o.value = String(b); o.textContent = String(b);
      sel.appendChild(o);
    }
  }
  for (const id of ["drfroms", "drtos"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (const [f, syl] of [[0, "·"], [0.25, "e"], [0.5, "&"], [0.75, "a"]]) {
      const o = document.createElement("option");
      o.value = String(f); o.textContent = syl;
      sel.appendChild(o);
    }
  }
  // default range: the section under the cursor; else the loop body; else the whole song
  const sec = visibleNotes().find(n => n.section && n.start <= S.playCursor && (n.end || n.start + bt) > S.playCursor);
  const loop = S.rollnotes.find(n => n.loopTo !== undefined);
  let from = 1, to = Math.max(1, Math.ceil(S.songEndTick / bt));
  let q0 = 1, q1 = 1, toBar;
  if (S.rangeSel && S.rangeSel.b > S.rangeSel.a) { // an armed ruler selection wins outright
    from = Math.floor(S.rangeSel.a / bt) + 1;
    q0 = snapBeat((S.rangeSel.a % bt) / beatTicks() + 1);
    toBar = Math.floor(S.rangeSel.b / bt) + 1;
    q1 = snapBeat((S.rangeSel.b % bt) / beatTicks() + 1);
  } else if (sec) { // the section's exact edges, beats included (to = exclusive end)
    from = Math.floor(sec.start / bt) + 1;
    q0 = snapBeat((sec.start % bt) / beatTicks() + 1);
    const e = sec.end || sec.start + bt;
    toBar = Math.floor(e / bt) + 1;
    q1 = snapBeat((e % bt) / beatTicks() + 1);
  } else if (loop) {
    from = Math.floor(loop.loopTo / bt) + 1;
    q0 = snapBeat((loop.loopTo % bt) / beatTicks() + 1);
    toBar = to + 1; // whole rest of the song, exclusive end on the bar after
  } else toBar = to + 1;
  document.getElementById("drfrom").value = from;
  document.getElementById("drto").value = toBar;
  setBeatPair("drfromq", "drfroms", q0);
  setBeatPair("drtoq", "drtos", q1);
  drRefresh();
  document.getElementById("drummersheet").classList.add("on");
}
export function bsBuildControls() {
  if (document.querySelector("#bsstyle button")) return;
  const mkSeg = (id, vals, def) => {
    const el = document.getElementById(id);
    vals.forEach(v => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = String(v);
      b.textContent = String(v);
      b.addEventListener("click", () => { segSet(id, v); bsRefresh(); });
      el.appendChild(b);
    });
    segSet(id, def);
  };
  mkSeg("bsstyle", ["chug", "pump", "arp", "walk", "riff"],
        S.song && S.song.tracks.some((_, ti) => trackIsDrums(ti)) ? "riff" : "chug");
  mkSeg("bsbusy", [1, 2, 3, 4, 5], 3);
  mkSeg("bsoct", [1, 2, 3], 2);
  const beats = effTs()[0];
  for (const id of ["bsfromq", "bstoq"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (let b = 1; b <= beats; b++) { const o = document.createElement("option"); o.value = String(b); o.textContent = String(b); sel.appendChild(o); }
  }
  for (const id of ["bsfroms", "bstos"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (const [f, syl] of [[0, "·"], [0.25, "e"], [0.5, "&"], [0.75, "a"]]) { const o = document.createElement("option"); o.value = String(f); o.textContent = syl; sel.appendChild(o); }
  }
}
export function bsRefresh() {
  const r = bsRange();
  const tgt = document.getElementById("bstarget").value;
  const ti = tgt === "new" ? -1 : parseInt(tgt, 10);
  let replaces = 0;
  if (ti >= 0 && S.song.tracks[ti]) S.song.tracks[ti].notes.forEach(n => { if (!n.gone && n.t >= r.t0 && n.t < r.t1) replaces++; });
  const chordBars = new Set(bsChordTimeline(r.t0, r.t1).filter(e => !e.lookahead)
    .flatMap(e => { const out = []; for (let b = Math.floor(Math.max(e.t, r.t0) / barTicks()); b < Math.ceil(Math.min(e.end, r.t1) / barTicks()); b++) out.push(b); return out; })).size;
  const totBars = r.to - r.from + 1;
  document.getElementById("bsstatus").textContent =
    "replaces " + replaces + " note(s) on " + (ti >= 0 && S.song.tracks[ti] ? (S.song.tracks[ti].name || "track " + (ti + 1)) : "a new bass track") +
    " · chords cover " + Math.min(chordBars, totBars) + " of " + totBars + " bar" + (totBars === 1 ? "" : "s") +
    (chordBars === 0 ? " (will sketch harmony from your melody)" : "");
  const row = document.getElementById("bstakes");
  row.innerHTML = "";
  S.bsTakes.forEach((tk, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "take " + (i + 1) + " · " + tk.style + " " + tk.busy + " · oct" + tk.oct;
    b.classList.toggle("active", i === S.bsActive);
    b.addEventListener("click", () => {
      segSet("bsstyle", tk.style); segSet("bsbusy", tk.busy); segSet("bsoct", tk.oct);
      document.getElementById("bsfollow").value = tk.followSel;
      document.getElementById("bstarget").value = String(tk.targetTi);
      document.getElementById("bsfrom").value = tk.from; document.getElementById("bsto").value = tk.to;
      if (tk.q) { setBeatPair("bsfromq", "bsfroms", tk.q[0]); setBeatPair("bstoq", "bstos", tk.q[1]); }
      const k = bsGenerate(tk.seed, tk.opts);
      S.bsActive = i;
      bsRefresh();
      setInfo("take " + (i + 1) + " — " + tk.style + " · " + k + " notes (one undo brings the previous back)");
    });
    row.appendChild(b);
  });
}
export function drRefresh() {
  const r = drRange();
  const from = r.from, to = r.to;
  const mode = (document.getElementById("drfollow") || {}).value || "bass";
  let followTxt;
  if (mode === "off") followTxt = "following: nothing";
  else if (mode === "chords") {
    const n = visibleNotes().filter(x => x.chord && !x.section && x.start >= r.t0 && x.start < r.t1).length; // visibleNotes: Learning hides ✦ AI estimates
    followTxt = "following: chords (" + n + " change" + (n === 1 ? "" : "s") + " in range)";
  } else {
    const ti = mode.startsWith("t") ? parseInt(mode.slice(1), 10) : drBassTrack();
    followTxt = ti >= 0 && S.song.tracks[ti] ? "following: " + (S.song.tracks[ti].name || "track " + (ti + 1)) : "no track to follow";
  }
  const nb = drBoundaries(r.t0, r.t1).size;
  const fillsPicked = !document.querySelector("#drparts button") || drPartsGet().includes("fills");
  document.getElementById("drstatus").textContent =
    "replaces " + drKitCountT(r.t0, r.t1) + " kit note(s) in " + fmtBarBeat(r.t0) + "–" + fmtBarBeat(r.t1) + " · " + followTxt +
    (fillsPicked ? " · " + nb + " fill spot" + (nb === 1 ? "" : "s") : "");
  const row = document.getElementById("drtakes");
  row.innerHTML = "";
  S.drTakes.forEach((tk, i) => {
    const b = document.createElement("button");
    b.type = "button";
    const pa = drNormParts(tk.parts ?? "all");
    const scoped = !["kick", "snare", "hats", "fills"].every(g => pa.includes(g));
    b.textContent = "take " + (i + 1) + " · " + (tk.busy ?? tk.energy ?? 3) + "/" + (tk.hard ?? tk.busy ?? 3) + "/" + (tk.fillAmt ?? 3) +
      ((tk.feel ?? "normal") === "half" ? " ½" : (tk.feel ?? "normal") === "double" ? " 2×" : "") +
      (scoped ? " " + pa.map(g => g[0].toUpperCase()).join("+") : "");
    b.classList.toggle("active", i === S.drActive);
    b.addEventListener("click", () => { // a take is the FULL tuple, not just the seed
      const busy = tk.busy ?? tk.energy ?? 3, hard = tk.hard ?? busy;
      const follow = tk.follow ?? "bass", feel = tk.feel ?? "normal", fillAmt = tk.fillAmt ?? 3;
      drPartsSet(tk.parts ?? "all");
      segSet("drbusy", busy);
      segSet("drhard", hard);
      segSet("drfills", fillAmt);
      document.getElementById("drfollow").value = tk.followTis ? "t" + tk.followTis[0] : tk.followTi !== undefined ? "t" + tk.followTi : follow; // an Ask take may follow several tracks: the picker shows the first
      segSet("drfeel", feel);
      document.getElementById("drfrom").value = tk.from;
      document.getElementById("drto").value = tk.to;
      if (tk.q) { setBeatPair("drfromq", "drfroms", tk.q[0]); setBeatPair("drtoq", "drtos", tk.q[1]); }
      const k = drGenerate(tk.seed, {busy, hard, follow, feel, fillAmt, parts: tk.parts ?? "all", followTi: tk.followTi, followTis: tk.followTis,
        fromBar: tk.fromBar ?? tk.from, toBar: tk.toBar ?? tk.to, t0: tk.t0, t1: tk.t1});
      S.drActive = i;
      drRefresh();
      setInfo("take " + (i + 1) + " — busy " + busy + " · hard " + hard + " · fills " + fillAmt +
              " · " + follow + " · " + feel + " · " + k + " hits (one undo brings the previous back)");
    });
    row.appendChild(b);
  });
}
export function drBuildControls() {
  if (document.querySelector("#drbusy button")) return;
  const mkSeg = (id, vals, def, labels) => {
    const el = document.getElementById(id);
    vals.forEach((v, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.v = String(v);
      b.textContent = labels ? labels[i] : String(v);
      b.addEventListener("click", () => { segSet(id, v); drRefresh(); });
      el.appendChild(b);
    });
    segSet(id, def);
  };
  mkSeg("drbusy", [1, 2, 3, 4, 5], 3);
  mkSeg("drhard", [1, 2, 3, 4, 5], 3);
  mkSeg("drfills", [0, 1, 2, 3, 4, 5], 3, ["off", "1", "2", "3", "4", "5"]);
  mkSeg("drfeel", ["normal", "half", "double"], "normal");
  const pr = document.getElementById("drparts");
  for (const part of ["kick", "snare", "hats", "fills"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.part = part;
    b.textContent = part;
    b.classList.add("active");
    b.addEventListener("click", () => { b.classList.toggle("active"); drPartsSync(); drRefresh(); });
    pr.appendChild(b);
  }
}

export function jobsLoad() { // boot: what was running when the page last died is "interrupted", with its last counts
  try { S.jobs = JSON.parse(localStorage.getItem("ff1roll-jobs") || "[]"); } catch (err) { S.jobs = []; }
  if (!Array.isArray(S.jobs)) S.jobs = [];
  let hit = null;
  for (const j of S.jobs) if (j.state === "running" || j.state === "queued") {
    j.state = "interrupted"; j.ended = Date.now(); hit = j;
    for (const it of j.items || []) if (it.st === "running") it.st = "interrupted";
  }
  jobsSave(true);
  updateJobsBtn();
  return hit;
}
export function jobStart(kind, title, items, runner, extra) { // runner(api) is async; api.aborted flips on ✕
  const job = Object.assign({id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, title, state: "running",
    items: items.map(it => ({label: it.label, st: "queued", pct: 0, msg: "", key: it.key || null})),
    note: "", started: Date.now(), ended: 0, err: ""}, extra || {});
  S.jobs.push(job);
  jobsSave(true); jobsNotify();
  const api = jobApi(job);
  Promise.resolve().then(() => runner(api)).then(() => { if (job.state === "running") api.done(); }, err => api.fail(err));
  return job;
}
export function jobsClearFinished() { S.jobs = S.jobs.filter(j => j.state === "running" || j.state === "queued"); jobsSave(true); jobsNotify(); }

export function openSyncSheet() { // callable even with no song loaded (bad-config recovery)
  S.syncReturnToList = false; // notelistSync sets it true right after this runs
  if (S.song) renderSyncPending();
  fingerprintOldDrafts().catch(() => {});
  const comp = !!S.song && isComposition();
  document.getElementById("ghsave").textContent = "⇪ Publish song"; // edits already live on the device; this is the deliberate step that puts a song where others can reach it (Josh, 2026-09-26) — one word for what it ships, in folder mode too (Model B, 2026-09-29): Save is Save Version now, never Publish's word
  document.getElementById("repolink").href = "https://github.com/" + cfg().songsRepo;
  // the status line starts empty (Josh, 2026-09-25: the buttons are clear on
  // their own) and speaks only for progress, results, or a missing prerequisite
  document.getElementById("syncstatus").textContent = !S.song
    ? "No song loaded — if the catalog failed, check File → Settings, then reload."
    : !S.songKey
    ? "Local file — Copy/Download only (no repo path to commit to)."
    : LINK_SONGS
    ? "You're viewing " + linkRepoLabel(LINK_SONGS) + "'s songs from a link — read-only here. Share link copies this song's link."
    : !writeToken()
    ? "Connect GitHub first: File → Settings… → GITHUB (your repo, then a token) — Publish sends songs there."
    : isUnsaved(S.songKey) // lotion, 2026-10-03: say so before he taps — Publish used to look like it shipped the song and only sent the annotations
    ? "This song has no folder yet — Publish will ask for a name and folder first."
    : "";
  document.getElementById("ghsave").disabled = !!LINK_SONGS;
  if (LINK_SONGS) document.getElementById("ghsaveall").style.display = "none";
  syncsheet.classList.add("on");
}
export function renderSyncPending() {
  updateSyncBtn(); // the count follows the list it is drawn from (Josh: "it doesn't update that number")
  const box = document.getElementById("syncpending");
  box.textContent = "";
  const line = (parent, text, cls) => {
    const row = document.createElement("div");
    row.className = "pline" + (cls ? " " + cls : "");
    const span = document.createElement("span");
    span.textContent = text;
    row.appendChild(span);
    parent.appendChild(row);
    return row;
  };
  // the list shrinks when the check below finishes: say so, or it reads as a
  // glitch ("it said five, then boom, two" — Josh, 2026-09-29)
  if (S.pubCheckRunning) line(box, "checking each song against its published copy…", "pempty");
  const songs = pendingSongs(), chats = pendingChats();
  for (const key of songs) {
    const block = document.createElement("div");
    block.className = "psong" + (key === S.songKey ? " open" : "");
    const title = document.createElement("div");
    title.className = "ptitle";
    const tspan = document.createElement("span");
    tspan.textContent = songTitleOf(key) + (key === S.songKey ? " · open" : "");
    title.appendChild(tspan);
    // every row: Open / Publish / Revert (Josh, 2026-09-29) — the same three
    // on every song, not Open only when a draft happened to exist
    if (key !== S.songKey) {
      const o = document.createElement("button");
      o.textContent = "Open";
      o.title = "Open this song here";
      o.addEventListener("click", () => {
        (localStorage.getItem(draftStoreKey(key)) !== null ? openDraft(key) : loadSong(key)).then(openSyncSheet);
      });
      title.appendChild(o);
    }
    const pb = document.createElement("button");
    pb.textContent = "Publish";
    pb.title = "Publish this song only (a job — ⏳ shows it)";
    pb.addEventListener("click", () => {
      const status = document.getElementById("syncstatus");
      if (!takeToken(status)) return; // same gate as Publish all
      const job = publishAllJobStart(t => { status.textContent = t; }, [key]);
      if (!job) return;
      openPubJobSheet(job); // over the Publish window, which stays until the outcome
      pubJobOneMotion(job);
    });
    title.appendChild(pb);
    if (draftDirtyState(key) !== "never") { // a never-published song has no repo copy: Revert would delete it
      const rb = document.createElement("button");
      rb.textContent = "Revert";
      rb.title = "Drop this device's changes to this song; the published copy becomes what you see";
      rb.addEventListener("click", () => revertSongToRepo(key));
      title.appendChild(rb);
    }
    block.appendChild(title);
    const music = draftDirtyState(key);
    if (music) {
      const row = line(block, "♪ music " + (music === "never" ? "never published" : "edited since publish") + (pubCheck.get(key) ? " — " + pubCheck.get(key) : ""));
      if (key === S.songKey && music === "edited") { // what changed? the roll shows it (View → Compare with repo)
        const b = document.createElement("button");
        b.textContent = "Compare";
        b.title = "Outline every note that differs from the published copy on the roll";
        b.style.marginLeft = "auto";
        b.addEventListener("click", () => { syncsheet.classList.remove("on"); cmpEnter(); });
        row.appendChild(b);
      }
    }
    let notes = [];
    try { notes = JSON.parse(localStorage.getItem("ff1roll-notes-" + key) || "[]"); } catch (err) { notes = []; }
    if (notes.length) {
      line(block, "✎ " + notes.length + " annotation" + (notes.length === 1 ? "" : "s") + " unsynced");
      notes.forEach((n, i) => {
        const at = "[" + n.b1 + "." + n.q1 + (n.b2 ? " - " + n.b2 + "." + (n.q2 || "") : "") + "]";
        const text = n.text.length > 60 ? n.text.slice(0, 57) + "…" : n.text;
        // loop:/key: texts already carry their prefix; only label the others
        const row = line(block, at + " " + (n.section ? "section: " : "") + text, "note");
        const x = document.createElement("button");
        x.textContent = "✕";
        x.title = "Discard this note (this device only — it was never synced)";
        x.addEventListener("click", () => discardPending(key, i));
        row.prepend(x);
      });
    }
    const chat = askUnsavedCount("ff1roll-ask-" + key);
    if (chat) line(block, "✦ " + chat + " chat message" + (chat === 1 ? "" : "s") + " unsaved — ships with the song");
    box.appendChild(block);
  }
  if (chats.length) box.appendChild(renderSyncChats(chats, line));
  if (!box.children.length) {
    const e = document.createElement("div");
    e.className = "pempty";
    e.textContent = "Nothing pending on this device.";
    box.appendChild(e);
  }
  const all = document.getElementById("ghsaveall");
  const n = songs.length;
  all.textContent = "Publish all (" + n + ")";
  all.title = "Publish every pending song (a job — Jobs shows it). Songs only — chats have their own button under Chats";
  all.style.display = n > 1 ? "" : "none";
}
// The Chats section (Terminal #111, 2026-10-04): the general and terminal
// chats and any chat-only song, after the songs and folded by default — Josh
// opens Publish for songs; the chats are there when he wants them. The fold
// is a device-local UI pref (which songs/chats are pending is never stored).
export const PUBCHATS_OPEN_KEY = "ff1roll-pubchats-open";
export function pubChatsOpen() { try { return localStorage.getItem(PUBCHATS_OPEN_KEY) === "1"; } catch (err) { return false; } }
export function renderSyncChats(chats, line) {
  const open = pubChatsOpen();
  const sec = document.createElement("div");
  sec.className = "pchats" + (open ? " open" : "");
  const head = document.createElement("div");
  head.className = "ptitle";
  const tog = document.createElement("button");
  tog.className = "pchatstoggle";
  tog.textContent = (open ? "▾" : "▸") + " Chats (" + chats.length + ")";
  tog.setAttribute("aria-expanded", open ? "true" : "false");
  tog.title = open ? "Fold the chats away" : "Show the chats with unsaved messages";
  tog.addEventListener("click", () => {
    try { if (open) localStorage.removeItem(PUBCHATS_OPEN_KEY); else localStorage.setItem(PUBCHATS_OPEN_KEY, "1"); } catch (err) { /* private mode: the fold just won't stick */ }
    renderSyncPending();
  });
  head.appendChild(tog);
  if (chats.length > 1) { // one tap for all of them — the chats' own Publish all; the footer's covers songs only
    const pc = document.createElement("button");
    pc.textContent = "Publish chats (" + chats.length + ")";
    pc.title = "Append every unsaved chat to its log (a job — Jobs shows it); Publish all covers songs only";
    pc.addEventListener("click", () => {
      const status = document.getElementById("syncstatus");
      if (!takeToken(status)) return;
      const job = publishAllJobStart(t => { status.textContent = t; }, chats);
      if (!job) return;
      syncSheetRelease();
      openPubJobSheet(job);
    });
    head.appendChild(pc);
  }
  sec.appendChild(head);
  if (!open) return sec;
  for (const key of chats) {
    const chatKey = "ff1roll-ask-" + key, chatName = pendingChatLabel(key);
    const block = document.createElement("div");
    block.className = "psong pchat";
    const title = document.createElement("div");
    title.className = "ptitle";
    const tspan = document.createElement("span"); tspan.textContent = (key === "terminal" ? "⌨ " : "✦ ") + chatName;
    const b = document.createElement("button");
    b.textContent = "Publish chat";
    b.title = "Append the unsaved " + chatName.toLowerCase() + " to " + askLogPath(chatKey);
    b.addEventListener("click", async () => {
      const status = document.getElementById("syncstatus");
      const token = folderActive() ? "folder" : takeToken(status);
      if (!token) return;
      b.disabled = true; status.textContent = "Publishing the " + chatName.toLowerCase() + "…";
      try { await askCommitLog(folderActive() ? null : ghHeaders(token), chatKey); status.textContent = chatName + " published ✓"; }
      catch (err) { status.textContent = "⚠ " + chatName.toLowerCase() + ": " + err.message; }
      b.disabled = false; updateSyncBtn(); renderSyncPending();
    });
    title.append(tspan, b);
    block.appendChild(title);
    const n = askUnsavedCount(chatKey);
    line(block, "✦ " + n + " chat message" + (n === 1 ? "" : "s") + " unsaved");
    sec.appendChild(block);
  }
  return sec;
}
// A publish started from the Publish window: floating, it closes and the job
// dialog takes over (as before); docked, it stays — closing a docked window
// collapses its dock mid-job, and the list re-renders as the job runs.
export function syncSheetRelease() { if (!wmWhereIs(S.wm, "syncsheet")) syncsheet.classList.remove("on"); }
// One song, one motion (Josh, Terminal #112): a one-song job does not release
// the Publish window at launch — the dialog opens over it — and when the job
// is DONE both go: the dialog, and the window through syncSheetRelease (a
// floating window was a step; a docked one is a place and stays, its list
// already re-rendered without the song). The status line keeps the outcome,
// since the window's own #syncstatus goes with it. Failed, both stay: the
// error is in the dialog, Retry beside Close. Publish all / Publish chats
// keep today's shape — several outcomes to read.
export function pubJobOneMotion(job) {
  const off = jobsOnChange(() => {
    if (job.state === "running" || job.state === "queued") return;
    off();
    if (job.state !== "done") return;
    if (S.pubJobShown === job.id) document.getElementById("pubjobsheet").classList.remove("on");
    syncSheetRelease();
    setInfo("Published " + (job.items[0] ? job.items[0].label : job.title) + " ✓");
  });
}
// ⇪ Publish song, done (both of its branches): the status line keeps
// "Published <song> ✓" past the window, then the window goes (a docked one
// stays) — back to the notes list when that is where it came from.
export function syncPublishedOne(result = "") {
  // the song shipped either way, but a song-list (README) warning must stay
  // readable: it goes to the status line and the window stays open
  if (/didn't update/.test(result)) { setInfo(result); return; }
  setInfo("Published " + songTitleOf(S.songKey) + " ✓");
  setTimeout(() => {
    syncSheetRelease();
    if (S.syncReturnToList) { renderNoteList(); notelistSheet.classList.add("on"); }
  }, 900);
}

export function openInsertBars() {
  const bt = barTicks(), qt = beatTicks();
  document.getElementById("insb").value = Math.floor(S.playCursor / bt) + 1;
  document.getElementById("insq").value = Math.round(((S.playCursor % bt) / qt + 1) * 100) / 100;
  const row = document.getElementById("insunit");
  row.innerHTML = "";
  for (const u of ["bars", "beats", "16ths"]) {
    const b = document.createElement("button");
    b.textContent = u;
    b.className = "chip" + (S.insUnit === u ? " selected" : "");
    b.style.cssText = "min-height:44px;justify-content:center" +
      (S.insUnit === u ? ";background:var(--gold);color:#111;font-weight:700" : "");
    b.addEventListener("click", () => { S.insUnit = u; openInsertBars(); });
    row.appendChild(b);
  }
  document.getElementById("insbarsheet").classList.add("on");
}
export function openDeleteBars() {
  const bt = barTicks();
  document.getElementById("delb").value = Math.floor(S.playCursor / bt) + 1;
  document.getElementById("deln").value = 1;
  document.getElementById("delbarsheet").classList.add("on");
}
export function openVersionsSheet() {
  document.getElementById("versionssheet").classList.add("on");
  renderVersionsSheet();
}
export async function goBackToVersion(key, idx) {
  const list = readVersions(key);
  const v = list[idx];
  if (!v) return;
  const label = versionLabel(v);
  const ok = await appConfirm("GO BACK TO " + label.toUpperCase() + "?",
    "Your current state is kept as a version first.", "Go back to this", "Cancel");
  if (!ok) return;
  pushVersion(key, "Before going back"); // list[idx] is still valid after this: pushVersion only appends
  localStorage.setItem(draftStoreKey(key), JSON.stringify(v.draft));
  if (v.notes) localStorage.setItem("ff1roll-notes-" + key, JSON.stringify(v.notes)); else localStorage.removeItem("ff1roll-notes-" + key);
  if (v.ts) localStorage.setItem("ff1roll-ts-" + key, v.ts); else localStorage.removeItem("ff1roll-ts-" + key);
  S.editUndo = []; S.editRedo = [];
  if (key === S.songKey) await openDraft(key);
  document.getElementById("versionssheet").classList.remove("on");
  setInfo("back to " + label + " — your previous state is saved as a version too");
}
export function renderVersionsSheet() {
  const box = document.getElementById("versionsrows");
  box.textContent = "";
  const key = S.songKey;
  const row = (label, onGoBack) => {
    const r = document.createElement("div");
    r.className = "noterow";
    const body = document.createElement("span");
    body.className = "body";
    body.textContent = label;
    r.appendChild(body);
    if (onGoBack) {
      const b = document.createElement("button");
      b.className = "fitem";
      b.style.cssText = "flex:none;width:auto";
      b.textContent = "Go back to this";
      b.addEventListener("click", onGoBack);
      r.appendChild(b);
    }
    box.appendChild(r);
    return r;
  };
  if (!key) { row("open a song first"); return; }
  if (catalogHas(key)) row("Published copy", () => goBackToPublished(key));
  const list = readVersions(key);
  if (!list.length && !catalogHas(key)) row("Nothing saved here yet — File → Save Version to start.");
  for (let i = list.length - 1; i >= 0; i--) { // newest first on screen
    const v = list[i];
    row(versionLabel(v), () => goBackToVersion(key, i));
  }
}
export async function goBackToPublished(key) { // the music + annotations go back; the AI chat stays — it's a conversation, not song state (Josh, 2026-10-10 via Ask: "I lost our chat and that is really annoying")
  const ok = await appConfirm("GO BACK TO THE PUBLISHED COPY?",
    "Your current state is kept as a version first. Your AI chat stays.",
    "Go back to this", "Cancel");
  if (!ok) return;
  dropLocalSong(key);
  pubCheck.delete(key);
  S.editUndo = []; S.editRedo = [];
  if (key === S.songKey) { S.songKey = null; await loadSong(key); }
  updateSyncBtn();
  updateSongBtn();
  document.getElementById("versionssheet").classList.remove("on");
  setInfo("back to the published copy — your chat is untouched, and your previous state is saved as a version too");
}
export function openGridSheet() {
  const row = document.getElementById("gridchips");
  row.innerHTML = "";
  for (const n of [4, 5, 6, 7, 8, 9, 10, 12, 16]) {
    const b = document.createElement("button");
    b.textContent = String(n);
    b.className = "chip" + (S.gridDiv === n ? " selected" : "");
    b.style.cssText = "min-width:52px;min-height:44px;font-size:1.0625rem;justify-content:center" +
      (S.gridDiv === n ? ";background:var(--gold);color:#111;font-weight:700" : "");
    b.addEventListener("click", () => { S.gridDiv = n; syncDurSeg(); draw(); openGridSheet(); });
    row.appendChild(b);
  }
  const ab = document.getElementById("gridab"), aq = document.getElementById("gridaq");
  ab.value = S.gridAnchor.b; aq.value = S.gridAnchor.q;
  const an = document.getElementById("gridanchor");
  an.textContent = !S.gridDiv ? "Grid off — the roll shows the meter's own lines."
    : "Lines run from " + S.gridAnchor.b + "." + S.gridAnchor.q + ", every 1/" + S.gridDiv +
      " of a bar, across the whole song. Bar lines stay visible but don't snap.";
  document.getElementById("gridsheet").classList.add("on");
}
export const DP_PIECES = [["hat", 42], ["snare", 38], ["kick", 36]];  // [piece][step] booleans, rebuilt when meter/grid changes
export function dpSteps() { return effTs()[0] * parseInt(document.getElementById("dpdiv").value, 10); }
export function dpDefault() { // a sane backbeat for the current meter: kick on 1 (+mid), snare on the even beats, hat everywhere
  const beats = effTs()[0], div = parseInt(document.getElementById("dpdiv").value, 10), n = beats * div;
  const kick = Array(n).fill(false), snare = Array(n).fill(false), hat = Array(n).fill(true);
  kick[0] = true;
  if (beats >= 4) kick[Math.floor(beats / 2) * div] = true;
  for (let b = 1; b < beats; b += 2) snare[b * div] = true;
  return [hat, snare, kick]; // same order as DP_PIECES
}
export function dpRender() {
  const n = dpSteps(), div = parseInt(document.getElementById("dpdiv").value, 10);
  if (!S.dpPattern || S.dpPattern[0].length !== n) S.dpPattern = dpDefault();
  const g = document.getElementById("dpgrid");
  g.innerHTML = "";
  DP_PIECES.forEach(([name], pi) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:3px;align-items:center;margin-top:6px";
    const lb = document.createElement("span");
    lb.className = "lbl";
    lb.style.cssText = "width:44px;flex:none";
    lb.textContent = name;
    row.appendChild(lb);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("button");
      c.style.cssText = "flex:1;min-width:0;min-height:40px;padding:0;border-radius:5px;" +
        (i % div === 0 ? "border-width:2px;" : "opacity:.9;");
      c.classList.toggle("primary", S.dpPattern[pi][i]);
      c.textContent = i % div === 0 ? String(i / div + 1) : "·";
      c.addEventListener("click", () => { S.dpPattern[pi][i] = !S.dpPattern[pi][i]; dpRender(); });
      row.appendChild(c);
    }
    g.appendChild(row);
  });
}
export function dpBuildBeatSelects() { // bar typed (fills extend past the song's end), beat+sub picked
  const beats = effTs()[0];
  for (const id of ["dpfromq", "dptoq"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (let b = 1; b <= beats; b++) {
      const o = document.createElement("option");
      o.value = String(b); o.textContent = String(b);
      sel.appendChild(o);
    }
  }
  for (const id of ["dpfroms", "dptos"]) {
    const sel = document.getElementById(id);
    sel.innerHTML = "";
    for (const [f, syl] of [[0, "·"], [0.25, "e"], [0.5, "&"], [0.75, "a"]]) {
      const o = document.createElement("option");
      o.value = String(f); o.textContent = syl;
      sel.appendChild(o);
    }
  }
}
export function segGet(id) { const a = document.querySelector("#" + id + " button.active"); return a ? a.dataset.v : null; }
export function openPasteTo() {
  if (!editableSong()) { setInfo("paste works on your own songs — captures are locked"); return; }
  if (!clipboardHas()) { setInfo("nothing copied yet — select notes and tap Copy (or ⌘C) first"); return; }
  S.ptTarget = S.selTrack;
  const box = document.getElementById("pttracks");
  box.innerHTML = S.song.tracks.map((tr, ti) =>
    '<button data-pt="' + ti + '" style="min-height:44px"' + (ti === S.ptTarget ? ' class="primary"' : '') + '>' +
    (tr.name || "track " + (ti + 1)) + '</button>').join("");
  document.getElementById("pastesheet").classList.add("on");
}
export function renderFolderUI() {
  const nameEl = document.getElementById("foldername");
  const pick = document.getElementById("folderpick");
  const forget = document.getElementById("folderforget");
  const recon = document.getElementById("filefolder");
  const native = !!nativeFs();
  document.getElementById("filesrow").style.display = native ? "" : "none";
  document.getElementById("folderrow").style.display = native ? "none" : "";
  if (native) { // the iPad app: nothing to set — Files is where saves live, GitHub is where Publish goes
    document.getElementById("fileshelp").textContent = "Your songs are kept in Files → On My iPad → Night Roll: every Save writes a copy there. Publish sends them to GitHub.";
  } else if (!folderSupported() && fsRoot.mode !== "opfs") {
    // Chrome hides the API on plain http (except localhost/127.0.0.1) — say
    // which of the two it is, or a LAN-served dev copy reads as "wrong browser"
    const insecure = typeof window !== "undefined" && window.isSecureContext === false;
    const brave = typeof navigator !== "undefined" && !!navigator.brave; // Brave ships the API switched OFF (Josh hit this, 2026-09-15)
    nameEl.textContent = insecure
      ? "needs https (or localhost) — this page is plain http, so Chrome hides the folder door; saves go to GitHub here"
      : brave ? "Brave turns this off: open brave://flags/#file-system-access-api, enable, relaunch — or use Chrome"
      : "needs Chrome or Edge on a computer — saves go to GitHub here";
    pick.style.display = "none";
    forget.style.display = "none";
  } else if (fsRoot.handle) {
    nameEl.textContent = (fsRoot.needsGrant ? "⚠ reconnect: " : "📁 ") + fsRoot.name +
      (fsRoot.needsGrant ? " (Chrome needs a fresh OK)" : " — every Publish writes here, nothing goes to GitHub");
    pick.textContent = fsRoot.needsGrant ? "Reconnect" : "Change folder…";
    pick.style.display = "";
    forget.style.display = fsRoot.mode === "opfs" ? "none" : "";
  } else {
    nameEl.textContent = "not set — saves go to GitHub";
    pick.textContent = "Choose folder…";
    pick.style.display = "";
    forget.style.display = "none";
  }
  recon.style.display = fsRoot.handle && fsRoot.needsGrant ? "" : "none";
  document.getElementById("folderonlyrow").style.display = folderActive() ? "" : "none";
  document.getElementById("folderonly").checked = localStorage.getItem("ff1roll-folderonly") === "1";
  document.getElementById("filesave").textContent = folderActive() ? "Publish to folder…" : "Publish…";
  updateSyncBtn();
  updateSongBtn();
}
export async function folderAfterChange(msg) { // the catalog and the open song both depend on where data lives
  renderFolderUI();
  albumMetaCache && Object.keys(albumMetaCache).forEach(k => delete albumMetaCache[k]);
  try { await initCatalog(); } catch (err) { /* offline: the folder alone still lists */ }
  if (S.currentPath) { const k = S.currentPath; S.songKey = null; await loadSong(k).catch(() => {}); }
  setInfo(msg);
}
export async function chooseFolder() { // must run inside a user gesture
  if (fsRoot.handle && fsRoot.needsGrant) { // reconnect: same folder, fresh permission
    if (await folderPermission(true) === "granted") { fsRoot.needsGrant = false; await folderAfterChange("folder reconnected: " + fsRoot.name); }
    else setInfo("Chrome didn't grant the folder — choose it again");
    return;
  }
  if (!folderSupported()) return;
  let h;
  try { h = await window.showDirectoryPicker({mode: "readwrite", id: "nightroll"}); }
  catch (err) { return; } // cancelled
  fsRoot.handle = h; fsRoot.name = h.name; fsRoot.mode = "picker"; fsRoot.needsGrant = false;
  await idbFsPut(h);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  await folderAfterChange("saving to folder: " + h.name);
}
export async function forgetFolder() {
  fsRoot.handle = null; fsRoot.name = ""; fsRoot.mode = null; fsRoot.needsGrant = false;
  await idbFsPut(null);
  await folderAfterChange("folder forgotten — saves go to GitHub again");
}
export function applyTextSize(v) { try { document.documentElement.style.setProperty("--userscale", v); } catch (err) {} }
export function settingsPersist(id) {
  const v = el => document.getElementById(el).value.trim();
  const keep = (k, val) => { if (val) localStorage.setItem(k, val); else localStorage.removeItem(k); };
  switch (id) {
    case "ghtoken": keep("ff1roll-ghtoken", v("ghtoken")); ghCheckOut(""); updateSyncBtn(); updateSongBtn(); break; // connecting/disconnecting GitHub changes whether the footer Publish button and ● show (Model B)
    case "cfglearning": setAppMode(document.getElementById("cfglearning").checked ? "learning" : "normal"); applyMode(); break;
    case "cfgnotetapcursor": { try { localStorage.setItem("ff1roll-notetapcursor", document.getElementById("cfgnotetapcursor").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgpeninstant": { try { localStorage.setItem("ff1roll-peninstant", document.getElementById("cfgpeninstant").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgrecsnap": { try { localStorage.setItem("ff1roll-recsnap", document.getElementById("cfgrecsnap").checked ? "1" : "0"); } catch (err) { /* private mode */ } break; }
    case "cfgtextsize": { const tv = v("cfgtextsize") || "1"; try { localStorage.setItem("ff1roll-textsize", tv); } catch (err) { /* private mode */ } applyTextSize(tv); break; }
    case "cfgdebuglog": { try { if (document.getElementById("cfgdebuglog").checked) localStorage.setItem("ff1roll-debuglog", "1"); else localStorage.removeItem("ff1roll-debuglog"); } catch (err) { /* private mode: stays off */ } errChip(); break; }
    case "cfgchipstream": { const sv = v("cfgchipstream") || "auto"; try { localStorage.setItem("ff1roll-chipstream", sv); } catch (err) { /* private mode: stays the default */ } break; }
    case "cfgaikey": keep("ff1roll-aikey", v("cfgaikey")); S.askModelCache = null; break;
    case "cfgaibackend": saveCfg({aiBackend: v("cfgaibackend") === "browser" ? "browser" : "remote"}); aiBackendRows(); break;
    case "cfgaibrowsermodel": saveCfg({aiBrowserModel: v("cfgaibrowsermodel") || "Llama-3.2-1B-Instruct-q4f16_1-MLC"}); break;
    case "cfgaiurl": {
      const url = (v("cfgaiurl") || "http://localhost:1234").replace(/\/+$/, "");
      if (url !== cfg().aiUrl) { saveCfg({aiUrl: url}); S.askModelCache = null; aiModelMenu([], cfg().aiModel); }
      break;
    }
    case "cfgaimodel": saveCfg({aiModel: v("cfgaimodel")}); break;
    case "cfgaiwindow": saveCfg({aiWindow: parseInt(v("cfgaiwindow"), 10) || 8192}); break;

    case "cfgsongsrepo": { // annotations follow unless the advanced row split them on purpose
      const c = cfg(), repo = v("cfgsongsrepo") || "Night-Roll-App/night-roll", patch = {songsRepo: repo};
      if (c.analysisRepo === c.songsRepo) patch.analysisRepo = repo;
      // saveCfg stores every default with the first saved setting, so a new
      // user's cfg carried Josh's archive; switching to their own songs repo
      // then published their game files to a repo their token can't write
      // (Josh, 2026-09-28: "it's going to try to push to my NSF repo?")
      if (repo !== "Night-Roll-App/night-roll" && c.nsfRepo === "Night-Roll-App/nsf-archive") { patch.nsfRepo = ""; patch.nsfBase = ""; document.getElementById("cfgnsfrepo").value = ""; }
      saveCfg(patch); ghCheckOut(""); break;
    }
    case "cfgnsfrepo": { const r = v("cfgnsfrepo"); saveCfg({nsfRepo: r, nsfBase: r ? "https://raw.githubusercontent.com/" + r + "/main" : ""}); cfg.c = null; break; }
    default: return; // folderonly has its own listener
  }
  if (id.startsWith("cfgai")) askRefresh();
}

export function initSheets1() {
  document.getElementById("insgo").addEventListener("click", () => {
    const bt = barTicks(), qt = beatTicks();
    const b = Math.max(1, Math.round(+document.getElementById("insb").value || 1));
    const q = Math.max(1, +document.getElementById("insq").value || 1);
    const n = Math.max(1, Math.round(+document.getElementById("insn").value || 1));
    const T = Math.round((b - 1) * bt + (q - 1) * qt);
    const delta = n * (S.insUnit === "bars" ? bt : S.insUnit === "beats" ? qt : qt / 4);
    const k = insertTime(T, Math.round(delta));
    document.getElementById("insbarsheet").classList.remove("on");
    setInfo(k ? "inserted " + n + " " + S.insUnit + " at " + b + "." + q + " — " + k + " things moved (one undo undoes)"
              : "nothing to insert into — is this song editable?");
  });
  document.getElementById("insclose").addEventListener("click", () =>
    document.getElementById("insbarsheet").classList.remove("on"));
  document.getElementById("delgo").addEventListener("click", () => {
    const bt = barTicks();
    const fromBar = Math.max(1, Math.round(+document.getElementById("delb").value || 1));
    const n = Math.max(1, Math.round(+document.getElementById("deln").value || 1));
    const r = deleteTime((fromBar - 1) * bt, n * bt);
    document.getElementById("delbarsheet").classList.remove("on");
    const where = n > 1 ? ("bar " + fromBar + "–" + (fromBar + n - 1)) : ("bar " + fromBar);
    setInfo(r ? where + " removed — everything after moved " + n + " bar" + (n === 1 ? "" : "s") + " earlier" +
                 (r.movedToT ? "; " + r.movedToT + " annotation" + (r.movedToT === 1 ? "" : "s") + " moved to bar " + fromBar : "")
              : "nothing to delete from — is this song editable?");
  });
  document.getElementById("delclose").addEventListener("click", () =>
    document.getElementById("delbarsheet").classList.remove("on"));
               if (typeof document !== "undefined" && document.getElementById("jobsbtn")) {
    document.getElementById("jobsbtn").addEventListener("click", () => { renderJobs(); document.getElementById("jobssheet").classList.add("on"); });
    document.getElementById("jobsclear").addEventListener("click", () => { jobsClearFinished(); renderJobs(); });
    document.getElementById("pubjobcancel").addEventListener("click", () => { if (S.pubJobShown) jobCancel(S.pubJobShown); renderPubJob(); });
    document.getElementById("pubjobclose").addEventListener("click", () => document.getElementById("pubjobsheet").classList.remove("on"));
    document.getElementById("pubjobretry").addEventListener("click", () => { const job = S.jobs.find(j => j.id === S.pubJobShown), kind = job && JOB_KINDS[job.kind]; if (kind && kind.retry) kind.retry(job); }); // the retry opens its own job's dialog
    jobsOnChange(() => {
      if (document.getElementById("jobssheet").classList.contains("on")) renderJobs();
      if (document.getElementById("pubjobsheet").classList.contains("on")) renderPubJob();
    });
  }
}

export function initSheets2() {
  met.on = false;
  {
    const num = document.getElementById("metnum");
    for (let n = 1; n <= 12; n++) {
      const o = document.createElement("option");
      o.textContent = String(n);
      num.appendChild(o);
    }
    num.value = String(met.num);
    document.getElementById("metden").value = String(met.den);
    document.getElementById("metsub").value = String(met.sub);
    document.getElementById("metbpm").value = String(met.bpm);
    document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
    document.getElementById("metfollow").value = met.follow;
    document.getElementById("metcountin").checked = !!met.countIn;
    metBuildCells();
    applyMetMode();
  }
  // ⏱ is a one-tap click toggle, the DAW habit (Logic's K); ⚙ beside it opens
  // the settings (Josh, 2026-09-29: three taps to turn the click on was too many)
  document.getElementById("metbtn").addEventListener("click", () => met.on ? metHalt() : metStart());
  document.getElementById("metcfg").addEventListener("click", () => {
    const sheet = document.getElementById("metsheet");
    if (sheet.classList.contains("on")) { sheet.classList.remove("on"); return; }
    const r = document.getElementById("metbtn").getBoundingClientRect();
    sheet.style.top = (r.bottom + 6) + "px";
    sheet.classList.add("on");
    // right-anchor near the button, clamped on-screen
    requestAnimationFrame(() => {
      const w = sheet.offsetWidth;
      sheet.style.left = Math.max(6, Math.min(r.right - w, songRegionRight() - w - 6)) + "px";
    });
  });
  document.getElementById("metclose").addEventListener("click", () =>
    document.getElementById("metsheet").classList.remove("on")); // panel closes; the click keeps going
  document.getElementById("metgo").addEventListener("click", () => met.on ? metHalt() : metStart());
  document.getElementById("metbpm").addEventListener("input", e => {
    met.bpm = +e.target.value;
    document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
    metSave();
  });
  document.getElementById("metnum").addEventListener("change", e => {
    met.num = +e.target.value;
    met.accents = metDefaultAccents();
    metSave();
    metBuildCells();
  });
  document.getElementById("metden").addEventListener("change", e => {
    met.den = +e.target.value;
    met.accents = metDefaultAccents();
    metSave();
    metBuildCells();
  });
  document.getElementById("metsub").addEventListener("change", e => {
    met.sub = +e.target.value;
    metSave();
  });
  document.getElementById("metfollow").addEventListener("change", e => {
    met.follow = e.target.value;
    applyMetMode();
  });
  document.getElementById("metnudgeL").addEventListener("click", () => {
    met.nudge = (((met.nudge - 1) % metFollowNum()) + metFollowNum()) % metFollowNum();
    metSave();
  });
  document.getElementById("metnudgeR").addEventListener("click", () => {
    met.nudge = (met.nudge + 1) % metFollowNum();
    metSave();
  });
  document.getElementById("metcountin").addEventListener("change", e => {
    met.countIn = e.target.checked;
    metSave();
  });
  document.getElementById("mettap").addEventListener("click", () => {
    const now = performance.now();
    S.metTaps = S.metTaps.filter(t => now - t < 3000);
    S.metTaps.push(now);
    if (S.metTaps.length >= 2) {
      const gaps = S.metTaps.slice(1).map((t, i) => t - S.metTaps[i]);
      const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      met.bpm = Math.max(30, Math.min(260, Math.round(60000 / avg)));
      document.getElementById("metbpm").value = String(met.bpm);
      document.getElementById("metbpmlbl").textContent = met.bpm + " bpm";
      metSave();
    }
  });

                    {
    const roots = document.getElementById("chroots"), quals = document.getElementById("chquals");
    const preview = () => { document.getElementById("chpreview").textContent = chordLabel(); };
    roots.innerHTML = CHORD_ROOTS.map((r, i) =>
      '<button data-root="' + i + '" style="min-height:40px">' + r + '</button>').join("");
    quals.innerHTML = CHORD_QUALS.map(([q]) =>
      '<button data-qual="' + q + '" style="min-height:40px">' + (q === "maj" ? "maj" : q) + '</button>').join("");
    const sel = document.getElementById("choct");
    sel.innerHTML = [2, 3, 4, 5, 6].map(o => '<option' + (o === 4 ? ' selected' : '') + '>' + o + '</option>').join("");
    sel.addEventListener("change", () => { S.chordOct = parseInt(sel.value, 10); });
    const durOpts = v => INS_DURS.map(([lb, q]) =>
      '<option value="' + q + '"' + (q === v ? ' selected' : '') + '>' + lb + '</option>').join("");
    const chdur = document.getElementById("chdur");
    chdur.innerHTML = durOpts(S.chordInsDur);
    chdur.addEventListener("change", () => {
      S.chordInsDur = parseFloat(chdur.value);
      const pg = document.getElementById("pgdur");
      if (pg) pg.value = chdur.value;
    });
    const mark = () => {
      for (const b of roots.children) b.classList.toggle("primary", +b.dataset.root === S.chordRoot);
      for (const b of quals.children) b.classList.toggle("primary", b.dataset.qual === S.chordQual);
      preview();
    };
    roots.addEventListener("click", e => {
      const b = e.target.closest("button[data-root]");
      if (b) { S.chordRoot = +b.dataset.root; mark(); }
    });
    quals.addEventListener("click", e => {
      const b = e.target.closest("button[data-qual]");
      if (b) { S.chordQual = b.dataset.qual; mark(); }
    });
    document.getElementById("insbtn").addEventListener("click", () => {
      if (!editableSong()) { setInfo("chords insert on your own songs — captures are locked"); return; }
      mark();
      document.getElementById("chordsheet").classList.add("on");
    });
    document.getElementById("chinsert").addEventListener("click", () => {
      const k = insertChordAt(S.playCursor, S.chordRoot, S.chordQual, S.chordOct, S.chordInsDur);
      setInfo(k ? "inserted " + chordLabel() + " (" + k + " notes) — cursor moved to the next slot"
                : "couldn't insert — check the octave fits the C1..C7 range");
    });
  }
   {
    const panel = document.getElementById("progpanel");
    panel.innerHTML =
      '<div class="row" style="flex-wrap:wrap;gap:6px;padding:4px 2px 8px">' +
        '<span class="lbl">tonic</span><select id="pgtonic">' +
          CHORD_ROOTS.map((r, i) => '<option value="' + i + '">' + r + '</option>').join("") +
        '</select><span class="lbl">octave</span><select id="pgoct">' +
          [2, 3, 4, 5, 6].map(o => '<option' + (o === 4 ? ' selected' : '') + '>' + o + '</option>').join("") +
        '</select><span class="lbl">duration</span><select id="pgdur">' +
          INS_DURS.map(([lb, q]) => '<option value="' + q + '"' + (q === 1 ? ' selected' : '') + '>' + lb + '</option>').join("") +
        '</select><span class="lbl" style="opacity:.7">tap a progression to insert it at the cursor — one chord per slot</span></div>' +
      '<div class="row" style="flex-wrap:wrap;gap:6px;padding:0 2px 8px">' +
        '<span class="lbl">type your own</span>' +
        '<input type="text" id="pgcustom" placeholder="i – VI – VII – V" style="flex:1;min-width:160px;min-height:40px">' +
        '<select id="pgmode"><option value="major">major scale</option><option value="minor">minor scale</option></select>' +
        '<button id="pggo">Insert</button></div>' +
      PROG_LIB.map(([mood, prog, why], i) =>
        '<div class="prow" data-prog="' + i + '"><b>' + mood + '</b><span class="pchords">' + prog + '</span><small>' + why + '</small></div>'
      ).join("");
    panel.addEventListener("click", e => {
      const row = e.target.closest(".prow[data-prog]");
      if (!row) return;
      if (!editableSong()) { setInfo("progressions insert on your own songs — captures are locked"); return; }
      const [mood, prog] = PROG_LIB[+row.dataset.prog];
      const tonicPc = +document.getElementById("pgtonic").value;
      const oct = parseInt(document.getElementById("pgoct").value, 10);
      S.chordInsDur = parseFloat(document.getElementById("pgdur").value);
      document.getElementById("chdur").value = document.getElementById("pgdur").value;
      const k = insertProgressionAt(S.playCursor, prog, tonicPc, oct, S.chordInsDur);
      setInfo(k ? "inserted " + mood + " in " + CHORD_ROOTS[tonicPc].split("/")[0] + " (" + k + " notes) — stretch or move them from here"
                : "couldn't insert — check the octave fits C1..C7");
    });
    // typed progression: the same insert, numerals read against the chosen
    // scale (minor pre-selects itself from a minor key at the cursor)
    const insertCustom = () => {
      const prog = document.getElementById("pgcustom").value.trim();
      if (!prog) { setInfo("type a progression first — numerals like i – VI – VII – V"); return; }
      if (!editableSong()) { setInfo("progressions insert on your own songs — captures are locked"); return; }
      const minorScale = document.getElementById("pgmode").value === "minor";
      const bad = splitProgression(prog).filter(t => !parseNumeral(t, minorScale));
      if (bad.length) { setInfo("couldn't read " + bad.join(", ") + " — use I..VII, lowercase for minor, ♭/♯ or b/# in front, °/7/maj7/6 after"); return; }
      const tonicPc = +document.getElementById("pgtonic").value;
      const oct = parseInt(document.getElementById("pgoct").value, 10);
      S.chordInsDur = parseFloat(document.getElementById("pgdur").value);
      document.getElementById("chdur").value = document.getElementById("pgdur").value;
      const k = insertProgressionAt(S.playCursor, prog, tonicPc, oct, S.chordInsDur, minorScale);
      setInfo(k ? "inserted " + prog + " in " + CHORD_ROOTS[tonicPc].split("/")[0] + (minorScale ? " minor" : "") + " (" + k + " notes) — erase tones to make arpeggios"
                : "couldn't insert — check the octave fits C1..C7");
    };
    document.getElementById("pggo").addEventListener("click", insertCustom);
    document.getElementById("pgcustom").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); insertCustom(); } });
    // one panel, two homes (Josh: "let's do both") — it reparents into whichever
    // dialog summons it
    const tabC = document.getElementById("chtab-chord"), tabP = document.getElementById("chtab-prog");
    const seedTonic = () => { // declared key at the cursor pre-fills the tonic (override freely)
      const name = S.song ? keyNameAt(S.playCursor) : null;
      const pc = name ? tonicPcOfName(name) : null;
      if (pc !== null) document.getElementById("pgtonic").value = pc;
      if (name) document.getElementById("pgmode").value = /m$|minor|aeolian|dorian|phrygian/i.test(name) ? "minor" : "major";
    };
    const setTab = prog => {
      if (prog) { document.getElementById("chprogslot").appendChild(panel); seedTonic(); }
      document.getElementById("chchordpane").style.display = prog ? "none" : "";
      panel.style.display = prog ? "block" : "none";
      tabC.classList.toggle("primary", !prog);
      tabP.classList.toggle("primary", prog);
      tabC.setAttribute("aria-selected", String(!prog));
      tabP.setAttribute("aria-selected", String(prog));
    };
    tabC.addEventListener("click", () => setTab(false));
    tabP.addEventListener("click", () => setTab(true));
    // reopening the dialog re-reads the key too: Josh set a key with the
    // dialog already on the Progression tab and it kept the stale scale
    document.getElementById("insbtn").addEventListener("click", () => { if (editableSong()) seedTonic(); });
    const cofBtn = document.getElementById("cofprogbtn");
    cofBtn.addEventListener("click", () => {
      const showing = panel.parentElement.id === "cofprogslot" && panel.style.display !== "none";
      if (!showing) { document.getElementById("cofprogslot").appendChild(panel); panel.style.display = "block"; seedTonic(); }
      else panel.style.display = "none";
      for (const id of ["cofcanvas", "cofdetail", "cofccw", "cofcw"])
        document.getElementById(id).style.display = showing ? "" : "none";
      cofBtn.textContent = showing ? "Progressions" : "Wheel";
    });
  }
}

// ⎘ Web session (Sync sheet): copies the clone-first bootstrap instruction —
// Josh pastes it into a fresh Claude Web chat to start a from-bed tutoring
// session with full project context.
export function initSheets3() {
  document.getElementById("websess").addEventListener("click", async e => {
    // Copy an INSTRUCTION, not a bare URL (Josh, 2026-08-25: "I have to tell
    // Claude on the web every single time to clone the repo instead of
    // following URLs"). Pasting a URL makes the session's first act a fetch,
    // and it keeps fetching from there. Lead with the clone.
    const repo = "https://github.com/" + repoName("analysis") + ".git";
    const msg = "Clone this repo, then read night-roll/WEB-SESSION.md from disk and follow it. " +
      "Work entirely from the clone — do not fetch any file by URL.\n\n" +
      "cd /home/claude && git clone --depth 1 --filter=blob:limit=1m " + repo + "\n";
    try { await navigator.clipboard.writeText(msg); e.target.textContent = "✓ copied — paste to Claude"; }
    catch { e.target.textContent = "✗ copy failed"; }
    setTimeout(() => { e.target.textContent = "⎘ Web session"; }, 1800);
  });
}

export function initSheets4() {
  for (const id of ["gridab", "gridaq"]) document.getElementById(id).addEventListener("input", () => {
    const b = Math.max(1, Math.round(+document.getElementById("gridab").value || 1));
    const q = Math.max(1, +document.getElementById("gridaq").value || 1);
    S.gridAnchor = {b, q};
    draw();
    const an = document.getElementById("gridanchor");
    if (S.gridDiv) an.textContent = "Lines run from " + b + "." + q + ", every 1/" + S.gridDiv +
      " of a bar, across the whole song. Bar lines stay visible but don't snap.";
  });
  document.getElementById("gridoff").addEventListener("click", () => { S.gridDiv = null; syncDurSeg(); draw(); openGridSheet(); });
  document.getElementById("gridclose").addEventListener("click", () => {
    document.getElementById("gridsheet").classList.remove("on");
    setInfo(S.gridDiv ? "grid: " + S.gridDiv + " lines/bar — View ▾ → Grid to change" : "grid off");
  });
}

export function initSheets5() {
  document.getElementById("dpdiv").addEventListener("change", dpRender);
  document.getElementById("drumfillbtn").addEventListener("click", () => {
    if (!editableSong()) { setInfo("drum fills work on your own songs — captures are locked"); return; }
    dpBuildBeatSelects();
    const bt = barTicks(), qt = beatTicks();
    document.getElementById("dpfromb").value = Math.floor(S.playCursor / bt) + 1; // cursor's exact spot
    const q = snapBeat((S.playCursor % bt) / qt + 1);
    document.getElementById("dpfromq").value = String(Math.floor(q + 0.03));
    document.getElementById("dpfroms").value = String(Math.round((q - Math.floor(q + 0.03)) * 4) / 4);
    document.getElementById("dptob").value = Math.floor(S.playCursor / bt) + 5;
    document.getElementById("dptoq").value = "1";
    document.getElementById("dptos").value = "0";
    dpRender();
    document.getElementById("drumsheet").classList.add("on");
  });
  document.getElementById("dpfill").addEventListener("click", () => {
    let di = S.song.tracks.findIndex((_, ti) => trackIsDrums(ti));
    const madeTrack = di < 0, undoLen = S.editUndo.length;
    if (madeTrack) { // no kit yet: create one
      di = addTrackUndoable({name: "drums", notes: []});
      saveDraft(); // the chip path saves; this path silently lost the track on reload
      renderTrackbar();
    }
    const startTick = dpTick("dpfromb", "dpfromq", "dpfroms");
    const endTick = Math.max(startTick + barTicks(), dpTick("dptob", "dptoq", "dptos"));
    const div = parseInt(document.getElementById("dpdiv").value, 10);
    const step = Math.round(beatTicks() / div), bt = barTicks();
    const tr = S.song.tracks[di], isAdd = !isComposition();
    const added = [];
    const passes = Math.ceil((endTick - startTick) / bt); // pattern phase starts AT the from point
    for (let pass = 0; pass < passes; pass++) {
      for (let pi = 0; pi < DP_PIECES.length; pi++) {
        for (let i = 0; i < S.dpPattern[pi].length; i++) {
          if (!S.dpPattern[pi][i]) continue;
          const t = startTick + pass * bt + i * step;
          if (t >= endTick) continue;
          const p = DP_PIECES[pi][1];
          if (tr.notes.some(n => !n.gone && n.t === t && n.p === p)) continue; // don't stack over an existing hit
          tr.notes.push({t, d: Math.max(30, Math.round(step / 2)), p, v: S.pencilVel, added: isAdd});
          if (S.song.rawNotes) S.song.rawNotes[di].push({t: t + S.chopS, d: Math.max(30, Math.round(step / 2)), p, v: S.pencilVel, added: isAdd});
          added.push({ti: di, ni: tr.notes.length - 1});
        }
      }
    }
    if (added.length) {
      pushUndo({kind: "addBatch", items: added});
    if (madeTrack) undoTrackAdd(di, undoLen); // the new kit leaves with its fill
      saveEdits();
      computeSongEnd();
      if (S.viewMode === "score") buildScoreModel();
      S.view.y = 1e9; // the kit lane hangs below the pitch rows — scroll it into view,
      clampView();  // or a first fill looks like nothing happened (Josh)
      draw();
    }
    document.getElementById("drumsheet").classList.remove("on");
    setInfo(added.length ? "filled " + added.length + " drum hits from bar " + (Math.floor(startTick / barTicks()) + 1) + " (one undo undoes the fill)"
                         : "nothing to fill — pattern is empty or those hits already exist");
  });

   document.getElementById("bassistbtn").addEventListener("click", openBassist);
  document.getElementById("bsgen").addEventListener("click", () => {
    const r = bsRange();
    let targetTi = document.getElementById("bstarget").value;
    const madeTrack = targetTi === "new", undoLen = S.editUndo.length;
    if (madeTrack) {
      targetTi = addTrackUndoable({name: "bass", notes: []});
      saveDraft();
      renderTrackbar();
      // rebuild the pickers so the new track is selectable next time
      const tsel = document.getElementById("bstarget");
      const o = document.createElement("option"); o.value = String(targetTi); o.textContent = "bass";
      tsel.insertBefore(o, tsel.lastElementChild);
      tsel.value = String(targetTi);
    } else targetTi = parseInt(targetTi, 10);
    const fv = document.getElementById("bsfollow").value;
    const opts = {
      style: segGet("bsstyle"), busy: parseInt(segGet("bsbusy"), 10) || 3,
      oct: parseInt(segGet("bsoct"), 10) || 2,
      follow: fv, targetTi,
      fromBar: r.from, toBar: r.to, t0: r.t0, t1: r.t1,
    };
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    const k = bsGenerate(seed, opts);
    if (madeTrack) undoTrackAdd(targetTi, undoLen); // the new bass track is part of the same undo step
    if (!k) { bsRefresh(); return; }
    S.bsTakes.push({seed, opts, style: opts.style, busy: opts.busy, oct: opts.oct,
                  followSel: fv, targetTi,
                  from: parseInt(document.getElementById("bsfrom").value, 10) || 1,
                  to: parseInt(document.getElementById("bsto").value, 10) || 1,
                  q: [getBeatPair("bsfromq", "bsfroms"), getBeatPair("bstoq", "bstos")]});
    if (S.bsTakes.length > 8) S.bsTakes.shift();
    S.bsActive = S.bsTakes.length - 1;
    bsRefresh();
    setInfo("take " + S.bsTakes.length + ": " + k + " bass notes in " + fmtBarBeat(r.t0) + "–" + fmtBarBeat(r.t1) + " (one undo restores what was there)");
  });
  for (const id of ["bsfrom", "bsto"]) document.getElementById(id).addEventListener("input", bsRefresh);
  for (const id of ["bsfromq", "bsfroms", "bstoq", "bstos", "bstarget", "bsfollow"]) document.getElementById(id).addEventListener("change", bsRefresh);
  document.getElementById("drgen").addEventListener("click", () => {
    const r = drRange();
    const opts = {
      busy: parseInt(segGet("drbusy"), 10) || 3,
      hard: parseInt(segGet("drhard"), 10) || 3,
      fillAmt: (v => isNaN(v) ? 3 : v)(parseInt(segGet("drfills"), 10)),
      parts: drPartsGet(),
      follow: (v => v.startsWith("t") ? "bass" : v)(document.getElementById("drfollow").value),
      followTi: (v => v.startsWith("t") ? parseInt(v.slice(1), 10) : undefined)(document.getElementById("drfollow").value),
      feel: segGet("drfeel"),
      fromBar: r.from, toBar: r.to, t0: r.t0, t1: r.t1,
    };
    if (!opts.parts.length) { setInfo("pick at least one part"); return; }
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0; // the ONLY nondeterminism; takes replay it exactly
    const k = drGenerate(seed, opts);
    if (!k) { drRefresh(); return; }
    S.drTakes.push({seed, ...opts,
                  from: parseInt(document.getElementById("drfrom").value, 10) || 1,
                  to: parseInt(document.getElementById("drto").value, 10) || 1,
                  q: [getBeatPair("drfromq", "drfroms"), getBeatPair("drtoq", "drtos")]});
    if (S.drTakes.length > 8) S.drTakes.shift();
    S.drActive = S.drTakes.length - 1;
    drRefresh();
    setInfo("take " + S.drTakes.length + ": " + k + " hits in " + fmtBarBeat(r.t0) + "–" + fmtBarBeat(r.t1) + " (one undo restores what was there)");
  });
  for (const id of ["drfrom", "drto"]) document.getElementById(id).addEventListener("input", drRefresh);
  for (const id of ["drfromq", "drfroms", "drtoq", "drtos", "drfollow"]) document.getElementById(id).addEventListener("change", drRefresh);
  document.getElementById("drummerbtn").addEventListener("click", openDrummer);
  document.getElementById("movebtn").addEventListener("click", () => {
    if (!editableSong()) { setInfo("editing works on your own songs — captures are locked"); return; }
    const box = document.getElementById("mvtracks");
    box.innerHTML = S.song.tracks.map((tr, ti) =>
      '<button data-mv="' + ti + '" style="min-height:44px"' + (ti === S.selTrack ? ' class="primary"' : '') + '>' +
      (tr.name || "track " + (ti + 1)) + '</button>').join("");
    // selection spanning several tracks (unison doubles): offer a source filter,
    // so Josh moves ONLY pulse2's copy instead of both (2026-08-18)
    S.mvFromFilter = null;
    const counts = new Map();
    for (const {ti} of selEditItems()) counts.set(ti, (counts.get(ti) || 0) + 1);
    const fromRow = document.getElementById("mvfromrow"), from = document.getElementById("mvfrom");
    if (counts.size > 1) {
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      from.innerHTML = '<button data-mf="all" class="primary" style="min-height:44px">all (' + total + ')</button>' +
        [...counts.entries()].map(([ti, n]) =>
          '<button data-mf="' + ti + '" style="min-height:44px">' +
          (S.song.tracks[ti].name || "track " + (ti + 1)) + " (" + n + ")</button>").join("");
      fromRow.style.display = "";
    } else fromRow.style.display = "none";
    document.getElementById("movesheet").classList.add("on");
  });
  document.getElementById("mvfrom").addEventListener("click", e => {
    const b = e.target.closest("button[data-mf]");
    if (!b) return;
    S.mvFromFilter = b.dataset.mf === "all" ? null : +b.dataset.mf;
    for (const x of document.querySelectorAll("#mvfrom button")) x.classList.toggle("primary", x === b);
  });
  document.getElementById("mvtracks").addEventListener("click", e => {
    const b = e.target.closest("button[data-mv]");
    if (!b) return;
    const k = moveSelectionToTrack(+b.dataset.mv);
    document.getElementById("movesheet").classList.remove("on");
    setInfo(k ? "moved " + k + " note" + (k === 1 ? "" : "s") + " to " + (S.song.tracks[+b.dataset.mv].name || "track")
              : "select notes first (lasso or tap), then ⇄");
  });
  document.getElementById("mvdedupe").addEventListener("click", () => {
    const k = dedupeSong();
    document.getElementById("movesheet").classList.remove("on");
    setInfo(k ? "removed " + k + " duplicate note" + (k === 1 ? "" : "s") + " — SAVE to make it stick (undo restores them)"
              : "no duplicates found anywhere");
  });
  document.getElementById("pttracks").addEventListener("click", e => {
    const b = e.target.closest("button[data-pt]");
    if (!b) return;
    S.ptTarget = +b.dataset.pt;
    for (const x of document.querySelectorAll("#pttracks button")) x.classList.toggle("primary", +x.dataset.pt === S.ptTarget);
  });
  document.getElementById("ptgo").addEventListener("click", () => {
    const oct = parseInt(document.getElementById("ptoct").value, 10) || 0;
    const semi = Math.max(-24, Math.min(24, parseInt(document.getElementById("ptsemi").value, 10) || 0));
    const k = pasteClipboard(S.playCursor, {ti: S.ptTarget, dP: oct * 12 + semi});
    if (!k) { setInfo("nothing landed — every note was already there or shifted off the roll"); return; }
    S.selTrack = S.ptTarget; renderTrackbar(); draw();
    document.getElementById("pastesheet").classList.remove("on");
    const shift = (oct ? (oct > 0 ? "+" : "") + oct + " oct" : "") + (semi ? (oct ? " " : "") + (semi > 0 ? "+" : "") + semi + " st" : "");
    setInfo("pasted " + k + " note" + (k === 1 ? "" : "s") + " onto " + (S.song.tracks[S.ptTarget].name || "track") + (shift ? " (" + shift + ")" : "") + " — selected, cursor at their end");
  });
  document.getElementById("pastebtn").addEventListener("click", () => {
    if (!editableSong()) { if (!pasteClipboard(S.playCursor) && !clipboardHas()) setInfo("nothing copied yet — lasso over the chords/sections and tap Copy first"); return; } // locked notes: annotations only, and pasteAnnotationsOnly says what landed
    const k = pasteClipboard(S.playCursor); // pastes the last ⧉/⌘C copy — surviving any scrolling
    setInfo(k ? "pasted " + clipSummary() + " — cursor moved to their end, paste again to chain"
              : "nothing copied yet — select notes and tap Copy (or ⌘C) first");
  });
}

export function initSheets6() {
  document.getElementById("syncbtn").addEventListener("click", openSyncSheet);
  for (const p of CFG_PANES) document.getElementById("cfgtab-" + p).addEventListener("click", () => cfgShowPane(p));
  document.getElementById("settingssheet").addEventListener("change", e => { if (e.target && e.target.id) settingsPersist(e.target.id); });
  document.getElementById("ghcheck").addEventListener("click", ghCheck);
  document.getElementById("filesettings").addEventListener("click", () => {
    closeFileMenus();
    openSettingsSheet();
  });
  document.getElementById("folderpick").addEventListener("click", () => { chooseFolder(); });
  document.getElementById("folderforget").addEventListener("click", () => { forgetFolder(); });
  document.getElementById("folderonly").addEventListener("change", e => {
    if (e.target.checked) localStorage.setItem("ff1roll-folderonly", "1"); else localStorage.removeItem("ff1roll-folderonly");
    folderAfterChange(e.target.checked ? "the song list is now your folder only" : "the song list shows the site's albums again");
  });
  document.getElementById("filefolder").addEventListener("click", () => { closeFileMenus(); chooseFolder(); });
}

export function initSheets7() {
  document.getElementById("sharelink").addEventListener("click", async () => {
    const st = document.getElementById("syncstatus");
    if (!S.songKey || !/^albums\//.test(S.songKey)) { st.textContent = "Local files have no link — publish the song first."; return; }
    const link = shareLinkFor(S.songKey);
    try {
      if (navigator.share) { await navigator.share({title: songTitleOf(S.songKey) + " · Night Roll", url: link}); st.textContent = "Shared."; return; }
      await navigator.clipboard.writeText(link);
      st.textContent = "Link copied: " + link;
    } catch (err) { st.textContent = err && err.name === "AbortError" ? "" : "Couldn't share: " + err.message + " — " + link; }
  });
  document.getElementById("fileshare").addEventListener("click", () => { closeFileMenus(); openShareSheet(); });
  document.getElementById("shClose").addEventListener("click", () => document.getElementById("sharesheet").classList.remove("on"));
  document.getElementById("shUrl").addEventListener("focus", e => e.target.select());
  document.getElementById("shCopy").addEventListener("click", async e => {
    try { await navigator.clipboard.writeText(document.getElementById("shUrl").value); e.target.textContent = "Copied ✓"; }
    catch (err) { document.getElementById("shUrl").select(); e.target.textContent = "Select + copy"; }
    setTimeout(() => { e.target.textContent = "Copy"; }, 1500);
  });
  document.getElementById("shSend").addEventListener("click", async () => {
    try { await navigator.share({title: songTitleOf(S.songKey) + " · Night Roll", url: document.getElementById("shUrl").value}); }
    catch (err) { /* AbortError = he closed the share sheet */ }
  });
  document.getElementById("copyfile").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(serializeRollnotes());
      document.getElementById("syncstatus").textContent = "Copied to clipboard.";
    } catch (err) { document.getElementById("syncstatus").textContent = "Copy failed: " + err.message; }
  });
  document.getElementById("dlfile").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([serializeRollnotes()], {type: "text/plain"}));
    a.download = baseName() + ".rollnotes.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById("ghsave").addEventListener("click", async e => {
    const btn = e.currentTarget;
    const status = document.getElementById("syncstatus");
    if (S.song && isUnsaved(S.songKey)) { // no folder yet (lotion, 2026-10-03): name it first — same sheet Save Version uses — then ship, instead of silently publishing annotations only
      const token = takeToken(status);
      if (!token) return;
      syncsheet.classList.remove("on");
      openSaveForm("publish");
      return;
    }
    if (S.song && isComposition()) { // writing mode: the ONE button ships everything, via the one publish function
      btn.disabled = true;
      status.textContent = "Publishing " + S.songKey + " (.mid + annotations)…";
      try {
        const token = writeToken();
        if (!token) { status.textContent = "No GitHub token stored yet — add one in File → Settings."; return; }
        status.textContent = await publishOpenComposition(ghHeaders(token), m => status.textContent = m);
        syncPublishedOne(status.textContent);
      } catch (err) { status.textContent = "Publish failed: " + err.message; }
      finally { btn.disabled = false; }
      return;
    }
    const token = takeToken(status);
    if (!token) return;
    if (!S.songKey) { status.textContent = "Local file — no repo path. Use Copy/Download."; return; }
    btn.disabled = true;
    status.textContent = "Publishing…";
    try {
      await publishSong(S.songKey, ghHeaders(token), m => status.textContent = m); // annotations only: publishSong's own hisMusic check skips the .mid
      status.textContent = folderActive() ? "Published ✓ to " + fsRoot.name + "."
                                          : "Published ✓ (GitHub Pages takes ~1 min to serve the new file.)";
      syncPublishedOne();
    } catch (err) { status.textContent = "Publish failed: " + err.message; }
    finally { btn.disabled = false; }
  });
}

export function initSheets8() {
  document.getElementById("ghsaveall").addEventListener("click", () => {
    const status = document.getElementById("syncstatus");
    const token = takeToken(status);
    if (!token) return;
    const job = publishAllJobStart(s => { status.textContent = s; });
    if (!job) return;
    syncSheetRelease();
    openPubJobSheet(job);
  });
}

export function initSheets9() {
  try { // a job still "running" in the mirror = the page died mid-way; the row keeps its last counts (this replaced the sessionStorage capture beacon, 2026-09-27)
    const j = jobsLoad();
    if (j) {
      const msg = "⚠ interrupted: " + j.title + " " + jobProgress(j) + " — tap ⏳ to see or retry";
      setInfo(msg);
      setTimeout(() => setInfo(msg), 2500); // outlive whatever boot writes over it
    }
  } catch (err) { /* no mirror */ }
}
