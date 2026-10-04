import { connected } from "../sync/publish.js";
import { S, prof } from "../state.js";
import { setInfo, logErr, logDebug, draw, updateSongBtn, updateSyncBtn, srAnnounce, scheduleBackupFlush } from "../hooks.js";
import { setControl } from "./controls.js";
import { logLines } from "../model/jobs.js";
import { askSeenMax } from "../ask/bridge.js";
import { logPush } from "../model/jobs.js";
import { appErrors } from "../model/jobs.js";
import { appDebug } from "../model/jobs.js";
import { debugLogOn } from "../model/jobs.js";
import { appMode } from "../platform/mode.js";
import { chip } from "../audio/chip.js";
import { setDocTitle } from "../platform/base.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { folderTitle } from "../model/catalog.js";
import { folderOf } from "../model/catalog.js";
import { songWhereLabel } from "../ask/context.js";
import { askUnsavedCount } from "../ask/bridge.js";
import { songUnsaved } from "../model/versions.js";
import { nativeFs } from "../platform/folder.js";
import { estimateKey } from "../model/song.js";
import { sfShownAt } from "../model/song.js";
import { curTick } from "../render/roll.js";
import { degreeOf } from "../render/instrument.js";
import { spellPc } from "../theory/chords.js";
import { instResize } from "../render/instrument.js";
import { updateInstRange } from "../render/instrument.js";
import { iconSvg } from "./icons.js";
import { mixerIsOpen } from "./mixer.js";
import { isComposition } from "../model/provenance.js";
import { analysisAvailable } from "../platform/mode.js";
import { showAddedOutline } from "../render/roll.js";
import { secDepthCap } from "../model/grid.js";
import { chipTrackNo } from "../audio/chip.js";
import { chipAlbumHasSource } from "../audio/chip.js";
import { chipStopSrcs } from "../audio/chip.js";
import { chipPreviewCache } from "../audio/chip.js";
import { keyNameAt } from "../model/song.js";
import { draftKeys } from "../model/versions.js";
import { albumMetaFor } from "../model/provenance.js";
import { isCaptureKey } from "../model/provenance.js";
import { draftStoreKey } from "../platform/storage.js";
import { canvas } from "../render/roll.js";
import { wrap } from "../render/roll.js";
import { ctx } from "../render/roll.js";
import { updateTrackMore } from "./trackbar.js";
import { rangeSelPersist } from "../render/roll.js";
import { viewPersistSoon } from "../render/roll.js";
import { PERF_NOSCENE } from "../platform/base.js";
import { fallActive } from "../render/roll.js";
import { drawInst } from "../render/instrument.js";
import { secToTick } from "../midi/parse.js";
import { playSec } from "../audio/transport.js";
import { pxPerTick } from "../render/roll.js";
import { css } from "../render/roll.js";
import { drawStripPlayhead } from "../render/roll.js";
import { barTicks } from "../model/rollnotes.js";
import { updateEditButtons } from "./note-editor.js";
import { drawFall } from "../render/instrument.js";
import { VF } from "../render/score.js";
import { drawScore } from "../render/score.js";
import { drawRuler } from "../render/roll.js";
import { stripPlayheadX } from "../render/roll.js";
import { drawTracks } from "../render/tracks.js";
import { topRow } from "../render/roll.js";
import { botRow } from "../render/roll.js";
import { inKitLane } from "../render/roll.js";
import { kitLaneTop } from "../render/roll.js";
import { drawRangeTints } from "../render/roll.js";
import { beatTicks } from "../model/grid.js";
import { effTs } from "../model/grid.js";
import { gridAnchorTick } from "../model/grid.js";
import { trackShown } from "../render/roll.js";
import { trackColor } from "../render/roll.js";
import { trackAudible } from "../audio/engine.js";
import { noteRow } from "../render/roll.js";
import { drawCompare } from "../render/compare.js";
import { drawLasso } from "../render/roll.js";
import { BASE_RULER_H } from "../render/roll.js";
import { LANE_H } from "../render/roll.js";
import { laneBotRow } from "../render/roll.js";
import { kitSlots } from "../render/roll.js";
import { DRUM_LABELS } from "../render/roll.js";
import { pieceState } from "../audio/engine.js";
import { pieceAudible } from "../audio/engine.js";
import { SCORE_INTRO_W } from "../render/score.js";
import { tracksLaneH } from "../render/tracks.js";
import { scoreContentH } from "../render/score.js";
import { isLocalDraft } from "../model/edits.js";
import { draftWrite } from "../model/versions.js";
import { draftDoc } from "../model/versions.js";
import { editableSong } from "../model/song.js";
import { baseName } from "../model/rollnotes.js";
import { overlayNoteSig } from "../model/edits.js";
import { updateClearBtn } from "../model/edits.js";
import { idbDraftGet } from "../platform/storage.js";
import { serializeRollnotes } from "../model/rollnotes.js";
import { aiUrl } from "../ask/backend.js";
import { aiHeaders } from "../ask/backend.js";
import { nativeDirHandle } from "../platform/folder.js";
import { folderWrite } from "../platform/folder.js";
import { writeMidi } from "../midi/write.js";
import { serializeRollnotesStamped } from "../model/rollnotes.js";
import { notesTxtFor } from "../model/rollnotes.js";
import { updateChipBtn } from "../hooks.js";
import { ownFolderPath } from "../model/provenance.js";
import { LINK_SONGS } from "../platform/base.js";
import { originOf } from "../model/provenance.js";
import { updateSubtitle } from "../hooks.js";
import { refreshKeysetLabel } from "./notes.js";
import { isDirective } from "../model/rollnotes.js";
import { activeNoteAt } from "../render/roll.js";
import { sectionPathAt } from "../render/roll.js";
import { playGateKick } from "../audio/transport.js";
import { chipSource } from "../audio/chip.js";
import { chipRenderAuto } from "../audio/chip-stream.js";
import { readData } from "../platform/folder.js";
import { folderActive } from "../platform/folder.js";
import { parseMidi } from "../midi/parse.js";
import { cmpDiff } from "../render/compare.js";
import { stop } from "../audio/transport.js";
import { cmpTrackKey } from "../render/compare.js";
import { computeSongEnd } from "../model/song.js";
import { play } from "../audio/transport.js";
import { isUnsaved } from "../model/provenance.js";
import { catalogHas } from "../model/catalog.js";
import { wmInnerHeight } from "./wm.js";
import { drawVelLane, toggleVelLane } from "./vellane.js";
import { openDraft } from "../session/song.js";
import { idbDraftDelete } from "../platform/storage.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { clampView } from "../hooks.js";
import { recentSongs } from "../platform/base.js";
import { saveRecentSongsRaw } from "../platform/base.js";
import { groupOf } from "../model/catalog.js";
import { folderTree } from "../model/catalog.js";
import { subfolderKeys } from "../model/catalog.js";
import { segTitle } from "../model/catalog.js";
import { nodeCount } from "../model/catalog.js";
import { publishedLabel } from "../model/catalog.js";
import { publishedPaths } from "../model/catalog.js";
import { nodeAt } from "../model/catalog.js";
import { parentFolder } from "../model/catalog.js";
import { albumHasTrackData } from "../model/album-order.js";
import { albumOrderControl } from "../model/album-order.js";
import { albumEffectiveOrder } from "../model/album-order.js";
import { rememberLastSong } from "../platform/base.js";
import { reflectSongURL } from "../session/song.js";
import { loadSong } from "../session/song.js";
import { initCatalog } from "../model/catalog.js";
import { TRACKS_GUTTER } from "../render/roll.js";
import { RULER_W_ROLL } from "../render/roll.js";
import { clearRecentSongs } from "../platform/base.js";
import { albumClear } from "../session/album.js";
import { stretchCache } from "../audio/clips.js";
import { stretchEnsureAll } from "../audio/clips.js";
import { updateSongMetaImpl as updateSongMeta } from "../session/song.js";
import { tickToSec } from "../midi/parse.js";
import { openEditor } from "./note-editor.js";
import { BENIGN_ERRORS } from "../model/jobs.js";
import { logLine } from "../model/jobs.js";
import { askCopyText } from "./sheets.js";
import { playGateTick } from "../audio/transport.js";
import { scoreTickToX } from "../render/score.js";
import { setVolBtn } from "./controls.js";
import { MASTER_VOL } from "../audio/engine.js";
import { trackIsDrums } from "../model/grid.js";
import { toggleMixer } from "./mixer.js";
import { setAppMode } from "../platform/mode.js";
import { computeAnalysisLayer } from "../gen/analysis.js";
import { setAddedOutline } from "../render/roll.js";
import { openGridSheet } from "./sheets.js";
import { adoptChordBand } from "../gen/analysis.js";
import { adoptKeyRegion } from "../gen/analysis.js";
import { adoptAllChords } from "../gen/analysis.js";
import { editUndoPop } from "./note-editor.js";
import { editRedoPop } from "./note-editor.js";
import { openPasteTo } from "./sheets.js";
import { removeDuplicateNotes } from "../model/selection.js";
import { openInsertBars } from "./sheets.js";
import { openDeleteBars } from "./sheets.js";
import { openDrummer } from "./sheets.js";
import { openBassist } from "./sheets.js";
import { fillFolderSelect } from "../session/files.js";
import { importDraftKeys } from "../import/capture.js";
import { publishLabel } from "./sheets.js";
import { publishDest } from "./sheets.js";
import { chosenFolder } from "../model/provenance.js";
import { moveComposition } from "../session/files.js";
import { renderInstSheet } from "./sheets.js";
import { fsubFolder } from "../import/hub.js";
import { fsubAlbums } from "../import/hub.js";
import { createComposition } from "../session/files.js";
import { openSaveForm } from "../session/files.js";
import { makeItMine } from "../session/files.js";
import { forkCurrentSong } from "../session/files.js";
import { publishUnsavedSong } from "../sync/publish.js";
import { saveSongAs } from "../session/files.js";
import { renameImportDraft } from "../import/capture.js";
import { slugify } from "../model/provenance.js";
import { writeToken } from "../sync/publish.js";
import { renameRepoTitle } from "../sync/publish.js";
import { ghHeaders } from "../audio/chip.js";
import { editHereNow } from "../session/files.js";
import { saveVersion } from "../session/files.js";
import { openVersionsSheet } from "./sheets.js";
import { ensureAudio } from "../audio/engine.js";
import { resumeAudio } from "../audio/engine.js";
import { renderSongOffline } from "../audio/bounce.js";
import { audioBufferToWav } from "../audio/bounce.js";
import { recordRealtimeAudio } from "../audio/bounce.js";
import { deliverAudioFile } from "../audio/bounce.js";
import { exportScore } from "../render/score-print.js";
import { openSyncSheet } from "./sheets.js";
import { EDITION } from "../edition.js";

