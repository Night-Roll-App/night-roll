import { connected } from "../sync/publish.js";
import { S, prof } from "../state.js";
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
import { songTitleOf } from "../ask/context.js";
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
import { scoreTickToX } from "../render/score.js";
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
import { draftWrite } from "./sheets.js";
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
import { notesTxtFor } from "../sync/publish.js";

export function updateSyncBtn() {
  const btn = document.getElementById("syncbtn");
  if (!connected()) { btn.style.display = "none"; return; } // Model B: not connected anywhere = no footer Publish button
  btn.style.display = "";
  const n = pendingSongs().length;
  btn.textContent = n ? "Publish (" + n + ")" : "Publish"; // one pending song is a count too (Josh: "the publish doesn't have a one"); shows even at N=0 once connected
}
export function appConfirm(title, body, okLabel, cancelLabel) { // non-blocking confirm:
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
export function updateJobsBtn() {
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
export function logErr(msg) { logPush(appErrors, msg); errChip(); }
export function logDebug(msg) { logPush(appDebug, msg); console.log("[debug] " + msg); if (debugLogOn()) errChip(); }
export function srAnnounce(text) {
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
export function setInfo(s, copyText) {
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
export function updateSongBtn() { // breadcrumb: Album › Title, with the real path dimmed after
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
  if (S.instOpen) instResize(); // canvas had zero size while display:none
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
    if (key === "general") { if (askUnsavedCount(k) > 0) set.add("general"); continue; } // the general chat: no song, its own block
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
export function draw() { S.sceneValid = false; rangeSelPersist(); viewPersistSoon(); drawFull(false); }
draw = prof("draw", draw); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
export function playbackFrame() {
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
  const tick = secToTick(S.song, playSec());
  const x = S.viewMode === "score" && S.scoreModel ? scoreTickToX(tick) : S.RULER_W + tick * pxPerTick() - S.view.x; // the score spaces by noteheads, not ticks
  const H = wrap.clientHeight;
  if (x >= S.RULER_W) {
    ctx.fillStyle = css("--gold");
    ctx.fillRect(x, S.RULER_H, 1.5, H - S.RULER_H);
    ctx.beginPath();
    ctx.moveTo(x - 11, S.RULER_H);
    ctx.lineTo(x + 11, S.RULER_H);
    ctx.lineTo(x, S.RULER_H + 14);
    ctx.fill();
    drawStripPlayhead(x, css("--gold")); // playbackFrame only ever runs while S.playing
    S.phLastX = x;
  } else S.phLastX = null;
}
playbackFrame = prof("playbackFrame", playbackFrame); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()
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

  function cursorHandle(x) { // Logic-sized triangle under the ruler, made for fingers
    ctx.beginPath();
    ctx.moveTo(x - 11, S.RULER_H);
    ctx.lineTo(x + 11, S.RULER_H);
    ctx.lineTo(x, S.RULER_H + 14);
    ctx.fill();
  }
  // playhead / cursor — same triangle either way, gold while rolling
  if (skipCursor) { /* playbackFrame lays the playhead over the cached scene */ }
  else if (S.playing) {
    const tick = secToTick(S.song, playSec());
    const x = S.RULER_W + tick * ppt - S.view.x;
    ctx.fillStyle = css("--gold");
    ctx.fillRect(x, 0, 1.5, H);
    cursorHandle(x);
  } else {
    const x = S.RULER_W + S.playCursor * ppt - S.view.x;
    ctx.fillStyle = css("--accent");
    ctx.fillRect(x - 1, 0, 2.5, H);
    cursorHandle(x);
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
export function clampView() {
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

export function saveDraft(clean) { // clean=true right after a successful Publish; the working copy follows every edit regardless (crash recovery)
  if (!isComposition() && !isLocalDraft()) return;
  if (S.cmp && S.cmp.showing === "repo") return; // the saved copy is swapped in: writing it over the draft would destroy his edits
  try {
    const landed = draftWrite(S.songKey, draftDoc(clean));
    if (S.song.overlayFold) retireOldOverlay(S.song.overlayFold, landed);
    if (editableSong()) scheduleBackupFlush(); // off-device backup (2026-10-02 deploy safeguards) — only an actual write schedules one
  } catch (err) { // a full localStorage must never throw out of an edit: say so, loudly, once per song
    if (saveDraft.warned !== S.songKey) { saveDraft.warned = S.songKey; logErr("this device's storage is full — the last edit to " + baseName() + " is NOT saved. Publish, or ✕ some drafts under Open → drafts, then edit again."); }
    setInfo("⚠ storage full — edit not saved (see ⚠)");
  }
  updateSongBtn(); // the unsaved dot tracks every edit
  updateSyncBtn(); // and the Publish (N) count: an undo back to the published music takes a song off it
  filesMirrorSoon(); // the Files copy follows, once the edits settle — every edit is kept, always (Model B)
}
saveDraft = prof("saveDraft", saveDraft);

// saveDraft calls this after a write while song.overlayFold is pending;
// landed is draftWrite's answer (true, or the IndexedDB put's promise)
export function retireOldOverlay(f, landed) {
  return Promise.resolve(landed).then(ok => ok ? draftRead(f.key) : null).then(d => {
    if (!d || !d.tracks) return false;
    const have = new Set();
    d.tracks.forEach((tr, ti) => tr.notes.forEach(n => have.add(overlayNoteSig(ti, n))));
    const missing = f.need.filter(sig => !have.has(sig)).length;
    if (missing) { logDebug("old edits on " + f.key + " kept: the saved draft lacks " + missing + " of their notes"); return false; }
    const live = "ff1roll-edits-" + f.key;
    if (localStorage.getItem(live) !== f.raw) return false; // changed since the load: not ours to move
    localStorage.setItem("ff1roll-retired-edits-" + f.key + "@" + Date.now(), f.raw); // a full store throws here: the overlay stays
    localStorage.removeItem(live);
    if (S.song && S.song.overlayFold === f) delete S.song.overlayFold;
    updateClearBtn();
    return true;
  }).catch(err => { logDebug("old edits on " + f.key + " kept: " + (err && err.message || err)); return false; });
}
export function scheduleBackupFlush() {
  if (!S.askCaps.bridge) return;
  clearTimeout(S.backupFlushTimer);
  S.backupFlushTimer = setTimeout(flushBackupNow, 5000);
}
export function filesMirrorSoon() { clearTimeout(S.filesMirrorT); S.filesMirrorT = setTimeout(filesMirror, 2000); }

export async function draftRead(key) { // the whole draft, notes included, or null
  const raw = localStorage.getItem(draftStoreKey(key));
  if (raw === null) return null;
  let d = null; try { d = JSON.parse(raw); } catch (err) { return null; }
  if (d && d.tracksRef && !d.tracks) {
    if (key.startsWith("local/")) return localDraftTracks(key, d);
    d.tracks = (await idbDraftGet(key)) || [];
  }
  return d;
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
export async function filesMirror() {
  const fs = nativeFs();
  if (!fs || !S.song || !S.songKey || !isComposition()) return false;
  const root = nativeDirHandle(fs, "");
  const base = S.songKey.replace(/\.mid$/, "");
  try {
    await folderWrite(S.songKey, writeMidi(S.song), root);
    await folderWrite(base + ".rollnotes.json", serializeRollnotesStamped(Date.now()), root);
    await folderWrite(base + ".notes.txt", notesTxtFor(), root);
    return true;
  } catch (err) {
    if (filesMirror.warned !== S.songKey) { filesMirror.warned = S.songKey; setInfo("⚠ couldn't write the song into Files: " + err.message); }
    return false;
  }
}

// a local draft whose localStorage copy is only the stub: its notes from the
// IndexedDB record ({seq, tracks}; an old build's is the bare tracks array).
// A whole localStorage copy never consults IndexedDB — it was written
// synchronously with the newest seq.
export async function localDraftTracks(key, d) {
  const v = await idbDraftGet(key);
  const tracks = v ? (Array.isArray(v) ? v : v.tracks) : null, seq = v && !Array.isArray(v) ? v.seq || 0 : 0;
  if (d.seq && seq < d.seq) logErr(key.split("/").pop() + ": the app closed before its last edit was stored — opening the copy before it");
  d.tracks = tracks || [];
  return d;
}
