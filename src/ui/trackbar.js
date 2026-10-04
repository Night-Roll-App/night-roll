import { S } from "../state.js";
import { renderTrackbar } from "../hooks.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { updateTrackGains } from "../audio/engine.js";
import { clampViewImpl as clampView } from "./chrome.js";
import { drawImpl as draw } from "./chrome.js";
import { pushUndo } from "../model/edits.js";
import { annoSnapshot } from "../model/edits.js";
import { tombstone } from "../model/edits.js";
import { trackDirText } from "../model/rollnotes.js";
import { resolveNote } from "../model/rollnotes.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { saveLocalNotes } from "../model/edits.js";
import { updateSyncBtnImpl as updateSyncBtn } from "./chrome.js";
import { isComposition } from "../model/provenance.js";
import { isLocalDraft } from "../model/edits.js";
import { audioDirText } from "../model/rollnotes.js";
import { saveDraft } from "../model/versions.js";
import { trackColor } from "../render/roll.js";
import { openVoiceMenu } from "./voice-menu.js";
import { addTrackUndoable } from "../model/edits.js";
import { trackIsDrums } from "../model/grid.js";
import { setInfoImpl as setInfo } from "./chrome.js";
import { prof } from "../state.js";

export function updateTrackMore() {
  const bar = document.getElementById("trackbar");
  const more = document.getElementById("trackmore");
  const slide = document.getElementById("trackslide");
  bar.classList.toggle("collapsed", !S.trackExpand);
  // never measure while the cluster is hidden or mid-slide — a squeezed
  // width wraps every chip and poisons the disclosure state
  if (slide && (slide.classList.contains("off") || slide.clientWidth < 60)) return;
  // reading scrollHeight forces a fresh layout — measure synchronously
  const overflowing = bar.scrollHeight > bar.clientHeight + 2;
  more.style.display = overflowing || S.trackExpand ? "" : "none";
  more.textContent = S.trackExpand ? "▴" : "▾";
}
// chips too wide to sit beside the transport (the AI window docked wide cut
// them to "pu…" — Josh, 2026-10-02) move to their own full-width row. The
// decision reads ONLY the row's width against a threshold that stacking
// cannot change: the transport's buttons (their own widths, summed) plus the
// chips' full text widths (scrollWidth — the same squeezed or not). An
// earlier version also read the ▾ overflow signal, which the stacking itself
// flips; at some widths it toggled every frame and the iPad blinked nonstop
// (0692e13, reverted). Unstacking needs TRACK_ROW_SLACK more room, so a
// width right at the threshold can't flip back and forth either.
export const TRACK_ROW_SLACK = 60;
export function trackRowNeed() {
  const tp = document.getElementById("transport"), bar = document.getElementById("trackbar"), tog = document.getElementById("tracktoggle");
  const kids = el => [...el.children].filter(c => c.offsetParent !== null || c.style.display !== "none");
  const tc = document.getElementById("timectl");
  const tw = kids(tp).reduce((w, c) => w + c.offsetWidth + 8, 0) + (tc ? kids(tc).reduce((w, c) => w + c.offsetWidth + 8, 8) : 0); // the time controls ride the same row
  const cw = kids(bar).reduce((w, c) => w + Math.max(c.scrollWidth, c.offsetWidth) + 8, 0);
  return tw + cw + (tog ? tog.offsetWidth + 16 : 0) + 24;
}
export function fitTrackRow() {
  const row = document.getElementById("trackrow");
  if (!row || !row.clientWidth) return;
  const stacked = row.classList.contains("stacked"), need = trackRowNeed(), w = row.clientWidth;
  const stack = stacked ? w < need + TRACK_ROW_SLACK : w < need;
  if (stack !== stacked) { row.classList.toggle("stacked", stack); updateTrackMore(); }
}
export function scheduleFitTrackRow() { // a function property, not S: called from observers only
  if (scheduleFitTrackRow.pending) return;
  scheduleFitTrackRow.pending = true;
  requestAnimationFrame(() => { scheduleFitTrackRow.pending = false; fitTrackRow(); });
}