export function updateSyncBtnImpl() {
  const btn = document.getElementById("syncbtn");
  if (!connected()) { btn.style.display = "none"; return; } // Model B: not connected anywhere = no footer Publish button
  btn.style.display = "";
  const n = pendingSongs().length;
  btn.textContent = n ? "Publish (" + n + ")" : "Publish"; // one pending song is a count too (Josh: "the publish doesn't have a one"); shows even at N=0 once connected
}
export function appConfirmImpl(title, body, okLabel, cancelLabel) { // non-blocking confirm:
  // window.confirm freezes the main thread AND every automation/CDP command
  // (the invisible-dialog page-freeze class, found by Josh 2026-08-19)
  return new Promise(res => {
    const sheet = document.getElementById("confirmsheet");
    document.getElementById("cfTitle").textContent = title;
    document.getElementById("cfBody").textContent = body;
    const ok = document.getElementById("cfOk"), cancel = document.getElementById("cfCancel");
    ok.textContent = okLabel || "OK";
    cancel.textContent = cancelLabel || "Cancel";
    const done = v => { sheet.classList.remove("on"); ok.onclick = cancel.onclick = null; res(v); };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    sheet.classList.add("on");
  });
}
export function updateJobsBtnImpl() {
  const b = document.getElementById("jobsbtn");
  if (!b) return;
  const running = S.jobs.filter(j => j.state === "running" || j.state === "queued").length;
  const rest = S.jobs.length - running;
  b.style.display = running ? "" : "none"; // only while something runs (Josh, 2026-10-01); finished jobs stay reviewable in View ▾ → Jobs
  // setControl (docs/split-plan.md §4 step 2) is the one place that rebuilds
  // a control's whole innerHTML — see src/ui/controls.js's own comment for
  // why (same vm-harness querySelector gap the icon audit already worked
  // around here).
  setControl("jobsbtn", {label: running ? String(running) : "", aria: running ? running + " running — open the jobs list" : rest + " finished — open the jobs list"});
  b.style.color = running ? "var(--gold)" : "var(--dim)";
  // View ▾ → BACKGROUND → ⏳ Jobs (chrome density follow-up, 2026-10-01 pm):
  // reaches the same jobs sheet even with #jobsbtn hidden (no jobs at all) —
  // it's the one place a finished/failed/interrupted job is still reviewable
  // once the footer button has nothing running left to show. Running count
  // only (not "N finished") — same "something's happening" signal #jobsbtn
  // itself gives, just findable from the menu too.
  setControl("vwJobs", {label: "  Jobs" + (running ? " · " + running + " running" : "")});
}
export function errChip() { // the number shown is UNREAD (new since the last chat message sent to a bridge backend, any chat — askSeenMax); Mark-as-read, 2026-09-30
  const b = document.getElementById("errbtn");
  if (!b) return;
  const lines = logLines();
  const max = askSeenMax().err;
  const n = lines.filter(l => l.id > max).length;
  // chrome density follow-up (2026-10-01 pm, Josh's ruling): the footer chip
  // is reachable from View ▾ → Messages at any time now (always present
  // there) — it only needs to claim footer space for UNREAD messages, not
  // merely a non-empty log (a read-and-dismissed log used to keep it lit).
  b.style.display = n ? "" : "none";
  setControl("errbtn", {label: String(n)}); // setControl (src/ui/controls.js) — see updateJobsBtn's comment
  // View ▾ → BACKGROUND → Messages: always reachable (unlike #errbtn
  // itself), so an already-read log is still one tap away to re-check.
  setControl("vwMessages", {label: "  Messages" + (n ? " · " + n : "")});
}
export function logErrImpl(msg) { logPush(appErrors, msg); errChip(); }
export function logDebugImpl(msg) { logPush(appDebug, msg); console.log("[debug] " + msg); if (debugLogOn()) errChip(); }
export function srAnnounceImpl(text) {
  if (typeof document === "undefined" || !text || text === S.srLastText) return;
  const el = document.getElementById("srlive");
  if (!el) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const emit = () => { S.srLastText = text; S.srLastAt = now; el.textContent = text; };
  const elapsed = now - S.srLastAt;
  if (elapsed >= 250) { if (S.srTimer) { clearTimeout(S.srTimer); S.srTimer = null; } emit(); }
  else { if (S.srTimer) clearTimeout(S.srTimer); S.srTimer = setTimeout(emit, 250 - elapsed); }
}
// Status history (2026-09-30, bridge context block — Josh: every message to
// the Mac should carry what changed since his last one): setInfo kept no
// history before this, just the current line (infoFull) the strip and
// #infosheet showed. A small capped ring buffer, ids like appErrors/appDebug
// so askNewSinceLines can filter "new since a chat's cursor" the same way.
export const STATUS_HISTORY_CAP = 50;
export function setInfoImpl(s, copyText) {
  if (/⚠|failed|error|can't|cannot|unavailable/i.test(s)) logErr(s); // warnings survive being overwritten
  // mode tagged at push time, same reason as logPush above: a Normal-mode
  // status line (a chord/key name the selection strip shows) must never
  // surface in a Learning-mode bridge context later in the same session
  S.statusHistory.push({id: ++S.statusSeq, t: Date.now(), text: s, mode: appMode()});
  if (S.statusHistory.length > STATUS_HISTORY_CAP) S.statusHistory.shift();
  const el = document.getElementById("noteinfo");
  el.textContent = s;
  srAnnounce(s);
  S.infoFull = s;
  S.infoCopyText = copyText || null;
  el.classList.toggle("copyable", !!S.infoCopyText);
  if (S.infoCopyText) {
    const chip = document.createElement("span");
    chip.className = "copychip";
    chip.textContent = "⧉ copy";
    el.appendChild(chip);
  }
}
export function updateSongBtnImpl() { // breadcrumb: Album › Title, with the real path dimmed after
  songtitleEl.innerHTML = "";
  setDocTitle(S.currentPath ? songTitleOf(S.currentPath) : null);
  if (!S.currentPath) return;
  const group = Object.entries(S.CATALOG).find(([, songs]) => songs.some(([, p]) => p === S.currentPath));
  const local = localStorage.getItem("ff1roll-draft-" + S.currentPath) !== null;
  const folder = group ? group[0] : local ? folderTitle(folderOf(S.currentPath)) : null;
  const where = document.createElement("span");
  where.className = "crumbwhere";
  where.style.color = "var(--dim)";
  where.textContent = songWhereLabel(S.currentPath) + "\u00a0›\u00a0"; // nbsp: a flex item drops its edge spaces
  songtitleEl.appendChild(where);
  if (folder) {
    const crumb = document.createElement("span");
    crumb.className = "crumbfolder"; // shrinks before the title (header CSS: flex-shrink 1000x crumbtitle's)
    crumb.style.color = "var(--dim)";
    crumb.textContent = folder + "\u00a0›\u00a0";
    songtitleEl.appendChild(crumb);
  }
  const title = document.createElement("span");
  title.className = "crumbtitle"; // shrinks last -- truncates only once the folder's fully squeezed
  title.textContent = songTitleOf(S.currentPath);
  songtitleEl.appendChild(title);
  const chat = askUnsavedCount();
  const unsaved = songUnsaved();
  if ((unsaved || chat) && connected()) { // "not published yet": hidden entirely when nothing is connected (Model B) — a local-only user's work is always kept, Versions are the save points
    const dot = document.createElement("span");
    dot.textContent = "\u00a0●";
    dot.className = "crumbdot";
    dot.style.color = "var(--gold)";
    dot.setAttribute("aria-label", unsaved ? "Unpublished changes" : chat + " chat messages not saved");
    songtitleEl.appendChild(dot);
  }
}
export function songRow(label, onTap, dim) {
  const row = document.createElement("div");
  row.className = "noterow";
  row.setAttribute("role", "button");
  const body = document.createElement("span");
  body.className = "body";
  if (dim) body.style.color = "var(--dim)";
  body.textContent = label;
  row.appendChild(body);
  row.addEventListener("click", onTap);
  return row;
}
export function songHeader(text) { // a section line: LOCAL / PUBLISHED
  const h = document.createElement("div");
  h.className = "meta";
  h.style.cssText = "padding:8px 4px 0;letter-spacing:.1em;white-space:normal;text-align:left";
  h.textContent = text;
  return h;
}
export function localLabel() { return "LOCAL · " + (nativeFs() ? "this iPad" : "this device"); }
export function expandKeyName(name) { // "Gm" -> "G minor", "C" -> "C major" — for the keysel label
  const m = /^([A-G][#b]?)(m?)$/.exec(name || "");
  return m ? m[1] + " " + (m[2] === "m" ? "minor" : "major") : (name || "");
}
// keyLabelState (P4): the #keyunset text, built from data — used by
// finalizeNotes to SET the label and by askContext (Learning) to read the
// identical text without touching the DOM (the leak this fixed: askContext
// used to read the live label, which in Normal now says "(estimated)").
export function keyLabelState() {
  const partials = S.rollnotes.filter(n => n.keypartial).map(n => n.keypartial + "?");
  // Normal, nothing declared or stored: offer the estimate, labelled, with
  // a one-tap way to promote it to a real key: annotation. Learning never
  // reaches the estimate branch — appMode() gates it, so estimateKey() is
  // never called there (see the spy test).
  const est = !S.keyRegions.length && !partials.length && appMode() === "normal" ? estimateKey() : null;
  const text = S.keyRegions.length
    ? "key: " + S.keyRegions.map(r => r.name + (r.b2 ? "(" + r.b1 + "–" + r.b2 + ")" : "")).join(", ") + " ✓"
    : partials.length
    ? "key: " + partials.join(", ") + " — tonic stored, NOT applied"
    : est
    ? "key: " + expandKeyName(est.name) + " (estimated) — tap to set"
    : "key: not set (C)";
  return {text, est};
}
export const findsel = document.getElementById("findsel");
export function refreshFindSel() { // respell the 12 options per the governing (or, Normal, estimated) key
  const sf = sfShownAt(curTick());
  while (findsel.options.length > 1) findsel.remove(1);
  for (let pc = 0; pc < 12; pc++) {
    const o = document.createElement("option");
    o.value = String(pc);
    const deg = typeof degreeOf === "function" ? degreeOf(pc, keyNameShownAt(curTick())) : null;
    o.textContent = spellPc(pc, sf) + (deg ? " · " + deg : "");
    findsel.appendChild(o);
  }
  findsel.value = S.findPc === null ? "" : String(S.findPc);
}
export function applyChrome() {
  document.getElementById("editrow").style.display = S.editrowHidden ? "none" : "";
  // footer v2 (2026-09-30): a class, not style.display="none" — folding
  // must hide only line 2 (footer.folded > :not(#readline)), never the
  // readout; listener mode still hides the whole footer (its own CSS rule).
  document.getElementById("footer").classList.toggle("folded", S.footerHidden);
  document.getElementById("panelshow").style.display = S.footerHidden ? "" : "none";
  localStorage.setItem("ff1roll-editrow-hidden", S.editrowHidden ? "1" : "0");
  localStorage.setItem("ff1roll-footer-hidden", S.footerHidden ? "1" : "0");
  window.dispatchEvent(new Event("resize")); // canvas reclaims the space
  renderViewMenu();
  fitReadline(); // line 2 just appeared/disappeared wholesale — the leftover for #readline changed
}
// #readline, never crushed (chrome density pass, 2026-10-01): the footer's
// OTHER visible buttons (by id — the vm harness never builds a real
// #footer->children tree, see the "no real parent/child tree" comment
// elsewhere in this file, so a traversal would find nothing there) plus the
// gaps between them is what's left for #readline; under 300px it gets
// .ownrow (its own full-width row, order:-1 — today's own-row layout,
// CSS) instead of shrinking past a usable readout. A plain width sum, not
// pixel-perfect (no computed padding/border math) — good enough for a
// yes/no at the 300px line, and exactly what the stubbed-width tests drive.
export const FOOTER_DROPUP_BTN_IDS = ["viewbtn", "lassobtn", "instbtn", "listbtn", "errbtn", "askreplybtn", "clearbtn", "syncbtn", "jobsbtn"];
export function fitReadline() {
  const foot = document.getElementById("footer"), rl = document.getElementById("readline");
  const fr = foot.getBoundingClientRect();
  if (!fr || !fr.width) return; // not laid out yet (display:none, etc.)
  const PAD = 24, GAP = 8; // footer's own padding (8px 12px) and gap (8px) — see footer CSS
  let used = 0, n = 0;
  for (const id of FOOTER_DROPUP_BTN_IDS) {
    const b = document.getElementById(id);
    if (!b || b.style.display === "none") continue;
    used += b.getBoundingClientRect().width;
    n++;
  }
  const leftover = fr.width - PAD - used - GAP * n; // n gaps between the visible buttons and #readline
  rl.classList.toggle("ownrow", leftover < 300);
}
export function scheduleFitReadline() {
  if (S.fitReadlineScheduled) return;
  S.fitReadlineScheduled = true;
  requestAnimationFrame(() => { S.fitReadlineScheduled = false; fitReadline(); });
}
export const viewbtn = document.getElementById("viewbtn");
// a drop-up (#viewswitchmenu, 2026-10-01) — its label names the CURRENT view, not the next one
export const viewSwitchMenu = document.getElementById("viewswitchmenu");
export function renderViewSwitch() { // ✓ on the current view's row — same convention as renderViewMenu's checkmarks
  setControl("vsRoll", {icon: "gridView", cls: "", label: "  Roll", prefix: S.viewMode === "roll" ? "✓ " : "   "});
  setControl("vsTracks", {icon: "tableRows", cls: "", label: "  Tracks", prefix: S.viewMode === "tracks" ? "✓ " : "   "});
  setControl("vsScore", {glyph: "𝄞", cls: "", label: "  Score", prefix: S.viewMode === "score" ? "✓ " : "   "});
}
// each view keeps its own zoom and scroll, per song, this session (Josh,
// 2026-09-29: a fully zoomed-out roll came back from Score at ~6 bars —
// Score raises pxq to what engraving can space). Restored BEFORE
// applyViewMode, whose clamps would otherwise act on the other view's numbers.
export const viewSaved = new Map();
export const instbtn = document.getElementById("instbtn");
export const instFallBtn = document.getElementById("instfall");
export function applyInst() {
  document.getElementById("instpanel").classList.toggle("on", S.instOpen);
  instbtn.classList.toggle("active", S.instOpen);
  instbtn.setAttribute("aria-pressed", String(S.instOpen));
  document.getElementById("insttab-piano").classList.toggle("active", S.instTab === "piano");
  document.getElementById("insttab-piano").setAttribute("aria-selected", String(S.instTab === "piano"));
  document.getElementById("insttab-guitar").classList.toggle("active", S.instTab === "guitar");
  document.getElementById("insttab-guitar").setAttribute("aria-selected", String(S.instTab === "guitar"));
  instFallBtn.classList.toggle("active", S.fallOn);
  instFallBtn.setAttribute("aria-pressed", String(S.fallOn));
  applyInstBar();
  if (S.instOpen) instResize(); // canvas had zero size while display:none
}
// the keyboard's own controls in #instbar: Play/Scroll, ‹ range ›, lock and
// Sustain. The guitar neither scrolls nor locks, so those hide on its tab;
// Sustain rings a tapped fret too, so it stays.
export function applyInstBar() {
  const piano = S.instTab === "piano";
  for (const id of ["instmodeseg", "instoctdn", "instrange", "instoctup", "instlock"]) document.getElementById(id).hidden = !piano;
  const scroll = S.instMode === "scroll";
  document.getElementById("instplay").classList.toggle("active", !scroll);
  document.getElementById("instplay").setAttribute("aria-checked", String(!scroll));
  document.getElementById("instscroll").classList.toggle("active", scroll);
  document.getElementById("instscroll").setAttribute("aria-checked", String(scroll));
  const lock = document.getElementById("instlock");
  lock.classList.toggle("active", S.instLock);
  lock.setAttribute("aria-pressed", String(S.instLock));
  setControl("instlock", {glyph: S.instLock ? "🔒" : "🔓", aria: S.instLock ? "Keyboard locked — tap to let it scroll again" : "Lock the keyboard where it is"});
  document.getElementById("instoctdn").disabled = S.instLock;
  document.getElementById("instoctup").disabled = S.instLock;
  const sus = document.getElementById("instsustain");
  sus.classList.toggle("active", S.instSustain);
  sus.setAttribute("aria-pressed", String(S.instSustain));
  if (piano) updateInstRange();
}
// #subbtn retired from the footer (footer v2, 2026-09-30): View ▾ → 💬 Notes
// strip is the only control now — vwSub calls this directly instead of
// clicking a hidden button. #subbtn itself stays as a hidden, inert node
// (kept in the footer markup) only so anything still reading its
// active/aria-pressed state for the old on/off visuals keeps working.
export const subbtn = document.getElementById("subbtn");
// the last recognizer stopped, until its late result lands or a new one starts
export function micStop(discard) {
  if (S.micRec) {
    // Safari delivers the final transcript AFTER stop() — on iPad that is
    // where most of the words arrive, so a tapped ■ Stop (or Safari's own
    // silence end) must leave onresult attached or the last sentence is
    // lost (Josh, 2026-09-26: "the speaker button doesn't work"). Only a
    // caller that clears or closes the box discards it: Send once had a
    // late result refill the box it had just emptied.
    S.micRec.onend = S.micRec.onerror = null;
    if (discard) S.micRec.onresult = null; else S.micPrev = S.micRec;
    try { S.micRec.stop(); } catch (err) { /* already stopped */ }
  }
  S.micRec = null;
  if (S.micBtn) { S.micBtn.classList.remove("active"); S.micBtn.innerHTML = iconSvg("mic", "txt") + "Speak"; }
  else { nmic.classList.remove("active"); nmic.innerHTML = iconSvg("mic", "txt") + "Speak"; }
  S.micBtn = null;
}
export function renderViewMenu() { // ✓ = visible; labels never shift (fixed 2-char state column)
  // Each row's whole innerHTML is rebuilt every call: "✓ "/"   " + an icon
  // (Material svg, via iconSvg()) or a KEEP glyph + the label text. No
  // child-element lookup (querySelector/by-class) anywhere here — the vm
  // harness's element stubs (tests/harness.mjs) only implement
  // innerHTML/textContent/children, not querySelector, and this function
  // runs on every boot (icon audit, 2026-10-02; see NIGHT-ROLL.md
  // "Material icons").
  const set = (id, on, dim) => {
    const b = document.getElementById(id);
    if (!b) return;
    const v = base[id];
    setControl(id, v.icon ? {icon: v.icon, cls: "", label: v.text, prefix: on ? "✓ " : "   "}
                          : {glyph: v.glyph, cls: "", label: "  " + v.text, prefix: on ? "✓ " : "   "});
    b.style.opacity = dim ? 0.55 : 1;
  };
  const base = {
    vwRoll: {icon: "gridView", text: "Roll"},
    vwScore: {glyph: "𝄞", text: "Score view"},
    vwListener: {icon: "radio", text: "Listener mode"},
    vwTracksView: {icon: "tableRows", text: "Tracks view"},
    vwMixer: {icon: "tune", text: "Mixer"},
    vwTracks: {glyph: "◂", text: "Tracks"},
    vwEdit: {icon: "construction", text: "Edit toolbar"},
    vwAdded: {glyph: "┄", text: "Outline new notes"},
    vwFooter: {icon: "viewAgenda", text: "Bottom bar"},
    vwInst: {icon: "piano", text: "Instrument panel"},
    vwSub: {glyph: "💬", text: "Notes strip"},
    vwVel: {icon: "barChart", text: "Velocity lane"},
    vwCompare: {icon: "compareArrows", text: "Compare with repo"},
    vwAnalyze: {icon: "search", text: "Analyze ▸"},
    vwLearning: {glyph: "🎓", text: "Learning mode"},
  };
  // VIEW group is a radio, not independent toggles: exactly one of these three is ✓
  set("vwRoll", S.viewMode === "roll");
  set("vwScore", S.viewMode === "score");
  set("vwTracksView", S.viewMode === "tracks");
  // Accordion: at most one of the six View ▾ groups open at a time
  // (vwOpenGroup), every header/content pair sharing the same ▸/▾ +
  // aria-expanded + display convention "View type ▸" always used (ruling
  // #4, 2026-10-01 pm). The table is built fresh on every call (not a
  // top-level const) — renderViewMenu can run during boot before later
  // top-level `let`s (e.g. `jobs`) are past their TDZ, the same reason
  // vwOpenGroup itself had to move into the early boot-safe block; a local
  // table sidesteps that instead of needing its own early declaration.
  // Background's running-jobs count is read off #vwJobs's OWN text
  // (updateJobsBtn's write) rather than the `jobs` array directly, for the
  // same reason.
  const groups = {
    view: {hdr: "vwViewType", row: "vwViewTypeRow",
      label: () => "View type: " + ({roll: "Roll", tracks: "Tracks view", score: "Score view"}[S.viewMode] || "Roll")},
    panels: {hdr: "vwPanels", row: "vwPanelsRow", label: () => "Panels"},
    tools: {hdr: "vwTools", row: "vwToolsRow", label: () => "Tools"},
    display: {hdr: "vwDisplay", row: "vwDisplayRow", label: () => "Display"},
    background: {hdr: "vwBackground", row: "vwBackgroundRow", label: () => {
      const m = document.getElementById("vwJobs").textContent.match(/· (\d+) running/);
      return "Background" + (m ? " · " + m[1] + " running" : "");
    }},
    mode: {hdr: "vwMode", row: "vwModeRow", label: () =>
      "Mode: " + (appMode() === "learning" ? "Learning" : "Normal") + (S.listenerMode ? " · Listener" : "")},
  };
  for (const [key, g] of Object.entries(groups)) {
    const open = S.vwOpenGroup === key;
    const hdr = document.getElementById(g.hdr);
    hdr.textContent = (open ? "▾  " : "▸  ") + g.label();
    hdr.setAttribute("aria-expanded", String(open));
    document.getElementById(g.row).style.display = open ? "" : "none";
  }
  set("vwMixer", mixerIsOpen());
  set("vwCompare", !!S.cmp, !(S.song && S.songKey && isComposition())); // dimmed where there is nothing to compare against
  // P6: Normal-mode only — the item is ABSENT (not dimmed) in Learning, same
  // discipline as every other Learning-mode hiding place (CLAUDE.md).
  const vwA = document.getElementById("vwAnalyze");
  vwA.style.display = analysisAvailable() ? "" : "none";
  if (analysisAvailable()) set("vwAnalyze", S.analysisOn);
  set("vwLearning", appMode() === "learning");
  set("vwListener", S.listenerMode);
  set("vwTracks", !document.getElementById("trackslide").classList.contains("off"));
  set("vwEdit", !S.editrowHidden, !S.editOn); // dimmed (not disabled) in read-only: the pref still flips
  set("vwFooter", !S.footerHidden);
  set("vwAdded", showAddedOutline());
  set("vwInst", typeof S.instOpen !== "undefined" && S.instOpen);
  set("vwSub", S.subOn);
  set("vwVel", S.vwVel);
  // vwGrid isn't in `base` (its label carries a dynamic "N/bar" suffix) — same setControl approach
  setControl("vwGrid", {label: "  Grid…" + (S.gridDiv ? "  " + S.gridDiv + "/bar" : ""), prefix: S.gridDiv ? "✓ " : "   "});
  const lvr = document.getElementById("vwLevelsRow"), lvd = document.getElementById("vwLevelsDiv");
  const has = S.secMaxDepth > 1;
  lvr.style.display = has ? "flex" : "none";
  lvd.style.display = has ? "" : "none";
  if (has) {
    const cur = Math.min(secDepthCap(), S.secMaxDepth - 1);
    document.getElementById("vwLevelsLbl").textContent = "▸ Section levels: " + (cur + 1) + " of " + S.secMaxDepth;
    document.getElementById("vwLevelsMinus").disabled = cur <= 0;
    document.getElementById("vwLevelsPlus").disabled = cur >= S.secMaxDepth - 1;
  }
}
// the currently open drop-up's own element, or null
export function closeDropUp() {
  if (S.dropUpOpen) S.dropUpOpen.classList.remove("on");
  S.dropUpOpen = null;
}

// ---------------------------------------------------------------- ui wiring
// two-level song picker: groups first, then that group's songs — a flat
// 43-entry dropdown got unusable once chip captures joined the catalog
export const songtitleEl = document.getElementById("songcrumb");
export function keyNameShownAt(tick) { // keyNameAt (declared), else the Normal estimate's name, else null
  const d = keyNameAt(tick);
  if (d !== null) return d;
  if (appMode() === "normal") { const est = estimateKey(); if (est) return est.name; }
  return null;
}
export const nmic = document.getElementById("nmic");
export function pendingSongs() { // every song with anything to ship, the open one first
  const set = new Set(dirtySongs());
  for (const k of draftKeys()) if (syncable(k) && draftDirtyState(k)) set.add(k);
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith("ff1roll-ask-")) continue;
    const key = k.slice("ff1roll-ask-".length);
    if (key === "general" || key === "terminal") { if (askUnsavedCount(k) > 0) set.add(key); continue; } // the general and terminal chats: no song, their own blocks — never syncable()
    if (key !== "local" && syncable(key) && askUnsavedCount(k) > 0) set.add(key);
  }
  return [...set].sort((a, b) => (a === S.songKey ? -1 : b === S.songKey ? 1 : 0) || a.localeCompare(b));
}

// ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function dirtySongs() { // songs with unsynced local notes on this device
  return Object.keys(localStorage)
    .filter(k => k.startsWith("ff1roll-notes-"))
    .map(k => k.slice("ff1roll-notes-".length))
    .filter(syncable); // same exclusions as syncable() below (local/, uncommitted captures)
}
// sync opened from the notes list → return there after commit
// review pane: every unsynced note on this device, grouped by song, so a
// commit is never a blind dialog — you see exactly what's outstanding
export function draftDirtyState(key) { // "never" (no save yet) | "edited" (since the last save) | null
  try {
    const d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null");
    if (!d || !d.dirty) return null;
    return d.savedStamp ? "edited" : "never";
  } catch (err) { return null; }
}
export function syncable(key) { // local/ has no repo path; an uncommitted capture draft (any console
  // folder, not just albums/imports/ — Bugs found, docs/provenance-plan.md
  // P0: a captured-but-uncommitted song's loop:/etc. annotations passed this
  // and could publish before the .mid existed) rides its own Commit, not Sync.
  // Once committed the draft is gone (isCaptureKey still says locked, via
  // album.json, but draftStoreKey(key) is null) and annotations sync normally.
  return !key.startsWith("local/") &&
         !(isCaptureKey(key) && localStorage.getItem(draftStoreKey(key)) !== null);
}

