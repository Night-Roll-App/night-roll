// src/ui/controls.js (docs/split-plan.md §4 step 2, one control registry —
// Josh, 2026-10-02 21:20: "the code is not well factored", approved): a
// CONTROLS table holding every registered button/menu item's icon, glyph,
// label and aria-label, and setControl() as the ONLY place that writes a
// registered control's innerHTML/aria-label. Goal: an icon or wording swap
// is a one-line edit to CONTROLS, not a hunt through app.js.
//
// A control's live DOM content is (checkmark prefix) + (icon or glyph) +
// label, exactly the shape every converted call site already built by hand
// (renderViewMenu's `set()` helper, updateJobsBtn, errChip, setPlayBtn,
// deployButtonTick, …) — setControl() centralizes that concatenation so it's
// written once. Each field is a PATCH: a call that passes only `aria` (the
// ✦ AI status dot) does not touch icon/label, and vice versa — callers that
// rewrite the countdown text every second (deployButtonTick) don't have to
// repeat the icon every tick.
//
// tests/controls.test.mjs enforces the "ONLY place" rule: it fails if any
// src/ file other than this one writes .textContent/.innerHTML/aria-label on
// an element whose id is a CONTROLS key, via a shrinking allowlist (not
// every control is migrated yet — docs/split-plan.md §4 step 2's "first
// users" list, NIGHT-ROLL.md "Controls registry").
import { iconSvg } from "./icons.js";

// id -> {icon, glyph, cls, label, aria}. `icon` is an ICON table name
// (src/ui/icons.js); `glyph` is a literal character/emoji for a control that
// predates the Material pass (or never got one — a KEEP row from the icon
// audit). At most one of icon/glyph is set at a time. `label` is the exact
// text (including any leading spaces the original hand-written concatenation
// had — see each call site below) that follows the icon. `cls` is iconSvg's
// own extra class ("txt" alongside visible text, or unset). Populated at
// import time with each control's STARTING content (the same literal every
// static button already shows in index.html, or the first dynamic render's
// own values) so a control nobody has re-rendered yet still has a sane
// entry for `setControl`'s partial-patch merge to build on.
export const CONTROLS = {
  playbtn: {icon: "playArrow", cls: "txt", label: "Play", aria: null},
  volbtn: {icon: "volumeUp", cls: "", label: "", aria: null},
  jobsbtn: {icon: "hourglassEmpty", cls: "txt", label: "", aria: null},
  vwJobs: {icon: "hourglassEmpty", cls: "", label: "  Jobs", aria: null},
  errbtn: {icon: "warning", cls: "txt", label: "", aria: null},
  vwMessages: {icon: "warning", cls: "", label: "  Messages", aria: null},
  askbtn: {icon: "autoAwesome", cls: "txt", label: "AI", aria: "Talk to the AI tutor"},
  askpaste: {icon: "contentPaste", cls: "txt", label: "Paste", aria: "Paste the clipboard into the message box"}, // 📋 beside Speak; its content never changes, feedback is #askstatus
  viewbtn: {icon: "gridView", cls: "txt", label: " Roll ▴", aria: "View: Roll — tap to switch"},
  vsRoll: {icon: "gridView", cls: "", label: "  Roll", prefix: "✓ "},
  vsTracks: {icon: "tableRows", cls: "", label: "  Tracks", prefix: "   "},
  vsScore: {glyph: "𝄞", cls: "", label: "  Score", prefix: "   "},
  vwRoll: {icon: "gridView", cls: "", label: "Roll", prefix: "✓ "},
  vwScore: {glyph: "𝄞", cls: "", label: "  Score view", prefix: "   "},
  vwTracksView: {icon: "tableRows", cls: "", label: "Tracks view", prefix: "   "},
  vwMixer: {icon: "tune", cls: "", label: "Mixer", prefix: "   "},
  vwStudy: {icon: "list", cls: "", label: "Analysis sheet", prefix: "   "},
  vwTracks: {glyph: "◂", cls: "", label: "  Tracks", prefix: "   "},
  vwEdit: {icon: "construction", cls: "", label: "Edit toolbar", prefix: "   "},
  vwAdded: {glyph: "┄", cls: "", label: "  Outline new notes", prefix: "   "},
  vwBeatSub: {glyph: "&", cls: "", label: "  Beat subdivisions", prefix: "   "},
  vwRulerHl: {glyph: "▭", cls: "", label: "  Ruler highlight", prefix: "   "},
  vwVolume: {icon: "volumeUp", cls: "", label: "Volume slider", prefix: "   "},
  vwFooter: {icon: "viewAgenda", cls: "", label: "Bottom bar", prefix: "   "},
  vwInst: {icon: "piano", cls: "", label: "Instrument panel", prefix: "   "},
  vwSub: {glyph: "💬", cls: "", label: "  Notes strip", prefix: "   "},
  vwVel: {icon: "barChart", cls: "", label: "Velocity lane", prefix: "   "},
  vwCompare: {icon: "compareArrows", cls: "", label: "Compare with repo", prefix: "   "},
  vwAnalyze: {icon: "search", cls: "", label: "Analyze ▸", prefix: "   "},
  vwAnnotate: {icon: "autoAwesome", cls: "", label: "Annotate this song…", prefix: "   "}, // ✦ AI estimates, Normal only (src/ask/annotate.js)
  vwLearning: {glyph: "🎓", cls: "", label: "  Learning mode", prefix: "   "},
  vwListener: {icon: "radio", cls: "", label: "Listener mode", prefix: "   "},
  vwHearMidi: {glyph: "🎹", cls: "", label: "  Hear the MIDI (synth voices)", prefix: "   "},
  vwGrid: {icon: "gridOn", cls: "", label: "  Grid…", prefix: "   "},
  // the on-screen keyboard's bar (2026-10-04): only the lock swaps its glyph
  // (🔓 → 🔒), the rest are registered so their wording lives here too
  instplay: {label: "Play", aria: null},
  instscroll: {label: "Scroll", aria: null},
  instoctdn: {glyph: "‹", cls: "", label: "", aria: "Keyboard down an octave"},
  instoctup: {glyph: "›", cls: "", label: "", aria: "Keyboard up an octave"},
  instlock: {glyph: "🔓", cls: "", label: "", aria: "Lock the keyboard where it is"},
  instsustain: {label: "Sustain", aria: null},
  instkeep: {label: "Save last 60s", aria: "Keep what you just played: the last minute of keys lands at the cursor"},
};