export function trackToggle(ti, what) { // M / S / H from a chip or a lane header: the song remembers it (track: annotation)
  const st = S.trackState[ti] || (S.trackState[ti] = {muted: false, solo: false});
  st[what] = !st[what];
  if (S.song && S.song.tracks[ti]) saveTrackDir(ti); // finalizeNotes re-applies it, then renders
  renderTrackbar(); buildScoreModel(); updateTrackGains(); clampView(); draw();
}
export function saveVoices() { saveTrackDir(S.voiceMenuTi); }
export function saveTrackDir(ti) { // upsert this track's "track:" directive — a normal
  // synced annotation (Josh, 2026-08-15): voice & color are song truths; so
  // are mute / solo / hide (2026-09-29: DAWs save them with the project)
  const tr = S.song.tracks[ti];
  const name = tr.name || "tr" + (ti + 1);
  const st = S.trackState[ti] || {};
  const d = {name, voice: tr.voice, color: tr.color, vol: tr.vol !== 1 ? tr.vol : undefined, pan: tr.pan,
             mute: !!st.muted, solo: !!st.solo, hide: !!st.hidden};
  // one undo step (DAW review, 2026-09-29: a stray fader drag or voice tap
  // couldn't be taken back): the directives as they were, before this change
  pushUndo({kind: "anno", json: annoSnapshot()});
  S.rollnotes.forEach(n => { if (n.trackdir && n.trackdir.name.toLowerCase() === name.toLowerCase()) tombstone(n); });
  S.rollnotes = S.rollnotes.filter(n => !(n.trackdir && n.trackdir.name.toLowerCase() === name.toLowerCase()));
  const text = trackDirText(d); // 0 pan is written too: it overrides a .mid's own pan
  if (text !== "track: " + name) S.rollnotes.push(resolveNote({b1: 1, q1: 1, b2: null, q2: null, text, trackdir: d, added: true}));
  finalizeNotes(); // re-applies (or reverts) voice/color/mute/solo/hide from the directives
  saveLocalNotes();
  updateSyncBtn();
}
// ti, or null = the whole selection
export function renameTrack(ti, newName) { // compositions/local drafts only — analysis songs regenerate from NSF
  newName = (newName || "").trim();
  if (!newName) return "name is empty";
  if (!isComposition() && !isLocalDraft()) return "captures are locked — track names come from the pipeline";
  if (S.song.tracks.some((t, i) => i !== ti && (t.name || "") .toLowerCase() === newName.toLowerCase()))
    return "another track is already called that";
  const oldName = S.song.tracks[ti].name || "tr" + (ti + 1);
  S.song.tracks[ti].name = newName;
  delete S.song.tracks[ti].drums; // drum-ness derives from the name; re-derive
  for (const n of S.rollnotes) { // migrate EVERY matching directive, stale dupes included
    if (n.audiodir && n.audiodir.track.toLowerCase() === oldName.toLowerCase()) { // the clip follows the name
      tombstone(n); // its identity changes with the text
      n.audiodir.track = newName;
      n.text = audioDirText(n.audiodir);
      n.added = true;
      continue;
    }
    if (!n.trackdir || n.trackdir.name.toLowerCase() !== oldName.toLowerCase()) continue;
    n.trackdir.name = newName;
    n.text = trackDirText(n.trackdir);
    n.added = true; // the migrated directive must persist and sync
  }
  finalizeNotes();
  saveLocalNotes();
  saveDraft(); // the .mid bakes the name on the next Save & Commit
  renderTrackbar();
  if (S.viewMode === "score") buildScoreModel();
  draw();
  return null;
}