// ---------------------------------------------------------------- drawing
export function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = wrap.clientWidth * dpr;
  canvas.height = wrap.clientHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (typeof updateTrackMore === "function") updateTrackMore(); // wrap point moves with width
  draw();
}
export function drawImpl() { S.sceneValid = false; rangeSelPersist(); viewPersistSoon(); drawFull(false); }
drawImpl = prof("draw", drawImpl); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function playbackFrameImpl() {
  if (!S.song) { draw(); return; }
  if (PERF_NOSCENE) { drawFull(false); return; } // ?scene=0: never allocate the cache
  // Fall is a function of time, not of the view: every frame is a new picture,
  // and the roll's playhead means nothing over it. The scene cache below froze
  // it at the first frame and drew a gold line marching across (Josh, 2026-09-27,
  // Chrono Trigger: "the notes … are just stopped, and there's a cursor for
  // some reason scrolling across the screen")
  if (fallActive()) { S.sceneValid = false; drawFull(false); return; }
  if (S.instOpen) drawInst();
  const dpr = window.devicePixelRatio || 1;
  if (!S.sceneValid || S.view.x !== S.sceneVX || S.view.y !== S.sceneVY ||
      !S.sceneCanvas || S.sceneCanvas.width !== canvas.width || S.sceneCanvas.height !== canvas.height) {
    drawFull(true); // scene only — no playhead baked into the cache
    if (!S.sceneCanvas) S.sceneCanvas = document.createElement("canvas");
    if (S.sceneCanvas.width !== canvas.width) S.sceneCanvas.width = canvas.width; // setting width
    if (S.sceneCanvas.height !== canvas.height) S.sceneCanvas.height = canvas.height; // always reallocs
    else S.sceneCanvas.getContext("2d").clearRect(0, 0, S.sceneCanvas.width, S.sceneCanvas.height);
    S.sceneCanvas.getContext("2d").drawImage(canvas, 0, 0);
    S.sceneValid = true; S.sceneVX = S.view.x; S.sceneVY = S.view.y; S.phLastX = null;
  } else if (S.phLastX !== null) {
    // restore ONLY the strip under the previous playhead — a full-canvas blit
    // per frame is the same pixel bill as a full redraw on CPU rasterizers
    // (Brave, 2026-08-24: still 180% after the draw-call fix)
    const sx = Math.max(0, Math.floor((S.phLastX - 13) * dpr));
    const sw = Math.ceil(28 * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(S.sceneCanvas, sx, 0, sw, S.sceneCanvas.height, sx, 0, sw, S.sceneCanvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // playhead overlay — same geometry as drawFull's, clipped below the ruler
  const x = stripPlayheadX(); // the score spaces by noteheads, not ticks; a mid-play scrub follows the finger
  const H = wrap.clientHeight;
  if (x >= S.RULER_W) {
    ctx.fillStyle = css("--gold");
    ctx.fillRect(x, S.RULER_H, 1.5, H - S.RULER_H);
    drawStripPlayhead(x, css("--gold")); // playbackFrame only ever runs while S.playing
    S.phLastX = x;
  } else S.phLastX = null;
}
playbackFrameImpl = prof("playbackFrame", playbackFrameImpl); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
// VoiceOver first pass: the roll/score/tracks canvas is one opaque element to
// a screen reader (role="application" on #roll, set in the markup — it owns
// its own keyboard shortcuts, so VoiceOver must not intercept arrow keys the
// way it would for role="img"). aria-label is the only description it gets:
// song, which of the three views, the visible bar range, and the track
// count — recomputed every draw (cheap: a few multiplies and a string),
// never announced on its own (aria-label isn't a live region — nothing reads
// it aloud until the user explores the element), so no throttling needed
// here the way srAnnounce needs it.
export function updateCanvasA11y() {
  const el = typeof document !== "undefined" && document.getElementById("roll");
  if (!el) return;
  // idempotent — cheap to re-set every call, and it keeps the role/tabindex
  // set here in JS (not only in the static markup) so a vm test can see it
  // the same way a real browser would
  el.setAttribute("role", "application");
  el.tabIndex = 0;
  if (!S.song) { el.setAttribute("aria-label", "Night Roll — no song open"); return; }
  const title = S.currentPath ? songTitleOf(S.currentPath) : "untitled song";
  const viewName = S.viewMode === "score" ? "Score" : S.viewMode === "tracks" ? "Tracks" : "Roll";
  const ppt = pxPerTick(), bt = barTicks();
  const W = Math.max(0, ((wrap && wrap.clientWidth) || 0) - S.RULER_W);
  const barFrom = Math.max(1, Math.floor(S.view.x / ppt / bt) + 1);
  const barTo = Math.max(barFrom, Math.floor((S.view.x + W) / ppt / bt) + 1);
  const nt = S.song.tracks.length;
  el.setAttribute("aria-label", title + " — " + viewName + " view, bars " + barFrom + "–" + barTo + ", " + nt + " track" + (nt === 1 ? "" : "s"));
}
export function drawFull(skipCursor) {
  updateCanvasA11y();
  if (S.instOpen) drawInst(); // panel repaints on every app repaint (incl. playback frames)
  drawVelLane(); // the velocity lane too (it hides itself outside roll view)
  if (typeof updateEditButtons === "function") updateEditButtons(); // cached — cheap on every frame
  if (!S.song) return;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  ctx.fillStyle = css("--bg");
  ctx.fillRect(0, 0, W, H);
  if (fallActive()) { drawFall(W, H); return; }
  if (S.viewMode === "score" && VF && S.scoreModel) {
    drawScore(W, H, skipCursor);
    drawRuler(W, H);
    // drawRuler's opaque strip background just painted over the score's own
    // cursor mark wherever it crossed the strip — redraw it on top, same
    // "never baked into the cache" rule as every other playhead mark.
    if (!skipCursor) drawStripPlayhead(stripPlayheadX(), S.playing ? css("--gold") : css("--accent"));
    return;
  }
  if (S.viewMode === "tracks") {
    drawTracks(W, H, skipCursor);
    drawRuler(W, H);
    if (!skipCursor) drawStripPlayhead(stripPlayheadX(), S.playing ? css("--gold") : css("--accent"));
    return;
  }
  S._laneTop = null; S._kitSlots = null; // re-dock: edits since the last frame may have changed the lowest note
  S._has32 = null; // 32nd-grid presence re-checks against current notes
  const ppt = pxPerTick();
  const bt = barTicks();
  const rowH = S.view.rowH;

  // pitch row banding (black-key rows darker) + the kit lane, docked below the bass
  const TOP = topRow();
  for (let p = botRow(); p <= TOP; p++) {
    const y = S.RULER_H + (TOP - p) * rowH - S.view.y;
    if (y < S.RULER_H - rowH || y > H) continue;
    if (inKitLane(p)) { // kit lane: alternate soft banding, heavy line above the lane
      if (p === kitLaneTop() + 1) { ctx.fillStyle = css("--grid"); ctx.fillRect(S.RULER_W, y, W - S.RULER_W, 1.5); continue; }
      if ((kitLaneTop() - p) % 2 === 0) { ctx.fillStyle = css("--grid-soft"); ctx.fillRect(S.RULER_W, y, W - S.RULER_W, rowH); }
      continue;
    }
    const pc = p % 12;
    const black = [1,3,6,8,10].includes(pc);
    ctx.fillStyle = black ? css("--grid-soft") : "transparent";
    if (black) ctx.fillRect(S.RULER_W, y, W - S.RULER_W, rowH);
    if (pc === 0 || pc === 5) { // line under C and F for orientation
      ctx.fillStyle = css("--grid");
      ctx.fillRect(S.RULER_W, y + rowH, W - S.RULER_W, pc === 0 ? 1.5 : 0.5);
    }
  }

  drawRangeTints(W, H);

  // beat + bar lines — beat = the meter's denominator note (eighths in 6/8);
  // compound meters (6/8, 9/8, 12/8) get a medium line on each group of 3
  const t0 = S.view.x / ppt, t1 = (S.view.x + W) / ppt;
  const beatT = beatTicks();
  const groupT = effTs()[1] >= 8 && effTs()[0] % 3 === 0 ? beatT * 3 : null;
  ctx.textAlign = "left";
  if (S.gridDiv) { // custom grid: cells on their own phase + the meter's bar
    // lines kept as reference (they may sit BETWEEN cells — see gridAnchorTick)
    const cell = bt / S.gridDiv, a = gridAnchorTick();
    for (let k = Math.floor((t0 - a) / cell); a + k * cell < t1; k++) {
      const t = a + k * cell;
      const x = S.RULER_W + t * ppt - S.view.x;
      if (x < S.RULER_W) continue;
      ctx.fillStyle = css("--grid-soft");
      ctx.fillRect(x, S.RULER_H, 0.75, H);
    }
    for (let t = Math.max(0, Math.floor(t0 / bt) * bt); t < t1; t += bt) {
      const x = S.RULER_W + t * ppt - S.view.x;
      if (x < S.RULER_W) continue;
      ctx.fillStyle = css("--grid");
      ctx.fillRect(x, S.RULER_H, 1.5, H);
    }
  } else for (let t = Math.floor(t0 / beatT) * beatT; t < t1; t += beatT) {
    const x = S.RULER_W + t * ppt - S.view.x;
    if (x < S.RULER_W) continue;
    const isBar = Math.round(t) % bt === 0;
    const isGroup = !isBar && groupT && Math.round(t) % groupT === 0;
    ctx.fillStyle = isBar ? css("--grid") : css("--grid-soft");
    ctx.fillRect(x, S.RULER_H, isBar ? 1.5 : isGroup ? 1.25 : 0.75, H);
  }

  // notes
  S.song.tracks.forEach((tr, ti) => {
    if (!trackShown(ti)) return; // hidden = gone; muted = dimmed (still visible, still editable)
    const color = trackColor(ti);
    const dim = trackAudible(ti) ? 1 : 0.3;
    for (let ni = 0; ni < tr.notes.length; ni++) {
      const n = tr.notes[ni];
      if (n.gone) continue;
      const x = S.RULER_W + n.t * ppt - S.view.x;
      const w = Math.max(3, n.d * ppt - 1);
      if (x + w < S.RULER_W || x > W) continue;
      const y = S.RULER_H + (topRow() - noteRow(ti, n.p)) * rowH - S.view.y;
      if (y < S.RULER_H - rowH || y > H) continue;
      ctx.globalAlpha = (0.55 + 0.45 * (n.v / 127)) * dim;
      if (S.findPc !== null && n.p % 12 !== S.findPc) ctx.globalAlpha *= 0.15; // finder: non-matches recede
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y + 1.5, w, rowH - 3, 2.5);
      ctx.fill();
      if (S.findPc !== null && n.p % 12 === S.findPc) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = css("--accent");
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      if (n.added && showAddedOutline()) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#fff";
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if ((S.selNote && S.selNote.ti === ti && S.selNote.ni === ni) || S.multiSelKey.has(ti + ":" + ni)) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = css("--gold");
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  });
  ctx.globalAlpha = 1;
  if (S.cmp) drawCompare(ppt, rowH, W, H);

  // playhead / cursor — the line only; its handle is the tag in the playhead
  // strip (drawStripPlayhead, after drawRuler), gold while rolling. The old
  // triangle under the ruler covered the first row of notes (Josh, 2026-10-04).
  if (skipCursor) { /* playbackFrame lays the playhead over the cached scene */ }
  else if (S.playing) {
    const tick = secToTick(S.song, playSec());
    const x = S.RULER_W + tick * ppt - S.view.x;
    ctx.fillStyle = css("--gold");
    ctx.fillRect(x, 0, 1.5, H);
  } else {
    const x = S.RULER_W + S.playCursor * ppt - S.view.x;
    ctx.fillStyle = css("--accent");
    ctx.fillRect(x - 1, 0, 2.5, H);
  }

  drawRuler(W, H);
  if (!skipCursor) drawStripPlayhead(stripPlayheadX(), S.playing ? css("--gold") : css("--accent"));
  drawLasso(); // over the ruler too: a box dragged up into the bands must be seen there (Josh, 2026-09-13)

  // left ruler
  ctx.fillStyle = css("--panel");
  ctx.fillRect(0, 0, S.RULER_W, H);
  ctx.strokeStyle = css("--grid");
  ctx.beginPath(); ctx.moveTo(S.RULER_W - 0.5, 0); ctx.lineTo(S.RULER_W - 0.5, H); ctx.stroke();
  if (S.secMaxDepth > 1 && S.song) { // ▸/▾ level-collapse chevron, in the gutter corner
    const cap = secDepthCap(); // beside the section lanes (drawn AFTER the panel, or it's buried)
    ctx.fillStyle = css("--gold");
    ctx.font = "11px " + css("--mono");
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(cap >= S.secMaxDepth - 1 ? "▾" : "▸" + (cap + 1), 5, BASE_RULER_H + LANE_H / 2 + 1);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle"; // labels center on their rows (E sat at its row's bottom)
  for (let p = botRow(); p <= topRow(); p++) {
    const pc = p % 12;
    const y = S.RULER_H + (topRow() - p) * rowH - S.view.y;
    if (y < S.RULER_H || y > H) continue;
    if (inKitLane(p)) { // kit lane rows carry their piece names
      if (p === laneBotRow() - 1) { // the ⋯ expander: show/hide unused pieces
        if (S.view.rowH >= 6) {
          ctx.fillStyle = css("--dim");
          ctx.fillText(S.kitShowAll ? "⋯ less" : "⋯ kit", S.RULER_W - 6, y + rowH / 2);
        }
        continue;
      }
      const gm = kitSlots()[kitLaneTop() - p];
      if (gm !== undefined && DRUM_LABELS[gm] && S.view.rowH >= 6) { // shrink, don't vanish (iPad zoom-out lost the labels)
        const st = pieceState.get(gm);
        ctx.fillStyle = st === "solo" ? css("--gold") : !pieceAudible(gm) ? css("--dim") : css("--text");
        if (S.view.rowH < 10) ctx.font = Math.max(7, Math.floor(S.view.rowH)) + "px " + css("--mono");
        ctx.fillText((st === "solo" ? "S " : st === "mute" ? "✕" : "") + DRUM_LABELS[gm], S.RULER_W - 6, y + rowH / 2);
        if (S.view.rowH < 10) ctx.font = "10px " + css("--mono");
      }
      continue;
    }
    if (pc === 0) {
      ctx.fillStyle = css("--text");
      ctx.fillText("C" + (Math.floor(p/12) - 1), S.RULER_W - 6, y + rowH / 2);
    } else if (S.view.rowH >= 12 && [2,4,5,7,9,11].includes(pc)) {
      ctx.fillStyle = css("--dim"); // was --grid: nearly invisible
      ctx.fillText(spellPc(pc, sfShownAt(S.playCursor)), S.RULER_W - 6, y + rowH / 2);
    }
  }
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
}
drawFull = prof("drawFull", drawFull); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

// how far past the last bar a drag may scroll (clampView)
export function clampViewImpl() {
  if (S.song && S.view.pxq < minPxq()) S.view.pxq = minPxq(); // score floor tracks the model
  if (S.song && S.viewMode !== "score") { // roll zoom-out clamp: whole song = the floor
    if (S.view.pxq < pxqFloor()) S.view.pxq = pxqFloor();
    if (S.view.rowH < rowHFloor()) S.view.rowH = rowHFloor();
  }
  const minX = S.viewMode === "score" && S.scoreModel ? -SCORE_INTRO_W : 0;
  // scroll room past the end: empty bars to write into (Josh, 2026-10-03:
  // "I just want to push the song left so I can see like 10 empty bars" —
  // zoom-out still fits the song + 2 bars; only panning reaches further)
  const maxX = S.song
    ? Math.max(minX, S.songEndTick * pxPerTick() + PAN_TAIL_BARS * barTicks() * pxPerTick() - (wrap.clientWidth - S.RULER_W))
    : Infinity;
  S.view.x = Math.min(maxX, Math.max(minX, S.view.x));
  // song can be null here — maxX above already guards for it. This one did not,
  // and it bricked the app (Josh, 2026-09-06): clampView runs during the load
  // window, so being in Tracks view when a load starts threw before the load
  // finished, and viewMode is restored from localStorage, so the reload put him
  // straight back in Tracks. It read as "the song file is broken" — the file
  // was fine. Any new song. use in this function needs the same guard.
  const contentH = S.viewMode === "tracks" ? (S.song ? S.song.tracks.length : 0) * tracksLaneH()
    : S.viewMode === "score" && S.scoreModel
    ? scoreContentH()
    : (topRow() - botRow() + 1) * S.view.rowH;
  const maxY = contentH - (wrap.clientHeight - S.RULER_H);
  S.view.y = Math.min(Math.max(0, maxY), Math.max(0, S.view.y));
}

// manual scroll during playback suspends auto-follow
                        // until the playhead walks back into view
// score view can't zoom out as far as the roll: its floor comes from the
// song's densest measure (see buildScoreModel.pxqMin) or engraving overflows
export function minPxq() {
  return S.viewMode === "score" ? (S.scoreModel ? S.scoreModel.pxqMin : 36) : 8;
}
export function pxqFloor() { // px/quarter where bar 1..last bar fill the width, less a ruler-width of right padding
  if (!S.song || !S.songEndTick) return 8;
  return Math.min(400, Math.max(8, (wrap.clientWidth - 2 * S.RULER_W) / (S.songEndTick / S.song.ppq)));
}
export function rowHFloor() { // row height where the display range + air fills the height, less a ruler-height of bottom padding
  if (!S.song) return 6;
  const {lo, hi} = dispPitchExtent();
  return Math.min(32, Math.max(4, (wrap.clientHeight - 2 * S.RULER_H) / (hi - lo + 1 + 2 * ROLL_AIR)));
}
export const PAN_TAIL_BARS = 16;

export const ROLL_AIR = 3;
// rows of breathing room above and below the pitch range at full zoom-out
export function dispPitchExtent() { // like songPitchExtent, but in display rows (kit lane included)
  let lo = Infinity, hi = -Infinity;
  S.song.tracks.forEach((tr, ti) => tr.notes.forEach(n => {
    if (n.gone) return;
    const r = noteRow(ti, n.p);
    if (r < lo) lo = r; if (r > hi) hi = r;
  }));
  return lo <= hi ? {lo: Math.max(botRow(), lo), hi: Math.min(topRow(), hi)} : {lo: 55, hi: 79};
}


export function scheduleBackupFlushImpl() {
  if (!S.askCaps.bridge) return;
  clearTimeout(S.backupFlushTimer);
  S.backupFlushTimer = setTimeout(flushBackupNow, 5000);
}

export function flushBackupNow() {
  if (S.backupFlushTimer) { clearTimeout(S.backupFlushTimer); S.backupFlushTimer = null; }
  if (!S.askCaps.bridge || !S.song || !S.songKey || !editableSong()) return;
  let doc; try { doc = draftDoc(false); } catch (err) { return; }
  let notes = null; try { notes = serializeRollnotes(); } catch (err) { notes = null; }
  try {
    fetch(aiUrl() + "/v1/backup", {method: "POST", headers: aiHeaders(), body: JSON.stringify({key: S.songKey, doc, notes, at: Date.now()})})
      .catch(err => logDebug("backup: " + (err && err.message || err)));
  } catch (err) { logDebug("backup: " + (err && err.message || err)); }
}

export function cmpBar() {
  const bar = document.getElementById("cmpbar");
  if (!bar) return;
  if (!S.cmp) { bar.style.display = "none"; return; }
  const d = S.cmp.diff, mine = S.cmp.showing === "mine";
  const txt = document.getElementById("cmptext");
  txt.innerHTML = "";
  const add = (t, cls) => { const sp = document.createElement("span"); if (cls) sp.className = cls; sp.textContent = t; txt.appendChild(sp); };
  add("⇄ compare · hearing " + (mine ? "YOUR version" : "the SAVED copy") + " · ");
  add("+" + d.added + " yours only", "gold"); add(" · ");
  add("−" + d.removed + " saved only", "red"); add(" · ");
  add("~" + d.changed + " changed" + (d.tracks.some(t => t.ti < 0) ? " · a deleted track is counted, not drawn" : ""));
  document.getElementById("cmpswap").textContent = mine ? "hear the saved copy" : "hear your version";
  bar.style.display = "";
}

// spilling under the right dock (window manager, build steps 1-2) — the song
// area's own right edge is narrower than the window whenever a sheet is
// docked. Every such clamp site uses this instead of window.innerWidth.
// True .overlay modals (centered, full-viewport backdrop) are unaffected —
// they cover the dock too, by design; only anchored menus need this.
export function songRegionRight() {
  const el = typeof document !== "undefined" && document.getElementById && document.getElementById("songregion");
  const r = el && typeof el.getBoundingClientRect === "function" && el.getBoundingClientRect();
  if (r && typeof r.width === "number") return (typeof r.right === "number" ? r.right : r.left + r.width);
  return (typeof window !== "undefined" && window.innerWidth) || 1024;
}
// Lasso sits left of Select/Pencil/Erase on songs you can edit (Josh,
// 2026-10-03), and in the footer otherwise — the edit row doesn't exist on
// captures, where lasso is still the reading tool. One node, moved; its
// listeners and id travel with it.
export function placeLassoBtn(editable) {
  const b = document.getElementById("lassobtn"), row = document.getElementById("editrow"), seg = document.getElementById("modeseg");
  if (!b || !row || !seg || typeof row.insertBefore !== "function" || !b.parentNode) return; // the vm harness's stub elements can't move
  if (!placeLassoBtn.home) placeLassoBtn.home = {parent: b.parentNode, next: b.nextSibling};
  if (editable) { if (b.nextSibling !== seg) row.insertBefore(b, seg); b.classList.add("inrow"); }
  else if (b.parentNode !== placeLassoBtn.home.parent) { placeLassoBtn.home.parent.insertBefore(b, placeLassoBtn.home.next); b.classList.remove("inrow"); }
}
export function updateEditBtnVisImpl() { // the edit ROW exists only on songs made in the app
  // (or local .mid loads) — never on the FF captures (Josh, 2026-08-15)
  if (typeof updateChipBtn === "function") updateChipBtn(); // chip-audio offer follows the song
  // P1 (docs/provenance-plan.md): was its own isComposition()||isLocalDraft()
  // ||songKey===null, missing the link-mode/compare-repo guards editableSong()
  // has — one of the "three copies disagree" bugs the plan found; now the
  // same call, so a linked song or the repo side of Compare hides the row here too.
  const editable = editableSong();
  if (!editable && S.mode !== null && S.mode !== "select") { // leaving an editable song mid-pencil
    S.mode = null;
    for (const x of document.querySelectorAll("#modeseg button"))
      x.classList.remove("active");
    document.getElementById("durseg").style.display = "none";
    document.getElementById("velseg").style.display = "none";
    document.getElementById("accseg").style.display = "none";
  }
  S.editOn = editable;
  document.getElementById("editrow").classList.toggle("on", editable);
  placeLassoBtn(editable);
  if (editable) document.getElementById("velseg").style.display =
    (S.mode === "pencil" || S.mode === "select") ? "" : "none";
  document.getElementById("recbtn").style.display = editable ? "" : "none";
  document.getElementById("editsheetbtn").style.display = editable ? "" : "none";
  // a published song of the user's own, with no local copy here: offer to make one (Josh, 2026-09-27: ask first)
  document.getElementById("editherebtn").style.display =
    !editable && !!S.song && ownFolderPath(S.songKey) && !LINK_SONGS && !(S.cmp && S.cmp.showing === "repo") ? "" : "none";
  // a capture or starter: never "edit here" (nothing of yours to pull down) —
  // "✎ Edit" opens the "Edit a copy" sheet and forks one instead (Q4, docs/provenance-plan.md)
  const origin = S.song && S.songKey ? originOf(S.songKey) : null;
  document.getElementById("makeitminebtn").style.display =
    !editable && !!S.song && (origin === "capture" || origin === "starter") && !LINK_SONGS && !(S.cmp && S.cmp.showing === "repo") ? "" : "none";
}
// ⊙ highlight toggle
export function toggleHl() {
  S.hlOn = !S.hlOn;
  localStorage.setItem("ff1roll-hl", S.hlOn ? "1" : "0");
  S.lastSubtitle = undefined; // rerender the strip so the button state updates
  updateSubtitle();
  draw();
}
export function updateLCD() {
  if (!S.song) return;
  const t = curTick();
  const bt = barTicks(), tb = beatTicks();
  const bar = Math.floor(t / bt) + 1;
  const beat = Math.floor((t % bt) / tb) + 1;
  let usq = S.song.tempos[0].usq;
  for (const tp of S.song.tempos) { if (tp.tick <= t) usq = tp.usq; else break; }
  const bpm = Math.round(6e7 / usq * S.playRate);
  const meter = S.declaredTs ? S.declaredTs[0] + "/" + S.declaredTs[1] : "4/4?";
  const partial = S.rollnotes.find(n => n.keypartial);
  // same honesty as the meter's "4/4?": undeclared key = the C default, flagged.
  // Normal, nothing declared/stored: "Gm~" — the estimate, tilde flags it as
  // unconfirmed the same way "?" flags an undeclared default. Learning never
  // reaches the estimate branch (appMode() gates it before estimateKey() runs).
  const est = !keyNameAt(t) && !partial && appMode() === "normal" ? estimateKey() : null;
  const key = keyNameAt(t) || (partial ? partial.keypartial + "?" : est ? est.name + "~" : "C?");
  const s = bar + "|" + beat + "|" + bpm + "|" + meter + "|" + key;
  if (s === S.lcdCache) return;
  S.lcdCache = s;
  document.getElementById("lcdbar").textContent = String(bar);
  document.getElementById("lcdbeat").textContent = String(beat);
  document.getElementById("lcdtempo").textContent = String(bpm);
  document.getElementById("lcdmeter").textContent = meter;
  document.getElementById("lcdkey").textContent = key;
  // both segments are doors to their annotations (Josh, 2026-08-19); the bar
  // segment is the door to Go to bar (DAW F5 — src/input/gestures.js openBarJump)
  document.getElementById("lcdmkseg").classList.toggle("tappable", true);
  document.getElementById("lcdtemposeg").classList.toggle("tappable", true);
  document.getElementById("lcdbarseg").classList.toggle("tappable", true);
}
updateLCD = prof("updateLCD", updateLCD); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function updateSubtitleImpl() {
  updateLCD(); // rides every cursor/playhead update
  refreshKeysetLabel(); // cursor moved: keep "Set @ bar N" honest
  const el = document.getElementById("subtitle");
  // the slot exists for the whole song (constant height, no layout bounce);
  // only its CONTENT follows the playhead
  const hasNotes = !!S.song && S.rollnotes.some(n => !isDirective(n));
  el.classList.toggle("on", hasNotes && S.subOn);
  const n = S.song ? activeNoteAt(curTick()) : null;
  if (n === S.lastSubtitle) return;
  S.lastSubtitle = n;
  el.innerHTML = "";
  if (!n) return;
  const where = document.createElement("span");
  where.className = "where";
  const sec = sectionPathAt(n.start);
  where.textContent = "bar " + n.b1 + (n.b2 ? "–" + n.b2 : "") + (sec ? " · " + sec : "") +
                      (n.added ? " · unsynced" : "");
  const hl = document.createElement("button");
  hl.className = "hl" + (S.hlOn ? " on" : "");
  hl.textContent = "⊙ highlight";
  hl.addEventListener("click", toggleHl);
  el.append(where, document.createTextNode(n.text), hl);
  el.scrollTop = 0;
}
updateSubtitleImpl = prof("updateSubtitle", updateSubtitleImpl); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
// Right after a launch the source resolve (album meta, this device's store,
// the archive) takes seconds, and chip.rendering is only set after it: a Play
// in that window went out on synth voices (Josh, 2026-09-29, Chrono Cross,
// twice after a reload). chip.resolving lets play() wait for the decision.
export function updateChipBtnImpl() {
  const key = S.songKey, p = updateChipBtnInner();
  chip.resolving = {key, p};
  p.catch(() => {}).finally(() => { if (chip.resolving && chip.resolving.p === p) chip.resolving = null; });
  playGateKick();
  return p;
}
export async function updateChipBtnInner() { // name kept for call sites; now just the auto-render kick
  // "the chip button should not even have to exist" (Josh, 2026-08-17): chip
  // audio simply plays when a source resolves. Per-track override lives in
  // the voice menu — auto = the console own sound, an explicit instrument
  // swaps that track to synthesis.
  if (chip.fail && chip.fail.key === S.songKey) chip.fail = null; // this attempt starts clean
  const available = chipTrackNo() !== null || (await chipSource()) !== null;
  logDebug("song open: console source " + (available ? "found" : chip.fail && chip.fail.key === S.songKey ? "FAILED — " + chip.fail.why : "none (synth voices)"));
  // a lookup that FAILED (not "this song has none") must never pass for synth
  // silently (Josh, 2026-09-30: "sometimes the instruments never load"): say
  // why; the next ▶ tries again
  if (!available && chip.fail && chip.fail.key === S.songKey) setInfo("⚠ the console voice didn't load: " + chip.fail.why + " — tap ▶ to try again");
  // an import capture with NO reachable NSF plays synthesized — say so ONCE,
  // loudly enough to find (Josh listened to synth for an hour believing it
  // was the chip, 2026-08-17): the ⚠ log names the fix
  if (!available && S.songKey && S.songKey.startsWith("albums/imports/") &&
      updateChipBtn.warned !== S.songKey && await chipAlbumHasSource()) {
    updateChipBtn.warned = S.songKey;
    logErr("chip audio unavailable for " + S.songKey.split("/").pop() +
           " — no NSF on this device (captures made before NSF storage, or another device's import). " +
           "Re-import the album's NSF once, or commit the album; playing synthesized voices meanwhile.");
  }
  if (available && chip.key !== S.songKey && chip.rendering !== S.songKey) {
    if (chip.key && chip.key !== S.songKey) { chipStopSrcs(); chip.buffers = null; chip.pcm = null; chip.key = null; chip.pan = null; chipPreviewCache.clear(); if (S.chipWorker && S.chipWorker.__key !== S.songKey) { try { S.chipWorker.terminate(); } catch (err) { /* gone */ } S.chipWorker = null; } } // free the last song's audio: eight SNES voices are hundreds of MB
    chip.rendering = S.songKey;
    const forKey = S.songKey;
    chip.renderPromise = chipRenderAuto().catch(err => {
      // name + message (a module-load failure now names its path — fix 2),
      // and the heap if the browser exposes it: a real 404 vs an allocation
      // failure used to look identical in this one line (Josh's iPad, FF7
      // failing the same way Challenge just had, 2026-09-30)
      const heap = (typeof performance !== "undefined" && performance.memory && performance.memory.usedJSHeapSize) ? " · heap " + Math.round(performance.memory.usedJSHeapSize / 1e6) + " MB" : "";
      const detail = (err && err.name ? err.name + ": " : "") + (err && err.message || err);
      chip.fail = {key: forKey, why: "the console render failed for " + songTitleOf(forKey) + " (" + detail + ")" + heap};
      if (S.songKey === forKey) setInfo("⚠ the console voice didn't load: " + chip.fail.why + " — tap ▶ to try again");
      logDebug("render failed: " + chip.fail.why);
      return false;
    }) // not renderable: synth carries the song, and says so
      .finally(() => { if (chip.rendering === forKey) chip.rendering = null; });
  }
}

export async function cmpEnter() {
  if (!S.song || !S.songKey || !isComposition()) { setInfo("compare works on your own saved songs"); return; }
  if (S.chopS > 0 || S.chopE !== null) { setInfo("turn the chop off first — compare looks at the whole song"); return; }
  const key = S.songKey;
  // Model B: Save Version is device-local history, not a publish baseline —
  // Compare always reads against the published copy.
  setInfo("fetching the published copy…");
  let res = null;
  try { res = await readData("songs", key, true); } catch (err) { res = null; }
  if (!res || !res.ok) { setInfo("no published copy of this song " + (folderActive() ? "in the folder" : "in the repo") + " yet"); return; }
  const parsed = parseMidi(await res.arrayBuffer());
  if (!S.song || S.songKey !== key) return; // he moved on while it loaded
  const scale = S.song.ppq / parsed.ppq; // same lineage, but be safe
  const repo = parsed.tracks.map(t => ({name: t.name, notes: t.notes.map(n => scale === 1 ? {...n} : {...n, t: Math.round(n.t * scale), d: Math.round(n.d * scale)})}));
  S.cmp = {repo, showing: "mine", mine: null, diff: cmpDiff(repo, S.song.tracks)};
  cmpBar();
  draw();
  const d = S.cmp.diff;
  setInfo(d.tracks.length ? "compare: gold = only in yours, red = only in the saved copy, dashed = not in what you hear" : "compare: your version matches the saved copy note for note");
}
export function cmpExit() {
  if (!S.cmp) return;
  if (S.cmp.showing === "repo") cmpShow("mine");
  S.cmp = null;
  cmpBar();
  draw();
}
export function cmpShow(which) { // swap which version the roll and the transport hold; the other waits in cmp.mine
  if (!S.cmp || S.cmp.showing === which) return;
  const at = S.playing ? playSec() : null;
  if (S.playing) stop();
  if (which === "repo") {
    S.cmp.mine = S.song.tracks.map(tr => tr.notes);
    S.song.tracks.forEach((tr, i) => {
      const r = S.cmp.repo.find((t, j) => cmpTrackKey(t, j) === cmpTrackKey(tr, i));
      tr.notes = r ? r.notes.map(n => ({...n})) : [];
    });
  } else {
    S.song.tracks.forEach((tr, i) => { tr.notes = S.cmp.mine[i]; });
    S.cmp.mine = null;
  }
  S.cmp.showing = which;
  S.selNote = null; S.multiSel.length = 0; S.multiSelKey.clear();
  S._laneTop = null; S._kitSlots = null; S._has32 = null;
  computeSongEnd();
  cmpBar();
  draw();
  if (at !== null) play(at, {noCountIn: true});
}

export const songsheet = document.getElementById("songsheet");
export function songStatus(key) { // the word on a LOCAL row
  if (isUnsaved(key)) return "never saved";
  if (!catalogHas(key)) return "not published";
  let d = null;
  try { d = JSON.parse(localStorage.getItem(draftStoreKey(key)) || "null"); } catch (err) { d = null; }
  if (d && d.dirty) return "changed since publish";
  if (dirtySongs().includes(key)) return "annotations changed here";
  return "published";
}
export const fileStatus = s => {
  if (/⚠|failed|error|can't|cannot/i.test(s)) logErr(s);
  document.getElementById("filestatus").textContent = s;
};
export const filesheet = document.getElementById("filesheet");
// Open › is a cascading submenu: albums fly out beside the File menu,
// drill into a group, tap a song. Opens straight into the current group.
export const filesub = document.getElementById("filesub");
export function closeFileMenus() {
  filesheet.classList.remove("on");
  filesub.classList.remove("on");
  document.getElementById("editsheet").classList.remove("on");
  document.getElementById("viewsheet").classList.remove("on");
  document.getElementById("importhub").classList.remove("on");
  closeDropUp();
}
export function openDropUp(btn, menu) {
  const was = S.dropUpOpen === menu && menu.classList.contains("on"); // tapping an already-open trigger toggles it closed
  closeFileMenus();
  if (was) return;
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
  menu.style.bottom = (wmInnerHeight() - r.top + 6) + "px";
  menu.classList.add("on");
  S.dropUpOpen = menu;
}
export function draftRow(key, label, rerender, extra) { // open + (optional extra) + two-tap ✕
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:4px";
  const open = document.createElement("button");
  open.className = "fitem";
  open.style.flex = "1";
  open.textContent = label + (key === S.currentPath ? "   ✓" : "");
  open.addEventListener("click", () => { closeFileMenus(); openDraft(key); });
  row.appendChild(open);
  if (extra) row.appendChild(extra);
  const del = document.createElement("button");
  del.className = "fitem";
  del.style.cssText = "flex:none;width:auto;color:var(--dim)";
  del.textContent = "✕";
  del.addEventListener("click", () => {
    if (del.textContent === "✕") { // two-tap confirm: unsaved work dies with a draft
      del.textContent = "sure?";
      del.style.color = "#e66767";
      return;
    }
    for (const pre of ["ff1roll-draft-", "ff1roll-notes-", "ff1roll-ts-", "ff1roll-edits-"])
      localStorage.removeItem(pre + key);
    idbDraftDelete(key);
    rerender();
  });
  row.appendChild(del);
  filesub.appendChild(row);
}

// the band the Analyze sheet is currently open on
export function setSecDepth(next) { // clamped stepper (the wrap-around cycle read as awkward)
  next = Math.max(0, Math.min(S.secMaxDepth - 1, next));
  if (next >= S.secMaxDepth - 1) localStorage.removeItem("ff1roll-secdepth-" + S.songKey);
  else localStorage.setItem("ff1roll-secdepth-" + S.songKey, String(next));
  finalizeNotes();
  setInfo(next >= S.secMaxDepth - 1 ? "all " + S.secMaxDepth + " section levels shown"
                                  : "showing " + (next + 1) + " of " + S.secMaxDepth + " section levels (deeper ones still drive the drums)");
  clampView(); draw();
  if (typeof renderViewMenu === "function") renderViewMenu();
}
export function cycleSecDepth() { // the gutter chevron keeps its one-tap cycle (fold, fold, unfold-all)
  const cur = Math.min(secDepthCap(), S.secMaxDepth - 1);
  setSecDepth(cur - 1 < 0 ? S.secMaxDepth - 1 : cur - 1);
}

// shown list only: drops a song that's gone from BOTH this device's drafts
// and the catalog — but only once the catalog has actually loaded (an empty
// CATALOG at boot means "don't know yet", not "gone"; a genuinely missing
// song still fails gracefully through loadSong's own error path)
export function recentSongsForMenu() {
  const list = recentSongs();
  const catalogKnown = Object.keys(S.CATALOG).length > 0;
  const kept = list.filter(r => localStorage.getItem(draftStoreKey(r.key)) !== null || !catalogKnown || catalogHas(r.key));
  if (kept.length !== list.length) saveRecentSongsRaw(kept);
  return kept;
}
// the album shown beside each title: the catalog's own album name when the
// song is in it (same value updateSongBtn's breadcrumb uses), else the
// folder title the breadcrumb falls back to for a local-only song
export function recentAlbumFor(key) { return groupOf(key) || folderTitle(folderOf(key)); }
// File ▾ → "Open Recent ▸" expand state — same pattern/reasoning as vwOpenGroup just above
// UI refresh after an interactive mode flip (View ▾ toggle, Settings
// checkbox) — boot itself never calls this, it just reads APP_MODE above.
// Chrome density follow-up (2026-10-01 pm, Josh's ruling): the header's
// gold "🎓 Learning" tag (#modepill) is gone entirely — Learning mode is
// read from Settings → Other or View ▾ → Mode only, never a header badge.
export function applyMode() {
  if (typeof document === "undefined") return;
  if (document.body) document.body.dataset.mode = S.APP_MODE; // vm harness has no body (sentinel) — see tests/harness.mjs
  const cb = document.getElementById("cfglearning");
  if (cb) cb.checked = S.APP_MODE === "learning";
  if (typeof S._keyEstCache !== "undefined") S._keyEstCache = null; // stale conf/label from the other mode
  // P6: Learning is the law — the Analyze layer (and any pending debounced
  // recompute of it) must stop existing the instant the mode flips, not
  // just stop being drawn (the spy test proves bsInferTimeline/estimateKey
  // never fire for it in Learning).
  if (typeof S.APP_MODE !== "undefined" && S.APP_MODE === "learning" && typeof S.analysisOn !== "undefined") {
    if (typeof S._analysisTimer !== "undefined" && S._analysisTimer) { clearTimeout(S._analysisTimer); S._analysisTimer = null; }
    S.analysisOn = false;
    S.analysisBands = {chords: [], key: null};
  }
  if (typeof S.song !== "undefined" && S.song) {
    finalizeNotes(); // rebuilds keyunset label + keysetest visibility for the new mode
    if (typeof updateSubtitle === "function") updateSubtitle();
    if (typeof draw === "function") draw();
  }
}
export function governingAt(match, at) { // latest matching annotation at or before the cursor (or tick `at`)
  const t = at === undefined ? curTick() : at;
  let hit = null;
  for (const n of S.rollnotes)
    if (match(n) && n.start <= t && (!hit || n.start >= hit.start)) hit = n;
  return hit;
}
// Roll zoom-out clamp (Josh, 2026-08-06): pinch-out stops once the whole song
// is in view — per axis, flush to the song's own extents (chop-trimmed), no
// padding. While time still overflows, both axes zoom; once every bar fits,
// further pinch-out only reveals pitch; once every note is visible, nothing.
export function songPitchExtent() { // lowest..highest sounding pitch of the (trimmed) song
  let lo = Infinity, hi = -Infinity;
  S.song.tracks.forEach(tr => tr.notes.forEach(n => {
    if (!n.gone) { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }
  }));
  return lo <= hi ? {lo: Math.max(S.PMIN, lo), hi: Math.min(S.PMAX, hi)} : {lo: 55, hi: 79};
}
export function renderSongGroups() { // top: LOCAL's top-level folders, then PUBLISHED's
  S.songViewRedraw = () => renderSongGroups();
  document.getElementById("songsheettitle").textContent = "OPEN";
  const rows = document.getElementById("songrows");
  rows.innerHTML = "";
  { const sh = rows.closest ? rows.closest(".sheet") : null; if (sh) sh.scrollTop = 0; songsheet.scrollTop = 0; } // a new folder starts at its top: the ‹ row must be in reach (Josh, 2026-09-28) — unless it holds the song you are on: then that row (below)
  const local = folderTree(draftKeys());
  if (subfolderKeys(local).length) {
    rows.appendChild(songHeader(localLabel()));
    for (const seg of subfolderKeys(local)) rows.appendChild(songRow(segTitle(local.sub[seg].path) + "  (" + nodeCount(local.sub[seg]) + ") ›", () => renderFolder("local", local.sub[seg].path)));
  }
  rows.appendChild(songHeader(publishedLabel()));
  const pub = folderTree(publishedPaths());
  for (const seg of subfolderKeys(pub)) rows.appendChild(songRow(segTitle(pub.sub[seg].path) + "  (" + nodeCount(pub.sub[seg]) + ") ›", () => renderFolder("published", pub.sub[seg].path)));
}
export function renderFolder(section, folder) { // one level: subfolders, then this folder's songs
  S.songViewRedraw = () => renderFolder(section, folder);
  const root = folderTree(section === "local" ? draftKeys() : publishedPaths());
  const node = nodeAt(root, folder);
  if (!node) return renderSongGroups();
  document.getElementById("songsheettitle").textContent = folderTitle(folder).toUpperCase();
  const rows = document.getElementById("songrows");
  rows.innerHTML = "";
  { const sh = rows.closest ? rows.closest(".sheet") : null; if (sh) sh.scrollTop = 0; songsheet.scrollTop = 0; } // a new folder starts at its top: the ‹ row must be in reach (Josh, 2026-09-28) — unless it holds the song you are on: then that row (below)
  const up = parentFolder(folder);
  rows.appendChild(songRow("‹ " + (up ? segTitle(up) : "All folders"), () => up ? renderFolder(section, up) : renderSongGroups(), true));
  rows.appendChild(songHeader(section === "local" ? localLabel() : publishedLabel()));
  for (const seg of subfolderKeys(node)) rows.appendChild(songRow(segTitle(node.sub[seg].path) + "  (" + nodeCount(node.sub[seg]) + ") ›", () => renderFolder(section, node.sub[seg].path)));
  if (section === "local") {
    for (const key of node.songs.sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b))))
      { const r = songRow(songTitleOf(key) + "  · " + songStatus(key) + (key === S.currentPath ? "   ✓" : ""), () => { songsheet.classList.remove("on"); openDraft(key); }); if (key === S.currentPath) r.dataset.current = "1"; rows.appendChild(r); }
  } else {
    // this folder is one album iff every song here maps to the same CATALOG
    // group — the only case where game order (and the switch) applies
    const group = node.songs.length && groupOf(node.songs[0]);
    const oneAlbum = !!(group && node.songs.every(p => groupOf(p) === group));
    if (oneAlbum && albumHasTrackData(group)) rows.appendChild(albumOrderControl(group, () => renderFolder(section, folder)));
    const songs = oneAlbum
      ? albumEffectiveOrder(group).map(([, p]) => p).filter(p => node.songs.includes(p))
      : node.songs.slice().sort((a, b) => songTitleOf(a).localeCompare(songTitleOf(b)));
    for (const path of songs) {
      const local = localStorage.getItem(draftStoreKey(path)) !== null; // the tap opens the local copy (draft wins)
      const r = songRow(songTitleOf(path) + (local ? "  · local copy" : "") + (path === S.currentPath ? "   ✓" : ""), () => {
        S.currentPath = path;
        rememberLastSong(path);
        reflectSongURL(path);
        updateSongBtn();
        songsheet.classList.remove("on");
        loadSong(path).catch(e => setInfo(e.message));
      }); if (path === S.currentPath) r.dataset.current = "1"; rows.appendChild(r);
    }
  }
  { const cur = rows.querySelector ? rows.querySelector("[data-current]") : null; if (cur && cur.scrollIntoView) cur.scrollIntoView({block: "center"}); } // the song you are on comes into view; a folder without it starts at the top (Josh, 2026-09-28)
}
export function renderSongList(group) { renderFolder("published", folderOf(S.CATALOG[group][0][1])); } // an album is its folder
export function openSongPicker() {
  // open straight into the current song's folder — one less tap for the sweep
  if (S.currentPath && localStorage.getItem("ff1roll-draft-" + S.currentPath)) renderFolder("local", folderOf(S.currentPath)); // the local copy is what's open
  else if (S.currentPath && catalogHas(S.currentPath)) renderFolder("published", folderOf(S.currentPath));
  else renderSongGroups();
  songsheet.classList.add("on");
  // the published list is re-read on every open (at most once per 20 s), and
  // the view redraws only if something changed — a song published from the
  // terminal or another device shows up without relaunching (Josh, 2026-09-28)
  if (Date.now() - S.catalogRefreshedAt > 20000 && typeof initCatalog === "function") {
    S.catalogRefreshedAt = Date.now();
    const sig = () => JSON.stringify(Object.entries(S.CATALOG).map(([k, v]) => k + ":" + v.length));
    const before = sig();
    initCatalog().then(() => { if (songsheet.classList.contains("on") && S.songViewRedraw && sig() !== before) S.songViewRedraw(); }).catch(() => { /* offline: the list you had */ });
  }
}
export function applyListener() {
  if (!document.body) return; // vm harness has no body
  document.body.classList.toggle("listener", S.listenerMode);
  if (S.song) finalizeNotes(); // band lanes + RULER_H depend on the mode
  window.dispatchEvent(new Event("resize"));
}
// each view keeps its own zoom and scroll, per song, this session (Josh,
// 2026-09-29: a fully zoomed-out roll came back from Score at ~6 bars —
// Score raises pxq to what engraving can space). Restored BEFORE
// applyViewMode, whose clamps would otherwise act on the other view's numbers.
export function setViewMode(m) {
  if (m === "score" && !VF) { setInfo("score engine failed to load"); return; }
  if (S.songKey) viewSaved.set(S.songKey + "|" + S.viewMode, {...S.view});
  S.viewMode = m;
  localStorage.setItem("ff1roll-view", S.viewMode);
  const sv = S.songKey && viewSaved.get(S.songKey + "|" + m);
  if (sv) Object.assign(S.view, sv);
  applyViewMode();
}
export function applyViewMode() {
  const tracks = S.viewMode === "tracks", score = S.viewMode === "score";
  const vText = tracks ? "Tracks" : score ? "Score" : "Roll";
  const aria = "View: " + vText + " — tap to switch";
  if (tracks) setControl("viewbtn", {icon: "tableRows", cls: "txt", label: vText + " ▴", aria});
  else if (score) setControl("viewbtn", {glyph: "𝄞", cls: "txt", label: " " + vText + " ▴", aria});
  else setControl("viewbtn", {icon: "gridView", cls: "txt", label: vText + " ▴", aria});
  renderViewSwitch();
  S.RULER_W = S.viewMode === "tracks" ? TRACKS_GUTTER : RULER_W_ROLL;
  // score entry (2026-08-15): Edit works in both views; ♮♯♭ is score-only
  document.getElementById("accseg").style.display =
    S.viewMode === "score" && S.editOn && S.mode === "pencil" ? "" : "none";
  if (S.viewMode === "score") {
    S.view.y = 0;
    if (S.view.pxq < minPxq()) S.view.pxq = minPxq(); // roll zooms out further than engraving can
    if (S.view.x < 40) S.view.x = -SCORE_INTRO_W; // near the start: show clef/key column
  } else if (S.viewMode === "tracks") {
    S.view.y = 0;
    if (S.view.x < 0) S.view.x = 0;
  } else if (S.view.x < 0) S.view.x = 0;
  clampView();
  draw();
}
export function toggleSubtitle() {
  S.subOn = !S.subOn;
  localStorage.setItem("ff1roll-sub", S.subOn ? "1" : "0");
  subbtn.classList.toggle("active", S.subOn);
  subbtn.setAttribute("aria-pressed", String(S.subOn));
  updateSubtitle();
}
export function fileMenuSaveLabels() { // Save Version: your own local songs only. Versions…: any open song with a repo path (browsing/going back to the published copy also works on a read-only capture with local annotation edits)
  // an Untitled song is his too — and Save Version is how it gets a folder at
  // all (Josh, 2026-10-03: "there is no Save Version")
  const comp = !!S.song && (isComposition() || isUnsaved(S.songKey)) && !LINK_SONGS;
  document.getElementById("filesavelocal").style.display = comp ? "" : "none";
  document.getElementById("filerevert").style.display = !!S.song && !!S.songKey && !S.songKey.startsWith("local/") && !LINK_SONGS ? "" : "none";
}
// File ▾ → "Open Recent ▸" (2026-10-01): same expanding-row pattern as
// View ▾'s own groups (renderViewMenu/vwOpenGroup) — keeps the ▸/▾
// glyph and #fileopenrecentrow's own rows in sync; called on every File ▾
// open and again after any tap inside the row (pick/Clear) so the menu
// reflects the new state in place, without closing.
export function renderOpenRecentRow() {
  const btn = document.getElementById("fileopenrecent");
  btn.textContent = (S.fileOpenRecentOpen ? "▾  " : "▸  ") + "Open Recent";
  btn.setAttribute("aria-expanded", String(S.fileOpenRecentOpen));
  const row = document.getElementById("fileopenrecentrow");
  row.style.display = S.fileOpenRecentOpen ? "" : "none";
  if (!S.fileOpenRecentOpen) return;
  row.innerHTML = "";
  const list = recentSongsForMenu();
  if (!list.length) {
    const d = document.createElement("div");
    d.className = "fitem";
    d.style.cssText = "min-height:44px;opacity:.55;cursor:default";
    d.textContent = "No recent songs";
    row.appendChild(d);
    return;
  }
  for (const r of list) {
    const b = document.createElement("button");
    b.className = "fitem";
    b.style.minHeight = "44px";
    const current = r.key === S.songKey;
    b.textContent = (current ? "✓ " : "   ") + r.title + "  — " + recentAlbumFor(r.key);
    if (current) b.style.opacity = "0.55";
    b.addEventListener("click", () => { closeFileMenus(); openRecentSong(r.key); });
    row.appendChild(b);
  }
  const clear = document.createElement("button");
  clear.className = "fitem";
  clear.style.cssText = "min-height:44px;color:var(--dim)";
  clear.textContent = "Clear recent";
  clear.addEventListener("click", () => { clearRecentSongs(); renderOpenRecentRow(); });
  row.appendChild(clear);
}
// tapping a row: the same two functions File → Open…'s own rows use
// (fsubFolder/renderFolder) — a local draft wins, otherwise the catalog path
export function openRecentSong(key) {
  if (localStorage.getItem(draftStoreKey(key)) !== null) { openDraft(key); return; }
  albumClear(); // picking a song by hand ends an album run — Open…'s own rule (fsubFolder)
  S.currentPath = key;
  rememberLastSong(key);
  reflectSongURL(key);
  updateSongBtn();
  loadSong(key).catch(err => setInfo(err.message));
}

export const speedsl = document.getElementById("speedsl");
export const speedlbl = document.getElementById("speedlbl");
export const speedreset = document.getElementById("speedreset");
export function applySpeed(pct) {
  speedsl.value = String(pct);
  speedlbl.textContent = pct + "%";
  speedreset.style.display = pct === 100 ? "none" : ""; // snap-back appears when off-native
  if (!S.song) { S.playRate = pct / 100; return; }
  const tk = curTick(); // keep the musical position across the rate change
  const wasPlaying = S.playing;
  if (wasPlaying) stop();
  S.playRate = pct / 100;
  stretchCache.clear(); // a new rate: re-render the takes (pitch-preserving), old renders go
  stretchEnsureAll();
  updateSongMeta();
  if (wasPlaying) play(tickToSec(S.song, tk));
  else { S.playCursor = tk; updateSubtitle(); draw(); }
}
export const speedbtn = document.getElementById("speedbtn");
export const _applySpeedInner = applySpeed;
export function initChrome1() {
  applySpeed = pct => { _applySpeedInner(pct); speedbtn.textContent = pct + "%"; };
}

// master volume: device pref, multiplies MASTER_VOL everywhere it lands
export const volsl = document.getElementById("volsl");
export const vollbl = document.getElementById("vollbl");
export const volbtn = document.getElementById("volbtn");

export function initChrome2() {
  document.getElementById("lcdtemposeg").addEventListener("click", () => {
    if (!S.song) return; // the song's opening tempo — always bar 1, not the cursor (Josh, 2026-10-01: "I almost always want the whole song"; a mid-song change is + Note)
    openEditor(governingAt(n => n.tempodir !== undefined, 0), "tempo", {atStart: true});
  });
  // meter and key are independent targets in the shared segment (Josh, 2026-08-19)
  document.getElementById("lcdmeter").addEventListener("click", e => {
    if (!S.song) return;
    e.stopPropagation();
    openEditor(governingAt(n => !!n.tsdir, 0), "timesig", {atStart: true}); // bar 1, not the cursor (see the tempo segment)
  });
  document.getElementById("lcdkey").addEventListener("click", e => {
    if (!S.song) return;
    e.stopPropagation();
    const kn = governingAt(n => n.keydir !== undefined || n.keypartial, 0); // bar 1, not the cursor (see the tempo segment)
    openEditor(kn, kn ? undefined : "key", {atStart: true});
  });
}

export function initChrome3() {
  window.addEventListener("error", e => {
    if (BENIGN_ERRORS.test(e.message || "")) return;
    logErr("uncaught: " + e.message + (e.filename ? " (" + (e.filename.split("/").pop()) + ":" + e.lineno + ")" : ""));
  });
  window.addEventListener("unhandledrejection", e =>
    logErr("unhandled: " + (e.reason && e.reason.message || e.reason)));
  document.getElementById("errbtn").addEventListener("click", () => {
    const lines = logLines();
    const max = askSeenMax().err; // Mark-as-read (2026-09-30): grey out lines already included in a "New since…" bridge context block, in ANY chat
    const list = document.getElementById("errlist");
    list.innerHTML = "";
    if (!lines.length) list.textContent = "No messages.";
    else for (const x of lines.slice().reverse()) {
      const d = document.createElement("div");
      d.style.marginBottom = "0.6em";
      d.textContent = logLine(x);
      if (x.id <= max) d.style.color = "var(--dim)";
      list.appendChild(d);
    }
    document.getElementById("errsheet").classList.add("on");
  });
  document.getElementById("errcopy").addEventListener("click", async () => { // the whole log, newest first, for pasting to Claude (Josh, 2026-09-27) — built from the data, not the rendered DOM (errlist is now one div per line, so its own textContent runs the lines together)
    const text = logLines().slice().reverse().map(logLine).join("\n\n") || "No messages.";
    const b = document.getElementById("errcopy");
    try { await navigator.clipboard.writeText(text); b.textContent = "Copied ✓"; }
    catch (err) { b.textContent = "⚠ couldn't copy"; }
    setTimeout(() => { b.textContent = "Copy all"; }, 1500);
  });
  document.getElementById("errclear").addEventListener("click", () => {
    appErrors.length = 0; appDebug.length = 0;
    document.getElementById("errbtn").style.display = "none";
    document.getElementById("errsheet").classList.remove("on");
  });
   document.getElementById("noteinfo").addEventListener("click", async () => {
    if (!S.infoCopyText) { // no copy action on this message: the tap reveals it in full instead
      if (S.infoFull) {
        document.getElementById("infosheettext").textContent = S.infoFull;
        document.getElementById("infosheet").classList.add("on");
      }
      return;
    }
    let ok = true;
    try { await navigator.clipboard.writeText(S.infoCopyText); }
    catch (err) { // clipboard API denied: fall back to a hidden textarea
      try {
        const ta = document.createElement("textarea");
        ta.value = S.infoCopyText;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select(); ok = document.execCommand("copy");
        ta.remove();
      } catch (err2) { ok = false; }
    }
    const chip = document.querySelector("#noteinfo .copychip");
    if (chip) chip.textContent = ok ? "✓ copied" : "✗ copy failed";
  });
  // the Status window itself (#infosheet) had no way to copy its text at all
  // (Josh, 2026-09-30: "I can't copy from the Status window") — the info strip
  // already copies SOME messages (infoCopyText above); this covers the rest.
  document.getElementById("infosheetcopy").addEventListener("click", ev => {
    ev.stopPropagation();
    askCopyText(S.infoFull || document.getElementById("infosheettext").textContent, document.getElementById("infosheetcopy"));
  });
}

export function initChrome4() {
  document.addEventListener("pointerdown", e => { // tap-away closes the Edit menu
    const es = document.getElementById("editsheet");
    if (es.classList.contains("on") && !es.contains(e.target) && e.target.id !== "editsheetbtn")
      es.classList.remove("on");
  }, {capture: true});
}

export function initChrome5() {
  if (S.viewMode === "tracks") S.RULER_W = TRACKS_GUTTER;                         






   document.getElementById("playbtn").addEventListener("click", () => {
    if (!S.song) return; // first song still fetching
    if (!S.playing && S.playGateShown) { playGateTick.queued = !playGateTick.queued; playGateTick(); return; } // loading: the tap queues (or cancels) the play; it starts when the sound is ready
    S.playing ? stop() : play(S.playCursor > 0 ? tickToSec(S.song, S.playCursor) : 0); // in an album run this is pause/resume — the run stays
  });
  document.getElementById("rwbtn").addEventListener("click", () => {
    const startX = S.viewMode === "score" ? -SCORE_INTRO_W : 0;
    // a ruler selection — armed or parked — owns ⏮: back to ITS start, and the
    // view goes with it (Josh, 2026-10-04: it used to scroll to bar 1, so it
    // looked like the song start)
    const home = S.rangeSel && S.rangeSel.b > S.rangeSel.a ? S.rangeSel.a : 0;
    const reveal = () => {
      if (!home) { S.view.x = startX; return; }
      const sx = S.viewMode === "score" ? scoreTickToX(home) : S.RULER_W + home * pxPerTick() - S.view.x;
      if (sx >= S.RULER_W && sx <= canvas.clientWidth - 40) return; // already on screen: leave the view alone
      S.view.x = Math.max(startX, S.view.x + sx - S.RULER_W - 40);
      clampView();
    };
    if (S.playing) { stop(); S.playCursor = home; reveal(); play(tickToSec(S.song, home)); return; }
    S.playCursor = home;
    reveal();
    updateSubtitle();
    draw();
  });
  speedsl.addEventListener("input", () => { speedlbl.textContent = speedsl.value + "%"; });
  speedsl.addEventListener("change", () => applySpeed(+speedsl.value)); // on release, not per drag-tick
  speedreset.addEventListener("click", () => {
    applySpeed(100);
    document.getElementById("speedpop").style.display = "none"; // reset means done — fold immediately
  });
  // speed + volume live behind BUTTONS (Josh, 2026-08-22: the slider "takes too
  // much space... if I click it, it opens up the slider") — tap toggles the
  // popover open; tapping anywhere else folds it back to a button
  {
    const pops = [["speedbtn", "speedpop"], ["volbtn", "volpop"]];
    for (const [bid, pid] of pops) {
      document.getElementById(bid).addEventListener("click", () => {
        for (const [b2, p2] of pops) // one open at a time
          document.getElementById(p2).style.display = p2 === pid &&
            document.getElementById(p2).style.display === "none" ? "flex" : "none";
      });
    }
    document.addEventListener("pointerdown", e => {
      for (const [bid, pid] of pops) {
        const pop = document.getElementById(pid);
        if (pop.style.display !== "none" && !pop.contains(e.target) && e.target.id !== bid)
          pop.style.display = "none";
      }
    }, {capture: true});
  }
}

export function initChrome6() {
  S.masterVol = +(localStorage.getItem("ff1roll-mastervol") || 1);
  volsl.value = String(Math.round(S.masterVol * 100));
  vollbl.textContent = Math.round(S.masterVol * 100) + "%";
  setVolBtn(Math.round(S.masterVol * 100));
  volsl.addEventListener("input", () => {
    S.masterVol = (+volsl.value) / 100;
    vollbl.textContent = volsl.value + "%";
    setVolBtn(+volsl.value);
    localStorage.setItem("ff1roll-mastervol", String(S.masterVol));
    if (S.audio && S.master) S.master.gain.setValueAtTime(MASTER_VOL * S.masterVol, S.audio.currentTime);
  });
}

export function initChrome7() {
  findsel.addEventListener("focus", refreshFindSel);
  findsel.addEventListener("change", () => {
    S.findPc = findsel.value === "" ? null : +findsel.value;
    if (S.findPc === null) { setInfo("find: off"); draw(); return; }
    let count = 0;
    const chans = new Set();
    if (S.song) S.song.tracks.forEach((tr, ti) => {
      if (!trackShown(ti) || trackIsDrums(ti)) return;
      for (const n of tr.notes) if (!n.gone && n.p % 12 === S.findPc) { count++; chans.add(tr.name || "track " + (ti + 1)); }
    });
    const sf = sfShownAt(curTick());
    const deg = degreeOf(S.findPc, keyNameShownAt(curTick()));
    const name = spellPc(S.findPc, sf) + (deg ? " (degree " + deg + ")" : "");
    setInfo(count ? "find " + name + ": " + count + " notes — " + [...chans].join(", ")
                  : "find " + name + ": 0 — not present in this song");
    draw();
  });
}

export function initChrome8() {
  if (typeof document !== "undefined" && document.body) { // real browser only — layout/Mutation observers are not unit tested, like the wmdock menu's own dismissal above
    const footerEl = document.getElementById("footer");
    if (typeof ResizeObserver === "function") new ResizeObserver(scheduleFitReadline).observe(footerEl);
    // buttons appearing/disappearing (⚠/✦ reply/Clear edits, ⊞ Lasso's own
    // label dropping to a glyph past ~420px) change the leftover without
    // necessarily resizing the footer itself
    if (typeof MutationObserver === "function") new MutationObserver(scheduleFitReadline).observe(footerEl, {attributes: true, attributeFilter: ["style", "class"], subtree: true});
  }
  fitReadline(); // initial state — applyChrome() isn't called at boot when nothing is folded
  {
    const old = localStorage.getItem("ff1roll-panelhide"); // migrate the combined key
    if (old !== null) {
      localStorage.setItem("ff1roll-editrow-hidden", old);
      localStorage.setItem("ff1roll-footer-hidden", old);
      localStorage.removeItem("ff1roll-panelhide");
    }
    // phones start folded (a hand-sized screen is for the music, not the
    // buttons); an explicit choice becomes the remembered one. iPads and up
    // start open. min(screen dims) < 500 CSS px ≈ every phone, no iPad.
    const scr = (typeof screen !== "undefined" && screen) || {width: 1024, height: 768};
    const phone = Math.min(scr.width, scr.height) < 500;
    const er = localStorage.getItem("ff1roll-editrow-hidden");
    const fo = localStorage.getItem("ff1roll-footer-hidden");
    S.editrowHidden = er === null ? phone : er === "1";
    S.footerHidden = fo === null ? phone : fo === "1";
    // phones are PLAYERS by default (Josh, 2026-08-23: "I want to send songs to
    // people and have them open them and listen") — roll + transport, nothing
    // else; the Full app button opts a device back into the whole DAW
    const lm = localStorage.getItem("ff1roll-listener");
    S.listenerMode = lm === null ? phone : lm === "1";
    applyListener();
    document.getElementById("fullappbtn").addEventListener("click", () => {
      S.listenerMode = false;
      localStorage.setItem("ff1roll-listener", "0");
      applyListener();
      setInfo("full app on — View ▾ → 'Listener mode' folds it back");
    });
    // the ▾ hide buttons retired (Josh, 2026-08-22): hiding is the View menu's
    // job now; the floating ▴ stays as the never-strand restore
    document.getElementById("panelshow").addEventListener("click", () => { S.editrowHidden = S.footerHidden = false; applyChrome(); });
    if (S.editrowHidden || S.footerHidden) applyChrome();
  }


    viewbtn.addEventListener("click", e => openDropUp(e.currentTarget, viewSwitchMenu));
  document.getElementById("vsRoll").addEventListener("click", () => { closeDropUp(); setViewMode("roll"); });
  document.getElementById("vsTracks").addEventListener("click", () => { closeDropUp(); setViewMode("tracks"); });
  document.getElementById("vsScore").addEventListener("click", () => { closeDropUp(); setViewMode("score"); });
}

export function initChrome9() {
  window.addEventListener("resize", resize);
  new ResizeObserver(resize).observe(wrap);
}

export function initChrome10() {
  subbtn.classList.toggle("active", S.subOn);
  subbtn.setAttribute("aria-pressed", String(S.subOn));
}

// the rest of Logic's transport keys (DAW review, 2026-09-29: muscle memory
// failed silently): Return = to the start, K = click on/off, C = cycle
// on/off, R = record, ⌘← / ⌘→ = zoom out / in around the cursor. Any song.
export function initChrome11() {
  document.addEventListener("keydown", e => {
    if (!S.song || e.repeat || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const meta = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (meta && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const f = e.key === "ArrowRight" ? 1.25 : 0.8, ppt0 = pxPerTick(), cx = S.RULER_W + S.playCursor * ppt0 - S.view.x;
      S.view.pxq = Math.min(400, Math.max(S.viewMode === "score" ? minPxq() : pxqFloor(), S.view.pxq * f));
      S.view.x = S.playCursor * pxPerTick() + S.RULER_W - cx; // the cursor stays where it was on screen
      clampView(); draw(); e.preventDefault(); return;
    }
    if (meta || e.shiftKey) return;
    if (e.key === "Enter" && t && (t.tagName === "BUTTON" || t.getAttribute("role") === "button")) return; // Return on a focused button (real or role=button) presses it
    if (e.key === "Enter") { document.getElementById("rwbtn").click(); e.preventDefault(); return; }
    if (k === "k") { document.getElementById("metbtn").click(); e.preventDefault(); return; }
    if (k === "x") { toggleMixer(); e.preventDefault(); return; } // Logic's mixer key
    if (e.key === "Escape" && S.rangeSel) { S.rangeSel = null; setInfo("range cleared"); draw(); return; }
    if (k === "c" && S.rangeSel && S.rangeSel.cycle && S.rangeSel.b > S.rangeSel.a) { S.rangeSel.off = !S.rangeSel.off; setInfo(S.rangeSel.off ? "cycle off" : "cycle on"); draw(); e.preventDefault(); return; }
    if (k === "r") { const rb = document.getElementById("recbtn"); if (rb && rb.offsetParent !== null) { rb.click(); e.preventDefault(); } return; }
    if (k === "q") { // Logic's Q: quantize the selection — only on your own songs
      if (editableSong()) document.getElementById("quantbtn").click(); else setInfo("Quantize works on your own songs");
      e.preventDefault(); return;
    }
  });
  // VoiceOver/keyboard (2026-09-30): the app's own role="button" elements
  // (track-chip M/S/H, the chip itself, the "what's Claude doing" strip, …)
  // are <span>/<div>, not real <button>s — a browser gives those no built-in
  // Enter/Space activation the way it does a <button>. One delegated listener
  // covers every one of them, present and future, the same way SHEET_TOP is
  // the one choke point for every sheet.
  document.addEventListener("keydown", e => {
    if ((e.key !== "Enter" && e.key !== " ") || e.repeat) return;
    const t = e.target;
    if (!t || t.tagName === "BUTTON" || t.getAttribute("role") !== "button") return;
    e.preventDefault();
    t.click();
  });
  document.addEventListener("keydown", e => { // space = play/stop, Logic-style
    if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
              t.isContentEditable || t.tagName === "BUTTON" || t.getAttribute("role") === "button")) return; // typing/tabbing wins
    if (!S.song) return;
    e.preventDefault(); // page must not scroll
    if (S.playing) stop(); else document.getElementById("playbtn").click();
  });
  document.getElementById("viewsheetbtn").addEventListener("click", e => {
    const sheet = document.getElementById("viewsheet");
    if (sheet.classList.contains("on")) { closeFileMenus(); return; }
    closeFileMenus();
    S.vwOpenGroup = null; // sub-menu follow-up, 2026-10-02: every group starts closed, each time View ▾ opens
    renderViewMenu();
    const r = e.currentTarget.getBoundingClientRect();
    sheet.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
    sheet.style.top = (r.bottom + 6) + "px";
    sheet.classList.add("on");
  });
  { // View toggles flip in place — the menu STAYS OPEN (batch hiding is the use)
    const on = (id, fn) => document.getElementById(id).addEventListener("click", () => { fn(); renderViewMenu(); });
    // Each group header toggles vwOpenGroup accordion-style: tapping the OPEN
    // group's own header closes it (back to null); tapping any other closes
    // whichever was open and opens this one — at most one group's content div
    // is ever visible. Same expanding-row mechanics "View type ▸" always used
    // (ruling #4, 2026-10-01 pm), just generalized to all six (sub-menu
    // follow-up, 2026-10-02, Josh: "View ▾ is too tall — make EVERY section an
    // expanding sub-menu").
    const toggleGroup = key => { S.vwOpenGroup = S.vwOpenGroup === key ? null : key; };
    on("vwViewType", () => toggleGroup("view"));
    on("vwPanels", () => toggleGroup("panels"));
    on("vwTools", () => toggleGroup("tools"));
    on("vwDisplay", () => toggleGroup("display"));
    on("vwBackground", () => toggleGroup("background"));
    on("vwMode", () => toggleGroup("mode"));
    // VIEW group is a radio (Josh, 2026-09-30): each item always SELECTS its
    // mode — no toggle-off — same as the footer's #viewbtn segmented control.
    // "View type ▸" (chrome density follow-up, 2026-10-01 pm): expands/
    // collapses #vwViewTypeRow in place — picking a row below still re-renders
    // (the "on" wrapper) so the ▸/▾ + current-view label stay in sync.
    on("vwRoll", () => setViewMode("roll"));
    on("vwScore", () => setViewMode("score"));
    on("vwListener", () => {
      S.listenerMode = !S.listenerMode;
      localStorage.setItem("ff1roll-listener", S.listenerMode ? "1" : "0");
      applyListener();
    });
    on("vwTracksView", () => setViewMode("tracks"));
    on("vwMixer", () => toggleMixer());
    on("vwLearning", () => { setAppMode(appMode() === "learning" ? "normal" : "learning"); applyMode(); });
    on("vwAnalyze", () => { // Normal-only (the item is absent otherwise) — compute on toggle, never per frame
      if (!analysisAvailable() || !S.song) return;
      S.analysisOn = !S.analysisOn;
      if (S.analysisOn) computeAnalysisLayer(); else { if (S._analysisTimer) { clearTimeout(S._analysisTimer); S._analysisTimer = null; } S.analysisBands = {chords: [], key: null}; }
      finalizeNotes();
      clampView();
      draw();
    });
    on("vwCompare", () => { document.getElementById("viewsheet").classList.remove("on"); if (S.cmp) cmpExit(); else cmpEnter(); });
    on("vwTracks", () => document.getElementById("tracktoggle").click());
    on("vwEdit", () => { S.editrowHidden = !S.editrowHidden; applyChrome(); });
    on("vwAdded", () => { setAddedOutline(!showAddedOutline()); drawFull(); });
    on("vwFooter", () => { S.footerHidden = !S.footerHidden; applyChrome(); });
    on("vwInst", () => document.getElementById("instbtn").click());
    on("vwSub", () => toggleSubtitle());
    on("vwVel", () => toggleVelLane());
    on("vwGrid", () => { document.getElementById("viewsheet").classList.remove("on"); openGridSheet(); });
    // BACKGROUND (chrome density follow-up, 2026-10-01 pm): both forward to
    // the footer buttons' own click handlers (renderJobs/errChip's sheets are
    // unchanged) — same "close View ▾ first" convention as vwGrid/vwCompare
    // above, since these open a separate overlay rather than toggling in
    // place. Works even while #jobsbtn/#errbtn are themselves hidden (0 jobs,
    // 0 unread) — a hidden button's own click() still fires.
    on("vwJobs", () => { document.getElementById("viewsheet").classList.remove("on"); document.getElementById("jobsbtn").click(); });
    on("vwMessages", () => { document.getElementById("viewsheet").classList.remove("on"); document.getElementById("errbtn").click(); });
    on("vwLevelsMinus", () => setSecDepth(Math.min(secDepthCap(), S.secMaxDepth - 1) - 1));
    on("vwLevelsPlus", () => setSecDepth(Math.min(secDepthCap(), S.secMaxDepth - 1) + 1));
  }
  // P6: the Analyze sheet — opened by tapping a band in the Analyze layer
  // (tap()); Adopt writes ONE annotation (or all chords) through the existing
  // write path, Cancel just closes (nothing is written by looking).
  document.getElementById("analyzeadopt").addEventListener("click", () => {
    if (!S.analyzeTarget) return;
    if (S.analyzeTarget.kind === "chord") adoptChordBand(S.analyzeTarget);
    else adoptKeyRegion({start: S.analyzeTarget.start, end: S.analyzeTarget.end, text: S.analyzeTarget.text,
                          name: S.analyzeTarget.text, sf: S.analysisBands.key ? S.analysisBands.key.sf : 0});
    document.getElementById("analyzesheet").classList.remove("on");
  });
  document.getElementById("analyzeadoptall").addEventListener("click", () => {
    adoptAllChords();
    document.getElementById("analyzesheet").classList.remove("on");
  });
  document.getElementById("analyzeclose").addEventListener("click", () => document.getElementById("analyzesheet").classList.remove("on"));
  document.addEventListener("pointerdown", e => { // tap-away closes the View menu
    const vs = document.getElementById("viewsheet");
    if (vs.classList.contains("on") && !vs.contains(e.target) && e.target.id !== "viewsheetbtn")
      vs.classList.remove("on");
  }, {capture: true});
  document.getElementById("editsheetbtn").addEventListener("click", e => {
    const sheet = document.getElementById("editsheet");
    if (sheet.classList.contains("on")) { closeFileMenus(); return; }
    closeFileMenus();
    const r = e.currentTarget.getBoundingClientRect();
    sheet.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 250)) + "px";
    sheet.style.top = (r.bottom + 6) + "px";
    sheet.classList.add("on");
  });
  { // menu items proxy the edit-row buttons — same guards, same messages
    const proxy = (id, fn) => document.getElementById(id).addEventListener("click", () => { closeFileMenus(); fn(); });
    proxy("emUndo", editUndoPop);
    proxy("emRedo", editRedoPop);
    proxy("emDup", () => document.getElementById("copybtn").click());
    proxy("emPaste", () => document.getElementById("pastebtn").click());
    proxy("emPasteTo", openPasteTo);
    proxy("emCut", () => document.getElementById("cutbtn").click());
    proxy("emDelete", () => document.getElementById("delbtn").click());
    proxy("emSplit", () => document.getElementById("splitbtn").click());
    proxy("emDivide", () => document.getElementById("divbtn").click());
    proxy("emJoin", () => document.getElementById("joinbtn").click());
    proxy("emQuantize", () => document.getElementById("quantbtn").click());
    proxy("emKeep", () => document.getElementById("instkeep").click()); // Capture MIDI (src/input/record.js captureKeep)
    proxy("emDedupe", () => {
      if (!editableSong()) { setInfo("Remove duplicate notes works on your own songs"); return; }
      const k = removeDuplicateNotes();
      setInfo(k ? "removed " + k + " duplicate note" + (k === 1 ? "" : "s") + " (undo restores them)" : "no duplicate notes in this song");
    });
    proxy("emMove", () => document.getElementById("movebtn").click());
    proxy("emTranspose", () => document.getElementById("trbtn").click());
    proxy("emInsertBars", () => { if (editableSong()) openInsertBars(); else setInfo("Insert bars works on your own songs"); });
    proxy("emDeleteBars", () => { if (editableSong()) openDeleteBars(); else setInfo("Delete bars works on your own songs"); });
    proxy("emChord", () => document.getElementById("insbtn").click());
    proxy("emFill", () => document.getElementById("drumfillbtn").click());
    proxy("emDrummer", () => openDrummer());
    proxy("emBassist", () => openBassist());
  }
  document.getElementById("filesheetbtn").addEventListener("click", e => {
    if (filesheet.classList.contains("on")) { closeFileMenus(); return; }
    closeFileMenus();
    fileMenuSaveLabels();
    renderOpenRecentRow();
    filesub.classList.remove("on");
    document.getElementById("filenewform").style.display = "none";
    document.getElementById("filesaveasform").style.display = "none";
    document.getElementById("filerenameform").style.display = "none";
    document.getElementById("filescoreform").style.display = "none";
    document.getElementById("filemoverow").style.display = isComposition() ? "" : "none";
    document.getElementById("filesavelocal").textContent = S.song && isUnsaved(S.songKey) ? "Save Version…" : "Save Version";
    if (isComposition()) { // move targets: any folder of yours, or a new one
      const sel = document.getElementById("fmdest");
      // name the current home first — a dropdown holding only the OTHER album
      // read as "destination selected" (Josh, 2026-09-07)
      document.getElementById("fmlbl").textContent = "In " + folderTitle(folderOf(S.songKey)) + " · move to";
      fillFolderSelect(sel, folderOf(S.songKey));
      document.getElementById("fmnewfolder").style.display = sel.value === "__new__" ? "" : "none";
    }
    const impN = importDraftKeys().length;
    const impBtn = document.getElementById("fileimpcommit");
    impBtn.style.display = impN ? "" : "none";
    impBtn.textContent = publishLabel("import (" + impN + ")");
    impBtn.disabled = !publishDest();
    { // the rename item names its victim: Rename "Overworld"…
      const t = S.currentPath ? songTitleOf(S.currentPath) : "";
      document.getElementById("filerename").textContent =
        t ? "Rename “" + (t.length > 18 ? t.slice(0, 17) + "…" : t) + "”…" : "Rename…";
    }
    { const origin = S.song && S.songKey ? originOf(S.songKey) : null;
      fileStatus(S.song && isUnsaved(S.songKey) ? "not saved yet — Save names it and picks its folder"
                 : isComposition() ? "your song — editable"
                 : (origin === "capture" || origin === "starter") ? "read-only here — ✎ Edit (or Save As…) makes an editable copy"
                 : "read-only here — Save As makes an editable copy in a folder of yours"); }
    const r = e.currentTarget.getBoundingClientRect();
    filesheet.style.left = Math.max(6, r.left) + "px";
    filesheet.style.top = (r.bottom + 4) + "px";
    filesheet.classList.add("on");
  });
  document.addEventListener("pointerdown", e => { // tap-away closes, like a real menu
    if (!filesheet.classList.contains("on") && !filesub.classList.contains("on")) return;
    if (filesheet.contains(e.target) || filesub.contains(e.target) || e.target.closest("#filesheetbtn")) return;
    closeFileMenus();
  }, {capture: true});
  document.getElementById("fmdest").addEventListener("change", () => {
    const isNew = document.getElementById("fmdest").value === "__new__";
    document.getElementById("fmnewfolder").style.display = isNew ? "" : "none";
    if (isNew) document.getElementById("fmnewfolder").focus();
  });
  document.getElementById("fmgo").addEventListener("click", e => {
    const folder = chosenFolder(document.getElementById("fmdest"), document.getElementById("fmnewfolder"));
    if (!folder) { fileStatus("⚠ Pick a folder, or type a name for a new one."); return; }
    if (!isComposition()) return;
    localStorage.setItem("ff1roll-lastfolder", folder);
    e.currentTarget.disabled = true;
    moveComposition("albums/" + folder + "/").finally(() => { e.currentTarget.disabled = false; });
  });
   document.addEventListener("pointerdown", e => { // tap-away closes — exempts the trigger buttons themselves (their own click handler does the toggle-closed, via `was` above) and anything inside the open menu, so a native <select> inside it (#findsel) and its iOS picker stay safe
    if (!S.dropUpOpen) return;
    if (S.dropUpOpen.contains(e.target) || e.target.closest("#viewbtn, #listbtn, #askattach")) return;
    closeDropUp();
  }, {capture: true});
}

