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
import { tonicPcOfName } from "../theory/key.js";
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
import { instPlayer } from "../audio/voices.js";
import { instSamples } from "../audio/voices.js";
import { FOLDER_NAMES } from "../model/catalog.js";
import { instLibrary } from "../audio/voices.js";
import { songRow } from "./chrome.js";
import { bsGenerate } from "../gen/bassist.js";
import { drGenerate } from "../gen/drummer.js";

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
    const src = S.audio.createBufferSource(); src.buffer = buf; src.connect(S.master); src.start(t);
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
    const r0 = (() => { const sec = S.rollnotes.find(n => n.section && n.start <= S.playCursor && (n.end || n.start + bt) > S.playCursor); return sec; })();
    // never default onto a track with notes in range: new track wins then
    tsel.value = "new";
    if (bi >= 0) {
      const t0g = r0 ? r0.start : 0, t1g = r0 ? (r0.end || t0g + bt) : S.songEndTick;
      const has = S.song.tracks[bi].notes.some(n => !n.gone && n.t < t1g && n.t + n.d > t0g);
      if (!has) tsel.value = String(bi);
    }
  }
  const sec = S.rollnotes.find(n => n.section && n.start <= S.playCursor && (n.end || n.start + bt) > S.playCursor);
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
  const sec = S.rollnotes.find(n => n.section && n.start <= S.playCursor && (n.end || n.start + bt) > S.playCursor);
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
    const n = S.rollnotes.filter(x => x.chord && !x.section && x.start >= r.t0 && x.start < r.t1).length;
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
      document.getElementById("drfollow").value = tk.followTi !== undefined ? "t" + tk.followTi : follow;
      segSet("drfeel", feel);
      document.getElementById("drfrom").value = tk.from;
      document.getElementById("drto").value = tk.to;
      if (tk.q) { setBeatPair("drfromq", "drfroms", tk.q[0]); setBeatPair("drtoq", "drtos", tk.q[1]); }
      const k = drGenerate(tk.seed, {busy, hard, follow, feel, fillAmt, parts: tk.parts ?? "all", followTi: tk.followTi,
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