// chord band armed for a challenge (tap on the ruler)
// ---------------------------------------------------------------- track chips
export function renderTrackbarImpl() {
  const bar = document.getElementById("trackbar");
  bar.innerHTML = "";
  S.song.tracks.forEach((tr, ti) => {
    const chip = document.createElement("div");
    const st = S.trackState[ti] || (S.trackState[ti] = {muted: false, solo: false});
    chip.className = "chip" + (st.muted || st.hidden ? " muted" : "") + (ti === S.selTrack ? " selected" : "");
    chip.dataset.ti = String(ti); // which track this chip belongs to — the tap-away closer (below) needs it to tell "the menu's own chip" from "a different track"
    chip.setAttribute("role", "button");
    chip.tabIndex = 0;
    const trName = (tr.name || "track " + (ti + 1));
    chip.setAttribute("aria-label", trName + (ti === S.selTrack ? " — selected, activate again for voice & color" : " — select"));
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = trackColor(ti);
    const label = document.createElement("span");
    label.textContent = (tr.name || "tr" + (ti+1)).slice(0, 18) + (tr.kind === "audio" ? " ∿" : "");
    // M silences, S solos, H hides — three separate things, as in a DAW
    // (2026-09-29: M used to hide AND silence; muting the bass lost sight of it)
    // Each is a real toggle for VoiceOver: role=button (a <span> gets no
    // built-in keyboard activation — the delegated Enter/Space listener
    // above handles that), tabindex so Tab reaches it independently of the
    // chip, and aria-pressed kept in step with the .on class that already
    // drives the look.
    const mkToggle = (glyph, on, label2, key) => {
      const s = document.createElement("span");
      s.className = "solo" + (on ? " on" : "");
      s.textContent = glyph;
      s.setAttribute("role", "button");
      s.tabIndex = 0;
      s.setAttribute("aria-label", label2 + " " + trName);
      s.setAttribute("aria-pressed", String(on));
      s.addEventListener("click", e => {
        e.stopPropagation();
        trackToggle(ti, key);
      });
      return s;
    };
    const mute = mkToggle("M", S.trackState[ti].muted, "Mute", "muted");
    const solo = mkToggle("S", S.trackState[ti].solo, "Solo", "solo");
    chip.append(dot, label, mute, solo);
    // H off the chip (Chrome density pass, 2026-10-01: ~24px narrower per
    // chip) — hiding now starts from the voice menu's #vmhide (buildVoiceMenu)
    // or the Mixer's own H; the chip only shows a toggle once a track IS
    // hidden, lit gold, so one tap there still brings it straight back.
    if (S.trackState[ti].hidden) {
      const hide = mkToggle("H", true, "Hide", "hidden");
      hide.title = "Unhide this track's notes";
      chip.append(hide);
    }
    chip.addEventListener("click", e => {
      if (ti === S.selTrack) { openVoiceMenu(ti, chip); return; } // second tap: voice & color
      // a first tap on a DIFFERENT track must not leave the old track's voice
      // menu open behind it (Josh, traced 2026-09-29) — the tap-away closer
      // below exempts only the MENU'S OWN chip, so this one still needs to
      // close it itself when the menu belongs to some other (now deselected) track
      const menu = document.getElementById("voicemenu");
      if (menu.classList.contains("on")) { menu.classList.remove("on"); S.voiceMenuTi = -1; }
      S.selTrack = ti;
      renderTrackbar(); buildScoreModel(); updateTrackGains(); clampView(); draw();
    });
    bar.appendChild(chip);
  });
  if (isComposition()) { // compositions grow: + track appends an empty NES voice
    const add = document.createElement("div");
    add.className = "chip";
    add.setAttribute("role", "button");
    add.textContent = "＋";
    add.setAttribute("aria-label", "Add track");
    add.title = "Add track";
    add.addEventListener("click", () => {
      S.selTrack = addTrackUndoable({name: "voice" + (S.song.tracks.length + 1), notes: []});
      pushUndo({kind: "trackRemove", ti: S.selTrack});
      S.trackExpand = true; // the new chip may land in the overflow rows — show it (Josh's iPad)
      saveDraft();
      renderTrackbar(); buildScoreModel(); updateTrackGains(); draw();
    });
    bar.appendChild(add);
    { // ＋∿: a recording as a track — one tap opens the audio picker (Josh's son's door)
      const au = document.createElement("div");
      au.className = "chip";
      au.setAttribute("role", "button");
      au.textContent = "＋∿";
      au.setAttribute("aria-label", "Add audio track");
      au.title = "Add audio track (a recording: wav, mp3, m4a…)";
      au.addEventListener("click", () => { S.audioReplaceTi = null; document.getElementById("audioinput").click(); });
      bar.appendChild(au);
    }
    if (!S.song.tracks.some((_, ti) => trackIsDrums(ti))) { // one kit per song
      const drums = document.createElement("div");
      drums.className = "chip";
      drums.setAttribute("role", "button");
      drums.textContent = "＋🥁";
      drums.setAttribute("aria-label", "Add drum track");
      drums.title = "Add drum track";
      drums.addEventListener("click", () => {
        S.selTrack = addTrackUndoable({name: "drums", notes: []});
        pushUndo({kind: "trackRemove", ti: S.selTrack});
        S.trackExpand = true; // ditto: never hide the track just added
        saveDraft();
        renderTrackbar(); buildScoreModel(); updateTrackGains(); draw();
        setInfo("drums: rows are GM kit pieces — kick C2, snare D2, hats F♯/A♯2, crash C♯3, toms around G2 (labels in the left gutter)");
      });
      bar.appendChild(drums);
    }
  }
  updateTrackMore();
  fitTrackRow(); // settle stacking in THIS frame: a frame later the roll shifted under whatever was just measured (a tap, an e2e drag)
}
renderTrackbarImpl = prof("renderTrackbar", renderTrackbarImpl); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

export function initTrackbar1() {
  document.getElementById("trackmore").addEventListener("click", () => {
    S.trackExpand = !S.trackExpand;
    updateTrackMore();
  });
  if (typeof document !== "undefined" && document.body && typeof ResizeObserver === "function") {
    const tr = document.getElementById("trackrow");
    if (tr) new ResizeObserver(scheduleFitTrackRow).observe(tr); // the row's WIDTH changes with the window/dock; stacking only changes its height
    const tb = document.getElementById("trackbar");
    if (tb && typeof MutationObserver === "function") new MutationObserver(scheduleFitTrackRow).observe(tb, {childList: true}); // tracks added/removed change the need
  }
  // slide the whole chip cluster away when the row feels noisy (Josh, 2026-08-15)
  {
    const slide = document.getElementById("trackslide");
    const tog = document.getElementById("tracktoggle");
    const apply = hidden => {
      slide.classList.toggle("off", hidden);
      tog.textContent = hidden ? "▸" : "◂";
      tog.setAttribute("aria-label", hidden ? "Show tracks" : "Hide tracks");
      if (!hidden) updateTrackMore();
    };
    tog.addEventListener("click", () => {
      const hidden = !slide.classList.contains("off");
      localStorage.setItem("ff1roll-tracks-hidden", hidden ? "1" : "0");
      apply(hidden);
    });
    // re-measure once the slide animation actually finishes — measuring at a
    // transitional width wrapped chips onto phantom rows (Josh's toggle bug)
    slide.addEventListener("transitionend", () => {
      if (!slide.classList.contains("off")) updateTrackMore();
    });
    apply(localStorage.getItem("ff1roll-tracks-hidden") === "1");
  }
}