export function initChrome12() {
  document.getElementById("fileinst").addEventListener("click", () => {
    closeFileMenus();
    document.getElementById("instsheet").classList.add("on");
    S.instNav = {sys: null, game: null, sub: null};
    renderInstSheet();
  });
  document.getElementById("fileopen").addEventListener("click", e => {
    const group = Object.entries(S.CATALOG).find(([, songs]) => songs.some(([, p]) => p === S.currentPath));
    if (S.currentPath && localStorage.getItem("ff1roll-draft-" + S.currentPath)) fsubFolder("local", folderOf(S.currentPath)); // the local copy is what's open
    else if (group) fsubFolder("published", folderOf(S.currentPath));
    else fsubAlbums();
    const mr = filesheet.getBoundingClientRect();
    const ir = e.currentTarget.getBoundingClientRect();
    filesub.style.left = Math.min(mr.right + 4, songRegionRight() - 240) + "px";
    filesub.style.top = ir.top + "px";
    filesub.classList.add("on");
  });
  document.getElementById("fileopenrecent").addEventListener("click", () => {
    S.fileOpenRecentOpen = !S.fileOpenRecentOpen;
    renderOpenRecentRow();
  });
  document.getElementById("filenew").addEventListener("click", () => {
    document.getElementById("filenewform").style.display = "";
    document.getElementById("filesaveasform").style.display = "none";
    document.getElementById("fnbpm").focus();
  });
  document.getElementById("fncreate").addEventListener("click", () => {
    stop();
    createComposition(+document.getElementById("fnbpm").value || 120,
                      +document.getElementById("fnnum").value, +document.getElementById("fnden").value);
    document.getElementById("filesheet").classList.remove("on");
    setInfo("new song — Edit → Pencil to write. It lives on this device as " + songTitleOf(S.songKey) + " until File → Save Version names it and picks its folder.");
  });
  // return key in the name fields = the primary action (iOS keyboards
  // otherwise cost an extra tap: the first one just dismisses the keyboard)
  document.getElementById("fsname").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("fsgo").click(); }
  });
  document.getElementById("fsnewfolder").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("fsname").focus(); }
  });
  document.getElementById("fsfolder").addEventListener("change", () => {
    const isNew = document.getElementById("fsfolder").value === "__new__";
    document.getElementById("fsnewfolder").style.display = isNew ? "" : "none";
    if (isNew) document.getElementById("fsnewfolder").focus();
  });
  document.getElementById("filesaveas").addEventListener("click", () => { if (S.song) openSaveForm("fork"); });
  document.getElementById("fsgo").addEventListener("click", async () => {
    const form = document.getElementById("filesaveasform");
    const name = document.getElementById("fsname").value;
    const folder = chosenFolder(document.getElementById("fsfolder"), document.getElementById("fsnewfolder"));
    if (!folder) { fileStatus("⚠ Pick a folder, or type a name for a new one."); document.getElementById("fsnewfolder").focus(); return; }
    if (!name.trim()) { fileStatus("⚠ Name the song."); document.getElementById("fsname").focus(); return; }
    stop();
    if (form.dataset.mode === "editcopy") {
      makeItMine(name, folder);
      document.getElementById("filesheet").classList.remove("on");
      return;
    }
    if (form.dataset.mode === "fork") {
      forkCurrentSong(name, folder);
      document.getElementById("filesheet").classList.remove("on");
      setInfo("copy saved as " + name.trim() + " in " + folderTitle(folder) + " — fully editable; Publish sends it to GitHub.");
      return;
    }
    if (form.dataset.mode === "publish") { // Publish on a song with no folder yet (lotion, 2026-10-03) — publishUnsavedSong is the one place this happens, left open afterward (status line) like ghsave's own writing-mode branch
      const btn = document.getElementById("fsgo");
      btn.disabled = true;
      try { await publishUnsavedSong(folder, name); }
      finally { btn.disabled = false; }
      return;
    }
    if (await saveSongAs(folder, name)) document.getElementById("filesheet").classList.remove("on");
  });
  // Rename works on EVERYTHING (Josh 2026-08-16): an uncommitted draft renames
  // its file; a repo song keeps its filename (analysis docs reference it) and
  // gets a display-title override in album.json + the manifest instead
  document.getElementById("filerename").addEventListener("click", () => {
    if (!S.songKey) { fileStatus("Nothing to rename — no song open."); return; }
    document.getElementById("filerenameform").style.display = "";
    document.getElementById("filenewform").style.display = "none";
    document.getElementById("filesaveasform").style.display = "none";
    const inp = document.getElementById("frname");
    inp.value = songTitleOf(S.songKey);
    inp.focus();
    inp.select();
  });
  document.getElementById("frname").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("frgo").click(); }
  });
  document.getElementById("frgo").addEventListener("click", async e => {
    const raw = document.getElementById("frname").value.trim();
    if (!raw || !S.songKey) { fileStatus("⚠ Type the new name first."); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const hasDraft = localStorage.getItem(draftStoreKey(S.songKey)) !== null;
      if (hasDraft && !(S.song && S.song.savedStamp)) { // never committed: rename the file itself
        const newKey = renameImportDraft(S.songKey, raw);
        if (newKey === null) { fileStatus("⚠ A draft named \"" + slugify(raw) + "\" already exists."); return; }
        updateSongBtn();
        fileStatus("Renamed ✓ (local draft — the name commits with it).");
      } else { // repo song: title override, filename untouched
        const token = writeToken();
        if (!token) { fileStatus("No GitHub token stored yet — add one in File → Settings."); return; }
        fileStatus("Renaming…");
        await renameRepoTitle(S.songKey, raw, ghHeaders(token));
        await initCatalog().catch(() => { /* CDN lag; next boot */ });
        // the refetched manifest can be CDN-stale for ~10 min — the repo write
        // succeeded, so patch the in-memory catalog instead of trusting it
        // (Josh renamed Main Theme and the crumb kept saying Main Theme)
        for (const songs of Object.values(S.CATALOG)) {
          const hit = songs.find(([, p]) => p === S.songKey);
          if (hit) hit[0] = raw;
        }
        updateSongBtn();
        fileStatus("Renamed ✓ — \"" + raw + "\" everywhere the dropdown shows it.");
      }
      document.getElementById("filerenameform").style.display = "none";
    } catch (err) { fileStatus("Rename failed: " + err.message); }
    finally { btn.disabled = false; }
  });
  document.getElementById("editherebtn").addEventListener("click", () => editHereNow());
  // ✎ Edit (Josh's ruling, renamed from "✎ Make it mine"): opens the "Edit a
  // copy" sheet instead of forking straight away — same destination, one more
  // tap to see/change the name and folder first.
  document.getElementById("makeitminebtn").addEventListener("click", () => openSaveForm("editcopy"));
  document.getElementById("filesavelocal").addEventListener("click", () => { if (S.song && isUnsaved(S.songKey)) { openSaveForm("save"); return; } closeFileMenus(); saveVersion(); });
  document.getElementById("filerevert").addEventListener("click", () => {
    if (!S.songKey) { setInfo("open a song first"); return; }
    if (S.songKey.startsWith("local/")) { setInfo("local imports have no repo copy to go back to"); return; }
    closeFileMenus();
    openVersionsSheet();
  });
  document.getElementById("filedlaudio").addEventListener("click", async () => {
    if (!S.song) return;
    closeFileMenus();
    if (S.exporting) { setInfo("already exporting — it finishes when the song does"); return; }
    albumClear();
    S.exporting = true;
    let result = null, method = "offline";
    try {
      ensureAudio();
      await resumeAudio();
      const off = await renderSongOffline();
      if (off.ok) {
        result = {blob: new Blob([audioBufferToWav(off.buffer)], {type: "audio/wav"}),
                  name: (S.songKey ? S.songKey.split("/").pop().replace(/\.mid$/, "") : "song") + ".wav"};
      } else {
        logDebug("Download audio: offline bounce unavailable (" + off.why + ") — falling back to the real-time recorder");
        method = "realtime";
        result = await recordRealtimeAudio();
      }
    } finally { S.exporting = false; }
    if (!result) return; // recordRealtimeAudio already said why (no MediaRecorder either)
    try { await deliverAudioFile(result.blob, result.name); }
    catch (err) { logErr("Download audio: " + (err && err.message || err)); return; }
    setInfo((method === "offline" ? "audio bounced: " : "audio saved: ") + result.name + " (" + Math.round(result.blob.size / 1024) + " KB)");
  });
  document.getElementById("filedlmid").addEventListener("click", () => {
    if (!S.song) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([writeMidi(S.song)], {type: "audio/midi"}));
    a.download = (S.songKey ? S.songKey.split("/").pop() : "song.mid");
    a.click();
    URL.revokeObjectURL(a.href);
  });
  // File ▾ → Export score… (DAW F6): the row only picks the paper; the pages
  // and the hand-over are render/score-print.js (same delivery as Download
  // audio). Paper is a device pref — the file it makes is the song's.
  document.getElementById("filedlscore").addEventListener("click", () => {
    if (!S.song) { setInfo("open a song first"); return; }
    const form = document.getElementById("filescoreform");
    const open = form.style.display === ""; // the markup starts it at display:none
    document.getElementById("filenewform").style.display = "none";
    document.getElementById("filesaveasform").style.display = "none";
    document.getElementById("filerenameform").style.display = "none";
    form.style.display = open ? "none" : "";
    try { const p = localStorage.getItem("ff1roll-score-paper"); if (p) document.getElementById("fsxpaper").value = p; } catch (e) {}
  });
  document.getElementById("fsxgo").addEventListener("click", async () => {
    const paper = document.getElementById("fsxpaper").value || "letter";
    try { localStorage.setItem("ff1roll-score-paper", paper); } catch (e) {}
    closeFileMenus();
    await exportScore(paper);
  });
}