function glyphHtml(glyph, cls) {
  return '<span class="ico glyph' + (cls ? " " + cls : "") + '">' + glyph + "</span>";
}

// setControl(id, {icon, glyph, cls, label, prefix, aria}) — the only writer
// of a registered control's content. Every field is OPTIONAL: an omitted
// field keeps the control's current value (from CONTROLS, last call wins);
// only innerHTML is rewritten when icon/glyph/cls/label/prefix changes, and
// only aria-label is rewritten when `aria` is passed — so an aria-only call
// (✦ AI's "is the bridge working" dot) never clobbers a countdown another
// call just wrote, and a countdown tick never touches the aria-label.
export function setControl(id, patch) {
  const c = CONTROLS[id];
  if (!c) throw new Error('setControl: unknown control "' + id + '"');
  const {icon, glyph, cls, label, prefix, aria} = patch || {};
  const touchesContent = icon !== undefined || glyph !== undefined || cls !== undefined || label !== undefined || prefix !== undefined;
  if (icon !== undefined) { c.icon = icon; if (icon) c.glyph = null; }
  if (glyph !== undefined) { c.glyph = glyph; if (glyph) c.icon = null; }
  if (cls !== undefined) c.cls = cls;
  if (label !== undefined) c.label = label;
  if (prefix !== undefined) c.prefix = prefix;
  if (aria !== undefined) c.aria = aria;
  const el = typeof document !== "undefined" && document.getElementById(id);
  if (!el) return;
  if (touchesContent) {
    const iconHtml = c.icon ? iconSvg(c.icon, c.cls) : c.glyph ? glyphHtml(c.glyph, c.cls) : "";
    el.innerHTML = (c.prefix || "") + iconHtml + (c.label || "");
  }
  if (aria !== undefined) {
    if (aria) el.setAttribute("aria-label", aria); else el.removeAttribute("aria-label");
  }
}

// #playbtn's label is rewritten a lot (loading/stop/play) — one place keeps
// the icon and text in sync instead of a plain-text ▶/■ prefix (icon audit,
// 2026-10-02). `label` is always a hardcoded string literal at every call
// site, never user text, so innerHTML here is safe.
export function setPlayBtn(state, label) {
  setControl("playbtn", {icon: state === "stop" ? "stopIcon" : "playArrow", label});
}
// the speaker icon, plus the level only when it isn't 100% (a textContent
// write would wipe the icon)
export function setVolBtn(pct) {
  setControl("volbtn", {cls: pct === 100 ? "" : "txt", label: pct === 100 ? "" : pct + "%"});
}
