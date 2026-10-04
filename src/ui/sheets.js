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
import { ASK_GENERAL_LOG } from "../ask/bridge.js";
import { takeToken } from "../sync/publish.js";
import { ghHeaders } from "../audio/chip.js";
import { ASK_GENERAL_KEY } from "../ask/bridge.js";
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
import { saveDraft } from "./chrome.js";
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
import { tonicPcOfName } from "../theory/key.js";
import { chordAt } from "../gen/bassist.js";
import { nextChange } from "../gen/bassist.js";
import { isLocalDraft } from "../model/edits.js";
import { editsKey } from "../model/edits.js";
import { updateClearBtn } from "../model/edits.js";
import { idbDraftPut } from "../platform/storage.js";
import { jobsNotify } from "../model/jobs.js";

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
  document.getElementById("pubjobnote").textContent = job.note || "";
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

export function draftWrite(key, doc) { // synchronous for the caller; the notes follow through the queue
  if (key.startsWith("local/")) return localDraftWrite(key, doc);
  if (draftInIdb(key)) {
    const {tracks, ...stub} = doc;
    stub.tracksRef = 1;
    idbDraftPut(key, tracks);
    localStorage.setItem(draftStoreKey(key), JSON.stringify(stub));
  } else localStorage.setItem(draftStoreKey(key), JSON.stringify(doc));
}

// Local/ songs (2026-10-02 — see "Local song persistence" in NIGHT-ROLL.md):
// every edit rewrites the whole draft (saveEdits), and the app can be killed
// right after one (an install relaunch). The IndexedDB put is queued, so a
// stub alone in localStorage could claim notes that never landed. So a
// local draft is written WHOLE to localStorage — synchronous, the copy load
// reads — whenever it fits (500k chars; local songs are usually far
// smaller), and its notes go to IndexedDB too, so a song that later grows
// past the cap loses at most the edits in flight, not everything since it
// last fit. Every write carries seq (stored seq + 1); the IndexedDB record
// is {seq, tracks}. Past the cap, or when the store is full: stub + IDB as
// before, logged once — the last edit is crash-safe only once the put lands.
// Returns true (stored) or the put's promise (true once landed).
export function localDraftWrite(key, doc) {
  // seq is the LAST key written (below), so the last "seq": in the stored
  // JSON is it — no parse of a whole song on every edit (a "seq": inside a
  // string would be escaped, \"seq\")
  const old = localStorage.getItem(draftStoreKey(key)) || "", at = old.lastIndexOf('"seq":');
  const prev = at < 0 ? 0 : parseInt(old.slice(at + 6), 10) || 0;
  doc = {...doc, seq: prev + 1};
  const idb = typeof indexedDB !== "undefined";
  const landed = idb ? idbDraftPut(key, {seq: doc.seq, tracks: doc.tracks}) : true;
  const whole = JSON.stringify(doc);
  if (!idb || whole.length <= 500000) {
    try { localStorage.setItem(draftStoreKey(key), whole); return true; }
    catch (err) { if (!idb) throw err; } // full: the stub below is smaller
  }
  if (localDraftWrite.warned !== key) { localDraftWrite.warned = key; logErr(key.split("/").pop() + " is too big to keep whole on this device — its newest edit is safe only a moment after you make it (IndexedDB)"); }
  const {tracks, ...stub} = doc;
  stub.tracksRef = 1;
  localStorage.setItem(draftStoreKey(key), JSON.stringify(stub));
  return landed;
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
export function undoTrackAdd(ti, lenBefore) { // fold a generator's own entry (if it pushed one) into the same step
  const own = S.editUndo.length > lenBefore ? S.editUndo.pop() : null;
  pushUndo(own ? {kind: "group", entries: [{kind: "trackRemove", ti}, own]} : {kind: "trackRemove", ti});
}