export function initChrome13() {
  document.getElementById("filesave").addEventListener("click", () => {
    // one door for both modes (Josh, 2026-08-18): Save opens the sync sheet, which
    // shows pending annotations; its commit button pushes what the mode owns —
    // compositions: .mid + annotations together; analyzed songs: annotations only
    if (!S.song) return;
    closeFileMenus();
    openSyncSheet();
  });
}

export function initChrome14() {
  {
    const fn = document.getElementById("fnnum");
    for (let n = 2; n <= 12; n++) {
      const o = document.createElement("option");
      o.textContent = String(n);
      if (n === 4) o.selected = true;
      fn.appendChild(o);
    }
  }

   if (document.getElementById("cmpswap")) {
    document.getElementById("cmpswap").addEventListener("click", () => cmpShow(S.cmp && S.cmp.showing === "mine" ? "repo" : "mine"));
    document.getElementById("cmpdone").addEventListener("click", cmpExit);
  }
}

export function initChrome15() {
  document.addEventListener("visibilitychange", () => { if (document.hidden) flushBackupNow(); });
}

export function initChrome16() {
  if (typeof document !== "undefined" && document.body && document.body.dataset) document.body.dataset.edition = EDITION; // the vm harness has no body
  applyViewMode();
  resize();
  updateSyncBtn();
}
