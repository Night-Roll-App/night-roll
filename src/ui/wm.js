import { S } from "../state.js";
import { resize } from "./chrome.js";
import { askScrollEnd } from "../ask/sheet.js";
import { songRegionRight } from "./chrome.js";
import { micStop } from "./chrome.js";
import { teardownMixerMeters } from "./mixer.js";
import { renderMixer } from "./mixer.js";
import { ensureMixerMeters } from "./mixer.js";
import { ensureMixerMeterLoop } from "./mixer.js";

// ---- Window manager: shell + docks, phase A (open-items.md, "a real
// windowing system"). Steps 1-2 (REBUILT 2026-09-29 after attempt 1,
// c322e3c, broke on the iPad — see the #shell comment in the body markup and
// NIGHT-ROLL.md "Window manager (shell + docks)") built the shell and a
// right-only dock; this phase generalizes it to left/right/bottom, an INNER
// mode for the side docks (beside the roll only, vs FULL height edge to
// edge), a split bottom (two windows side by side), and makeWindow() —
// registering a window as dockable and giving it the shared Dock control,
// in place of the one-off #askdock button. #shell's grid + #songcenter's
// flex row (CSS above) ARE the layout mechanism: docking sets a CSS var the
// CSS already reads and moves the window's own node into the right cell —
// #songregion (or its center row) needs no code of its own, it just shrinks
// into what the track/cell leaves it, same as any other grid/flex resize.
// resize() — the exact function window's own "resize" listener calls — runs
// directly from wmLayoutAll() wherever a track's size changes, so
// canvas/ruler/lanes (all read wrap.clientWidth live) redraw at the new
// size; the live ResizeObserver on #rollwrap (above, "subtitle strip
// toggling resizes the roll") also fires on its own in a real browser
// whenever a track actually changes.
//
// wm = {left?: {id, w, mode}, right?: {id, w, mode}, bottom?: {ids, h,
// split}} — mode is "full" (edge to edge, beside the header/footer too) or
// "inner" (beside the roll only); bottom.ids holds one or two window ids
// side by side. Flat localStorage (ff1roll-wm), migrated once from the old
// asksheet-only ff1roll-aidock ({docked, width}), and again (wmMigrateShape)
// from the step-1/2 shape ({right: {id, w}}, no mode — always meant FULL).
// Pure helpers (wmClampSize, wmClampHeight, wmClampSplit, wmAllowed,
// wmMigrate, wmMigrateShape, wmSetSide, wmClearSide, wmSetSideMode,
// wmDockBottom, wmClearBottom, wmSetBottomHeight, wmSetBottomSplit,
// wmWhereIs) take no DOM — the vm suite calls them directly — everything
// else here only uses getElementById + classList/style, which the harness
// stubs too, so the action functions (wmDockSide, wmDockBottomWindow,
// wmSetSideModeFor, wmFloat) are exercised the same way the old right-dock
// tests exercised wmToggleRight/wmLayoutRight. Menu/button DOM (createElement,
// popup positioning) is real-browser-only, like sheetDrag below — not unit
// tested, same as the ✕/grip/drag loops it sits beside.
export const WM_KEY = "ff1roll-wm";
export const WM_OLD_KEY = "ff1roll-aidock";
// pre-shell pref: {docked, width}, asksheet only
export const WM_MIN_W = 280;
// narrowest a side dock's divider allows
export const WM_DEFAULT_W = 380;
// a side dock's width the first time it's ever opened
export const WM_MIN_H = 160;
// shortest the bottom dock's divider allows
export const WM_DEFAULT_H = 240;
// the bottom dock's height the first time it's ever opened
export const WM_MIN_SPLIT = 0.2;
// narrowest either half of a split bottom dock can be
export const WM_PHONE_MAX = 700;
// below this window width there is no "what's left" to give the song — no dock, any side
export const WM_ZONE_FRAC = 0.15;
// Phase B (drag-to-dock): >= 15% of the song region's width/height at each edge counts as a drop zone
export const WM_EDGE_GAP = 32;
// Josh, 2026-09-29 (iPad): "drag the divider nearly all the way across to hide the roll for a minute, then drag back" — the dock's ceiling leaves only this many px of the song's edge showing, instead of a flat 60/70% (which stopped short of covering the song); never so small the divider itself could be dragged off-screen

export function wmClampSize(w, innerWidth) { // pure: bounds a side dock's width to [280, innerWidth - 32]
  const iw = (typeof innerWidth === "number" && innerWidth > 0) ? innerWidth : 1024;
  return Math.max(WM_MIN_W, Math.min(Math.max(WM_MIN_W, iw - WM_EDGE_GAP), Math.round(w)));
}
export function wmClampHeight(h, innerHeight) { // pure: bounds the bottom dock's height to [160, innerHeight - 32]
  const ih = (typeof innerHeight === "number" && innerHeight > 0) ? innerHeight : 768;
  return Math.max(WM_MIN_H, Math.min(Math.max(WM_MIN_H, ih - WM_EDGE_GAP), Math.round(h)));
}
export function wmClampSplit(f) { return Math.max(WM_MIN_SPLIT, Math.min(1 - WM_MIN_SPLIT, f)); }
// pure: the fraction the bottom dock's first slot keeps
export function wmAllowed(innerWidth) { return typeof innerWidth === "number" && innerWidth >= WM_PHONE_MAX; }
// pure: phone width never offers a dock, any side
export function wmMigrate(oldPref) { // pure: the pre-shell {docked, width} shape -> {right: {id, w}} | {}
  if (!oldPref || typeof oldPref !== "object" || !oldPref.docked) return {};
  const w = (typeof oldPref.width === "number" && oldPref.width > 0) ? oldPref.width : WM_DEFAULT_W;
  return {right: {id: "asksheet", w}};
}
export function wmMigrateShape(state) { // pure: the step-1/2 shape (a side dock with no `mode`, always FULL; a bottom dock — there wasn't one — with no `split`) -> phase-A shape
  if (!state || typeof state !== "object") return {};
  let next = state;
  for (const side of ["left", "right"]) {
    if (next[side] && !next[side].mode) { if (next === state) next = Object.assign({}, state); next[side] = Object.assign({}, next[side], {mode: "full"}); }
  }
  if (next.bottom && next.bottom.split == null) { if (next === state) next = Object.assign({}, state); next.bottom = Object.assign({}, next.bottom, {split: 0.5}); }
  return next;
}
export function wmMigrateShapeB(state) { // pure: phase-A side shape ({id, w, mode}, one window) -> phase-B tab shape ({ids, active, w, mode}, one or more) — the bottom dock already used `ids`/no tabs, so it needs no migration
  if (!state || typeof state !== "object") return {};
  let next = state;
  for (const side of ["left", "right"]) {
    const s = next[side];
    if (s && !s.ids) { if (next === state) next = Object.assign({}, state); next[side] = {ids: [s.id], active: s.id, w: s.w, mode: s.mode}; }
  }
  return next;
}
// Phase B (2026-09-29): a side dock's slot holds a TAB GROUP, not one window
// — {ids: [id, ...], active, w, mode}. `active` is which tab is shown right
// now (its node is the only one in the group with the `on` class — see
// wmLayoutSide); `ids` is every window ever dropped there, in tab order,
// unchanged by opening/closing (closing only drops a tab's CHIP from the
// rendered strip — see wmLayoutTabs — the same "close never undocks"
// invariant every other dock already had). Dropping a window on an EMPTY
// side starts a fresh one-tab group; dropping on an OCCUPIED one adds a tab
// (wmAddSideTab); wmRemoveSideTab is the only way OUT of a group (a real
// Float, or dragging it to another dock). The bottom dock is unchanged —
// two slots, replace-not-tab, per Josh ("the bottom's two halves stay a
// split").
export function wmSetSide(state, side, ids, active, w, mode, innerWidth) { // pure: replaces a side's whole tab group
  return Object.assign({}, state, {[side]: {ids: ids.slice(), active, w: wmClampSize(w, innerWidth), mode: mode === "inner" ? "inner" : "full"}});
}
export function wmClearSide(state, side) { const next = Object.assign({}, state); delete next[side]; return next; }
// pure
export function wmSetSideMode(state, side, mode) { // pure: flips full/inner in place — doesn't move the window(s) or touch their width
  if (!state[side]) return state;
  return Object.assign({}, state, {[side]: Object.assign({}, state[side], {mode: mode === "inner" ? "inner" : "full"})});
}
export function wmAddSideTab(state, side, id, innerWidth) { // pure: adds `id` as a new, active tab to an existing side group (its width/mode unchanged), or starts a fresh one-tab group (default width, beside the roll)
  const cur = state[side];
  if (cur && cur.ids && cur.ids.length) {
    const ids = cur.ids.includes(id) ? cur.ids : [...cur.ids, id];
    return wmSetSide(state, side, ids, id, cur.w, cur.mode, innerWidth);
  }
  return wmSetSide(state, side, [id], id, WM_DEFAULT_W, "inner", innerWidth);
}
export function wmRemoveSideTab(state, side, id) { // pure: drops one id from a side's tab group — the ONLY way out of a group (closing never does this); the side key is dropped entirely once its last tab leaves, else a fallback active is picked if `id` was on top
  const cur = state[side];
  if (!cur || !cur.ids || !cur.ids.includes(id)) return state;
  const ids = cur.ids.filter(x => x !== id);
  if (!ids.length) { const next = Object.assign({}, state); delete next[side]; return next; }
  const active = cur.active === id ? ids[0] : cur.active;
  return Object.assign({}, state, {[side]: Object.assign({}, cur, {ids, active})});
}
export function wmSetActiveSideTab(state, side, id) { // pure: brings one tab to the front of its group (tapping a tab, or re-dropping a member already in the group); a no-op if it isn't a member
  const cur = state[side];
  if (!cur || !cur.ids || !cur.ids.includes(id) || cur.active === id) return state;
  return Object.assign({}, state, {[side]: Object.assign({}, cur, {active: id})});
}
export function wmSetSideWidth(state, side, w, innerWidth) { // pure: a divider drag — width only, ids/active/mode untouched
  if (!state[side]) return state;
  return Object.assign({}, state, {[side]: Object.assign({}, state[side], {w: wmClampSize(w, innerWidth)})});
}
export function wmZoneFor(x, y, rect) { // pure (drag-to-dock): which dock zone a pointer sits over while dragging a window's title, given the song region's rect — null in the middle (float). A corner resolves to whichever edge the pointer is proportionally closest to.
  if (!rect || !rect.width || !rect.height) return null;
  const leftFrac = (x - rect.left) / rect.width;
  const rightFrac = (rect.left + rect.width - x) / rect.width;
  const bottomFrac = (rect.top + rect.height - y) / rect.height;
  const cands = [];
  if (leftFrac <= WM_ZONE_FRAC) cands.push({side: "left", frac: leftFrac});
  if (rightFrac <= WM_ZONE_FRAC) cands.push({side: "right", frac: rightFrac});
  if (bottomFrac <= WM_ZONE_FRAC) cands.push({side: "bottom", frac: bottomFrac});
  if (!cands.length) return null;
  cands.sort((a, b) => a.frac - b.frac);
  const win = cands[0];
  if (win.side === "bottom") return {side: "bottom"};
  // split preview within a side zone: the half nearer the SCREEN EDGE = Full
  // height, the half nearer the roll = Beside the roll — chosen over an
  // arbitrary label because it reads the same way the drag itself feels:
  // drag further out (more of the zone behind you) for "more" (the whole
  // height), stop just past the boundary for "less" (beside the roll only).
  return {side: win.side, mode: win.frac <= WM_ZONE_FRAC / 2 ? "full" : "inner"};
}
export function wmDockBottom(state, id, split, innerHeight) { // pure: adds `id` to the bottom dock — the first open slot, or replaces the second
  const cur = (state.bottom && state.bottom.ids) || [];
  const ids = cur.includes(id) ? cur : cur.length < 2 ? [...cur, id] : [cur[0], id]; // a third window bumps whatever was in the second slot
  return Object.assign({}, state, {bottom: {
    ids, h: wmClampHeight((state.bottom && state.bottom.h) || WM_DEFAULT_H, innerHeight),
    split: wmClampSplit(split != null ? split : (state.bottom && state.bottom.split != null ? state.bottom.split : 0.5)),
  }});
}
export function wmClearBottom(state, id) { // pure: drops one id; an empty result removes the bottom key entirely
  const ids = ((state.bottom && state.bottom.ids) || []).filter(x => x !== id);
  const next = Object.assign({}, state);
  if (!ids.length) { delete next.bottom; return next; }
  next.bottom = Object.assign({}, state.bottom, {ids});
  return next;
}
export function wmSetBottomHeight(state, h, innerHeight) { // pure
  if (!state.bottom) return state;
  return Object.assign({}, state, {bottom: Object.assign({}, state.bottom, {h: wmClampHeight(h, innerHeight)})});
}
export function wmSetBottomSplit(state, split) { // pure
  if (!state.bottom) return state;
  return Object.assign({}, state, {bottom: Object.assign({}, state.bottom, {split: wmClampSplit(split)})});
}
export function wmWhereIs(state, id) { // pure: which dock (if any) currently claims `id` (any tab in a side's group counts, active or not), and a side dock's mode
  if (state.left && state.left.ids && state.left.ids.includes(id)) return {dock: "left", mode: state.left.mode || "full"};
  if (state.right && state.right.ids && state.right.ids.includes(id)) return {dock: "right", mode: state.right.mode || "full"};
  if (state.bottom && state.bottom.ids && state.bottom.ids.includes(id)) return {dock: "bottom"};
  return null;
}
export function wmLoad() {
  try {
    const raw = localStorage.getItem(WM_KEY);
    if (raw != null) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === "object") return wmMigrateShapeB(wmMigrateShape(parsed)); }
  } catch (err) { /* private mode */ }
  try { // migrate the old pref once, whatever it said, then forget it — never re-read after this
    const oldRaw = localStorage.getItem(WM_OLD_KEY);
    if (oldRaw != null) {
      localStorage.removeItem(WM_OLD_KEY);
      const migrated = wmMigrateShapeB(wmMigrateShape(wmMigrate(JSON.parse(oldRaw))));
      if (migrated.right) wmSave(migrated);
      return migrated;
    }
  } catch (err) { /* private mode */ }
  return {};
}
export function wmSave(state) { try { localStorage.setItem(WM_KEY, JSON.stringify(state)); } catch (err) { /* private mode */ } }
// the old floating window's remembered position — dead now too
export function wmInnerWidth() { return (typeof window !== "undefined" && window.innerWidth) || 1024; }
export function wmInnerHeight() { return (typeof window !== "undefined" && window.innerHeight) || 768; }
// Which windows makeWindow() has registered, and whether each is dockable —
// id -> {dockable}. The ✕/grip/drag loops further down this file (unchanged)
// are the shared, generic mechanism every window — migrated or not — already
// gets; this registry only adds the Dock control on top, for the six windows
// migrated so far.
export const WM_WINDOWS = {};
// same idea, for the bottom dock's slots, in slot order
export function wmSideCells(side) {
  return side === "left" ? {full: document.getElementById("dockleft"), inner: document.getElementById("dockleftinner")}
                          : {full: document.getElementById("dockright"), inner: document.getElementById("dockrightinner")};
}
export function wmWindowTitle(id) { // a tab chip's label — a window's own <h2> text, minus the Dock button makeWindow() appended to it
  const h2 = document.getElementById(id + "-h2");
  if (!h2 || !h2.childNodes) return id;
  let t = "";
  for (const n of h2.childNodes) { if (n.tagName === "BUTTON") continue; t += (n.textContent != null ? n.textContent : (n.text || "")); }
  t = t.trim();
  return t || id;
}
// Applies wm.bottom to the DOM: moves up to two windows' nodes into
// #dockbottom0/#dockbottom1, sets --db-h/--db-split, and toggles which
// slot(s) actually show (a closed window's slot collapses, same "active"
// rule as a side dock).
export function wmLayoutBottom() {
  const shell = document.getElementById("shell");
  const dockbottom = document.getElementById("dockbottom");
  const slots = [document.getElementById("dockbottom0"), document.getElementById("dockbottom1")];
  const state = S.wm.bottom;
  const wantIds = (state && wmAllowed(wmInnerWidth()) && state.ids) || [];
  const wantEls = wantIds.map(id => document.getElementById(id)).filter(Boolean);
  for (const el of S.wmBottomEls) { // float anything parked here that's no longer wanted
    if (wantEls.includes(el)) continue;
    if (wmWhereIs(S.wm, el.id)) continue; // moved to a side dock: that dock placed it
    const home = document.getElementById(el.id + "-home");
    if (home && el.parentNode !== home) home.appendChild(el);
    if (el.classList.contains("docked")) el.classList.remove("docked");
  }
  S.wmBottomEls = [];
  // touch the DOM only on a real change: classList.add/remove rewrite the
  // class attribute even when nothing changes, SHEET_TOP's MutationObserver
  // answers every class write with wmLayoutAll(), and the page hung forever
  // on the first bottom dock (caught by the headless check, 2026-09-29)
  wantEls.forEach((el, i) => {
    if (!slots[i]) return;
    if (el.parentNode !== slots[i]) slots[i].appendChild(el);
    if (!el.classList.contains("docked")) el.classList.add("docked");
    S.wmBottomEls.push(el);
  });
  const activeFlags = slots.map((slot, i) => !!(wantEls[i] && wantEls[i].classList.contains("on")));
  slots.forEach((slot, i) => slot.classList.toggle("shown", activeFlags[i]));
  const bothActive = activeFlags[0] && activeFlags[1];
  dockbottom.classList.toggle("occupied", wantEls.length > 0); // something is parked here, open or not (divider visibility)
  dockbottom.classList.toggle("split", bothActive);
  shell.style.setProperty("--db-h", activeFlags.some(Boolean) ? wmClampHeight((state && state.h) || WM_DEFAULT_H, wmInnerHeight()) + "px" : "0px");
  shell.style.setProperty("--db-split", String(wmClampSplit(state && state.split != null ? state.split : 0.5)));
}
export function wmDockLabel(id) { // pure-ish (reads module state `wm`): what a window's Dock button should say
  const where = wmWhereIs(S.wm, id);
  if (!where) return "Dock";
  if (where.dock === "bottom") return "Docked: Bottom";
  return "Docked: " + (where.dock === "left" ? "Left" : "Right") + (where.mode === "inner" ? " (beside roll)" : "");
}
export function wmDockShort(id) { const w = wmWhereIs(S.wm, id); return !w ? "Dock" : w.dock === "bottom" ? "Bottom ▸" : (w.dock === "left" ? "Left ▸" : "Right ▸"); }
export function wmSyncDockButtons() { // updates every dockable window's Dock button — text, and hidden at phone width (same as the old askdock button)
  const allowed = wmAllowed(wmInnerWidth());
  for (const id in WM_WINDOWS) {
    if (!WM_WINDOWS[id].dockable) continue;
    const h2 = document.getElementById(id + "-h2");
    const btn = h2 && h2._wmDockBtn;
    if (!btn) continue;
    btn.style.display = allowed ? "" : "none";
    btn.textContent = wmDockLabel(id);
    btn.dataset.short = wmDockShort(id); // a narrow dock shows this instead (CSS container query)
    const docked = !!wmWhereIs(S.wm, id);
    const label = docked ? "Change how this window is docked, or float it" : "Dock this window — left, right, or bottom";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }
}
// ---- drag-to-dock (Phase B): the drop-zone highlight shown while dragging
// a dockable window's title (sheetDrag, below). Real-DOM only, like the rest
// of this section's positioning code — the pure decision is wmZoneFor.
export function wmZoneForPointer(x, y) {
  const region = document.getElementById("songregion");
  if (!region || typeof region.getBoundingClientRect !== "function") return null;
  return wmZoneFor(x, y, region.getBoundingClientRect());
}
export function wmShowDropZone(zone) {
  const el = document.getElementById("wmdropzone");
  if (!el) return;
  if (!zone) { el.classList.remove("on"); return; }
  const region = document.getElementById("songregion"), center = document.getElementById("songcenter");
  if (!region || typeof region.getBoundingClientRect !== "function") return;
  const r = region.getBoundingClientRect();
  const vr = (zone.mode === "inner" && center && center.getBoundingClientRect) ? center.getBoundingClientRect() : r;
  let box;
  if (zone.side === "bottom") box = {left: r.left, top: r.top + r.height * (1 - WM_ZONE_FRAC), width: r.width, height: r.height * WM_ZONE_FRAC};
  else if (zone.side === "left") box = {left: r.left, top: vr.top, width: r.width * WM_ZONE_FRAC, height: vr.height};
  else box = {left: r.left + r.width * (1 - WM_ZONE_FRAC), top: vr.top, width: r.width * WM_ZONE_FRAC, height: vr.height};
  el.style.left = Math.round(box.left) + "px"; el.style.top = Math.round(box.top) + "px";
  el.style.width = Math.round(box.width) + "px"; el.style.height = Math.round(box.height) + "px";
  el.classList.add("on");
}
export function wmHideDropZone() { const el = document.getElementById("wmdropzone"); if (el) el.classList.remove("on"); }
// The shared Dock popup (#wmmenu, one instance, rebuilt fresh on each open —
// same pattern as #voicemenu/#filesub): Left / Right / Bottom, Full height /
// Beside the roll once docked to a side, and Float once docked anywhere.
// Real-browser only (createElement-built rows) — not unit tested, like the
// menu/dropdown code it sits beside; tests drive wmDockSide/wmDockBottomWindow/
// wmSetSideModeFor/wmFloat directly instead, the same way the old tests drove
// wmToggleRight instead of clicking #askdock.
export function wmMenuItem(label, active, fn) {
  const b = document.createElement("button");
  b.className = "fitem" + (active ? " active" : "");
  b.textContent = label;
  b.addEventListener("click", () => { fn(); wmCloseMenu(); });
  return b;
}
export function wmCloseMenu() { document.getElementById("wmmenu").classList.remove("on"); }

// inner cell — whichever wm[side].mode says) — not just the active one; only
// the active member gets the `on` class (display is entirely CSS-driven off
// that, .overlay.docked.on{display:flex} vs the base .overlay.docked{display:
// none}), so switching tabs is nothing more than toggling `on` on two
// elements already sitting in the cell (see the "exactly one tab visible"
// fixup below) — no reparenting needed on every tab switch. Sets
// --d{l,r}-w / --d{l,r}i-w, and returns whether this side is a FULL dock
// actively reserving width (wmLayoutAll uses that to narrow the footer). The
// width reservation only applies while the ACTIVE tab is actually shown
// (docked AND open) — closing it zeroes the reservation but the group itself
// is untouched, so a closed window stays parked and reopening needs no
// re-dock (same invariant every dock already had). Safe to call any time
// (open, close, dock, float, mode switch, tab switch, drag, or a live window
// resize) — idempotent.
export function wmLayoutSide(side) {
  const shell = document.getElementById("shell");
  const cells = wmSideCells(side);
  let state = S.wm[side];
  const ids = (state && wmAllowed(wmInnerWidth()) && state.ids) || [];
  const wantMode = (state && state.mode) || "full";
  const targetCell = wantMode === "inner" ? cells.inner : cells.full;
  for (const el of S.wmSideMembers[side]) { // float anything parked here that's no longer part of the group
    if (ids.includes(el.id)) continue;
    // …unless another dock holds it now: moving the AI from Right to Left
    // docked it left (left lays out first), then this Right pass sent it home,
    // leaving an empty reserved strip and a floating panel (Josh's iPad,
    // 2026-09-29: "docking left does not work at all")
    if (wmWhereIs(S.wm, el.id)) continue;
    const home = document.getElementById(el.id + "-home");
    if (home && el.parentNode !== home) home.appendChild(el);
    if (el.classList.contains("docked")) el.classList.remove("docked");
    el._wmCell = null;
  }
  const wantEls = ids.map(id => document.getElementById(id)).filter(Boolean);
  wantEls.forEach(el => { // touch the DOM only on a real change (SHEET_TOP answers every class/parent write with wmLayoutAll())
    if (el._wmCell !== targetCell) { targetCell.appendChild(el); el._wmCell = targetCell; }
    if (!el.classList.contains("docked")) el.classList.add("docked");
  });
  S.wmSideMembers[side] = wantEls;
  // exactly one tab may be visible in the shared cell — if more than one
  // opened independently (each window's own header button, not the dock/tab
  // UI), the NEW one (whichever isn't the recorded active) wins and becomes
  // active — reopening a background tab that way should bring IT forward,
  // the same as tapping its chip would, not silently re-close it
  const onEls = wantEls.filter(el => el.classList.contains("on"));
  if (onEls.length > 1) {
    const keep = onEls.find(el => el.id !== (state && state.active)) || onEls[0];
    for (const el of onEls) if (el !== keep) el.classList.remove("on");
    if (state && state.active !== keep.id) { S.wm = wmSetActiveSideTab(S.wm, side, keep.id); wmSave(S.wm); state = S.wm[side]; }
  }
  // the active tab itself is closed but a sibling is open: promote it —
  // otherwise closing the front tab would stop the strip from reaching any
  // of its siblings at all
  if (state && ids.length) {
    const activeEl = document.getElementById(state.active);
    if (!(activeEl && activeEl.classList.contains("on"))) {
      const openId = ids.find(id => { const e = document.getElementById(id); return e && e.classList.contains("on"); });
      if (openId && openId !== state.active) { S.wm = wmSetActiveSideTab(S.wm, side, openId); wmSave(S.wm); state = S.wm[side]; }
    }
  }
  wmLayoutTabs(side, targetCell, ids, state && state.active);
  cells.full.classList.toggle("occupied", !!(state && wantMode === "full" && ids.length));
  cells.inner.classList.toggle("occupied", !!(state && wantMode === "inner" && ids.length));
  const activeEl = ids.includes(state && state.active) && document.getElementById(state.active); // `ids` (not the raw pref) already accounts for phone width — a saved dock must not reserve space there
  const active = !!(activeEl && activeEl.classList.contains("on"));
  const wpx = active ? wmClampSize(state.w, wmInnerWidth()) + "px" : "0px";
  shell.style.setProperty(side === "left" ? "--dl-w" : "--dr-w", (active && wantMode === "full") ? wpx : "0px");
  shell.style.setProperty(side === "left" ? "--dli-w" : "--dri-w", (active && wantMode === "inner") ? wpx : "0px");
  return active && wantMode === "full";
}
// The tab strip: a chip per OPEN member of a multi-window side group (a
// closed member's chip disappears — "closing a tab's window removes the
// tab" — it stays parked, docked, just not reachable from the strip until
// reopened, same close-never-undocks invariant as everywhere else). "A group
// of one shows no strip" (ids.length <= 1); a group where at most one member
// is open shows none either — nothing to switch to. Real-browser only (like
// the Dock menu below) — tests exercise the pure ids/active transitions
// directly instead.
export function wmLayoutTabs(side, targetCell, ids, activeId) {
  const strip = document.getElementById("dock" + side + "-tabs");
  if (!strip) return;
  if (ids.length <= 1) { strip.classList.remove("on"); return; }
  if (strip._wmCell !== targetCell) { targetCell.appendChild(strip); strip._wmCell = targetCell; }
  // a chip per MEMBER, open or not: switching tabs closes the other window
  // (one shows at a time), so filtering by "open" hid the tab you had just
  // switched away from and you could never switch back (caught headless,
  // 2026-09-29). Leaving a group is ✕ on its window (wmCloseWindow).
  const kids = ids.map(id => {
    const b = document.createElement("button");
    b.className = "wmtab" + (id === activeId ? " active" : "");
    b.textContent = wmWindowTitle(id);
    b.setAttribute("aria-label", "Switch to " + wmWindowTitle(id));
    b.addEventListener("click", () => { const e = document.getElementById(id); if (e && !e.classList.contains("on")) e.classList.add("on"); wmDockSide(id, side); });
    return b;
  });
  if (typeof strip.replaceChildren === "function") strip.replaceChildren(...kids);
  else { strip.innerHTML = ""; kids.forEach(k => strip.appendChild(k)); }
  strip.classList.toggle("on", kids.length > 1);
}
// ✕ on a window: a member of a side TAB GROUP leaves the group (like closing an
// IntelliJ/VS Code tab) so the strip never shows a tab that opens nothing;
// a lone docked window just closes and keeps its dock for next time.
export function wmCloseWindow(ov) {
  const where = ov && ov.id && wmWhereIs(S.wm, ov.id);
  if (where && where.dock !== "bottom" && S.wm[where.dock] && S.wm[where.dock].ids && S.wm[where.dock].ids.length > 1) {
    S.wm = wmRemoveSideTab(S.wm, where.dock, ov.id);
    wmSave(S.wm);
    const g = S.wm[where.dock], nx = g && g.active && document.getElementById(g.active);
    if (nx && !nx.classList.contains("on")) nx.classList.add("on"); // the next tab shows, as when a tab closes
  }
  ov.classList.remove("on");
  if (where) wmLayoutAll();
}
// The one entry point everything else calls: lays out both side docks and
// the bottom dock, narrows the footer beside a FULL side dock either way,
// refreshes every Dock button's label, and runs resize() — the same path a
// real window resize takes — exactly once.
export function wmLayoutAll() {
  const shell = document.getElementById("shell");
  const leftFull = wmLayoutSide("left");
  const rightFull = wmLayoutSide("right");
  wmLayoutBottom();
  if (shell.classList) shell.classList.toggle("hasdock", !!(leftFull || rightFull));
  wmSyncDockButtons();
  if (typeof resize === "function") resize(); // same path a real window resize takes
  if (typeof askScrollEnd === "function" && wmWhereIs(S.wm, "asksheet")) askScrollEnd(); // re-parenting must not strand the chat mid-scroll
}
// ---- action functions: the Dock menu, the tab strip, drag-to-dock, and the
// tests all call these directly. Each keeps the "a window is docked in at
// most one place" invariant, saves, and relays through wmLayoutAll().
export function wmDockSide(id, side, mode) { // dock `id` to "left"/"right" (mode: "full" default for a brand new group, or "inner"). If that side already holds a group, `id` JOINS it as a new, active tab (Phase B) instead of replacing it — the same call also handles "tap an existing tab" (id already a member: just brings it to the front).
  if (!wmAllowed(wmInnerWidth())) return; // no dock on a phone-width window
  let next = S.wm;
  const otherSide = side === "left" ? "right" : "left";
  next = wmRemoveSideTab(next, otherSide, id);
  if (next.bottom && next.bottom.ids && next.bottom.ids.includes(id)) next = wmClearBottom(next, id);
  const cur = next[side];
  next = (cur && cur.ids && cur.ids.includes(id)) ? wmSetActiveSideTab(next, side, id) : wmAddSideTab(next, side, id, wmInnerWidth());
  if (mode) next = wmSetSideMode(next, side, mode);
  S.wm = next;
  wmSave(S.wm);
  const grp = S.wm[side]; // exactly one tab shows at a time in the shared cell — close whichever sibling this one just replaced as active
  if (grp && grp.active === id) for (const other of grp.ids) if (other !== id) { const oe = document.getElementById(other); if (oe && oe.classList.contains("on")) oe.classList.remove("on"); }
  wmLayoutAll();
}
export function wmSetSideModeFor(id, mode) { // flip full/inner for whichever side `id` is currently docked to; a no-op if it isn't
  const where = wmWhereIs(S.wm, id);
  if (!where || (where.dock !== "left" && where.dock !== "right")) return;
  S.wm = wmSetSideMode(S.wm, where.dock, mode);
  wmSave(S.wm);
  wmLayoutAll();
}
export function wmDockBottomWindow(id) { // dock `id` to the bottom — the first open slot, or splits it into the second
  if (!wmAllowed(wmInnerWidth())) return;
  let next = S.wm;
  next = wmRemoveSideTab(next, "left", id);
  next = wmRemoveSideTab(next, "right", id);
  next = wmDockBottom(next, id, undefined, wmInnerHeight());
  S.wm = next;
  wmSave(S.wm);
  wmLayoutAll();
}
export function wmFloat(id) { // undock `id` from wherever it is (the only way OUT of a tab group); a no-op if it's already floating
  if (S.wm.left && S.wm.left.ids && S.wm.left.ids.includes(id)) S.wm = wmRemoveSideTab(S.wm, "left", id);
  else if (S.wm.right && S.wm.right.ids && S.wm.right.ids.includes(id)) S.wm = wmRemoveSideTab(S.wm, "right", id);
  else if (S.wm.bottom && S.wm.bottom.ids && S.wm.bottom.ids.includes(id)) S.wm = wmClearBottom(S.wm, id);
  else return;
  wmSave(S.wm);
  wmLayoutAll();
}
// ---- makeWindow(): registers a window as dockable and gives it the shared
// Dock control (a button in its h2, id + "-h2" — every migrated window's h2
// carries that id; see the body markup). ✕, title-drag and the ◢ grip are
// NOT built here — every window already gets those from the generic loops
// further down this file (the ✕ loop, sheetDrag's `.sheet > h2` selector,
// addGrips), unchanged; a window not yet migrated (not in this list) keeps
// getting exactly that and nothing else. See NIGHT-ROLL.md "Window manager
// (shell + docks)" for the not-yet-migrated list.
export function makeWindow(id, opts) {
  WM_WINDOWS[id] = {dockable: !!(opts && opts.dockable)};
  if (!opts || !opts.dockable) return;
  const h2 = document.getElementById(id + "-h2");
  if (!h2 || h2._wmDockBtn) return; // idempotent
  const btn = document.createElement("button");
  btn.className = "wmdock";
  btn.setAttribute("aria-label", "Dock this window — left, right, or bottom");
  btn.addEventListener("click", () => wmOpenMenu(id, btn));
  h2.appendChild(btn);
  h2._wmDockBtn = btn;
}
export function wmOpenMenu(id, anchor) {
  const menu = document.getElementById("wmmenu");
  const where = wmWhereIs(S.wm, id);
  const items = [
    wmMenuItem("Left", !!(where && where.dock === "left"), () => wmDockSide(id, "left")),
    wmMenuItem("Right", !!(where && where.dock === "right"), () => wmDockSide(id, "right")),
    wmMenuItem("Bottom", !!(where && where.dock === "bottom"), () => wmDockBottomWindow(id)),
  ];
  if (where && (where.dock === "left" || where.dock === "right")) {
    const sep = document.createElement("div"); sep.className = "fsep"; items.push(sep);
    items.push(wmMenuItem("Full height", where.mode !== "inner", () => wmSetSideModeFor(id, "full")));
    items.push(wmMenuItem("Beside the roll", where.mode === "inner", () => wmSetSideModeFor(id, "inner")));
  }
  if (where) {
    const sep2 = document.createElement("div"); sep2.className = "fsep"; items.push(sep2);
    items.push(wmMenuItem("Float", false, () => wmFloat(id)));
  }
  if (typeof menu.replaceChildren === "function") menu.replaceChildren(...items);
  else { menu.innerHTML = ""; items.forEach(i => menu.appendChild(i)); }
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.max(6, Math.min(r.left, songRegionRight() - 200)) + "px";
  menu.style.top = (r.bottom + 6) + "px";
  menu.classList.add("on");
}
// ---- dividers: one pair per side (full cell + inner cell — same width
// value, wm[side].w, whichever cell is currently showing it), plus the
// bottom dock's height (top edge) and, only with two windows, its split
// (between them).
export function wmSideDividerize(divId, side) {
  const divider = document.getElementById(divId);
  let drag = null, lastTap = -Infinity; // double-tap resets to the default width (350ms, the app's own double-tap window)
  divider.addEventListener("pointerdown", e => {
    if (e.button && e.button !== 0) return;
    if (!S.wm[side]) return;
    const now = performance.now();
    if (now - lastTap < 350) {
      lastTap = -Infinity; // a third quick tap starts a fresh drag/pair, not another reset
      S.wm = wmSetSideWidth(S.wm, side, WM_DEFAULT_W, wmInnerWidth());
      wmSave(S.wm);
      wmLayoutAll();
      e.preventDefault();
      return;
    }
    lastTap = now;
    drag = {x0: e.clientX, w0: S.wm[side].w, id: e.pointerId};
    divider.classList.add("dragging");
    try { divider.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    e.preventDefault();
  });
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id || !S.wm[side]) return;
    const delta = e.clientX - drag.x0;
    // right's dividers sit on the dock's LEFT edge (drag left widens); left's sit on its RIGHT edge (drag right widens)
    const w = side === "right" ? drag.w0 - delta : drag.w0 + delta;
    S.wm = wmSetSideWidth(S.wm, side, w, wmInnerWidth());
    wmLayoutAll();
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    divider.classList.remove("dragging");
    drag = null;
    wmSave(S.wm);
  };
  document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
}

// Every sheet closes three ways (Josh, 2026-08-25: "I have a lot of problems
// with our modals" — opening the notes list by mistake meant scrolling to the
// bottom to find Close). Tap the backdrop, press Esc, or hit a ✕ that stays
// pinned at the top while the body scrolls. confirmsheet is exempt: it asks a
// question and has to get an answer.
export const MODAL_KEEP = new Set(["confirmsheet"]);

// Drag any sheet by its title line (and the capture panel by its title row).
// The offset lives in a transform so the overlay's centering still applies;
// it resets each time the sheet opens. Pointer capture keeps the drag alive
// when the finger leaves the title.
export function initWm1() {
  (function sheetDrag() {
    if (typeof document === "undefined" || !document.body) return;
    const handleFor = t => {
      if (t.closest && t.closest("button")) return null; // never start a drag from a button tap (a window's Dock control lives inside its h2)
      const h2 = t.closest && t.closest(".sheet > h2");
      if (h2) return {handle: h2, box: h2.parentElement};
      const row = t.closest && t.closest("#importsheet .row:first-child");
      if (row) return {handle: row, box: document.getElementById("importsheet")};
      return null;
    };
    let drag = null, size = null;
    // the ◢ grip on every sheet and on the capture panel (Josh, 2026-09-27: "resize them too by clicking in the corner")
    const addGrips = () => { for (const box of [...document.querySelectorAll(".sheet"), document.getElementById("importsheet") && document.getElementById("importsheet").querySelector(".metpanel")]) { if (!box || box.querySelector(":scope > .sheetgrip")) continue; const g = document.createElement("div"); g.className = "sheetgrip"; g.textContent = "◢"; g.setAttribute("aria-label", "Resize"); box.appendChild(g); } };
    addGrips();
    document.addEventListener("pointerdown", e => {
      if (e.button && e.button !== 0) return;
      const grip = e.target.closest && e.target.closest(".sheetgrip");
      if (grip) {
        // a docked sheet is fixed by the dock, not by drag-and-resize — its
        // divider resizes it instead
        if (e.target.closest && e.target.closest(".overlay.docked")) return;
        const box = grip.parentElement.classList.contains("metpanel") ? document.getElementById("importsheet") : grip.parentElement;
        const r = box.getBoundingClientRect();
        // a centered sheet grows out from its middle, so the top-left drifts up
        // and off the screen (Josh, 2026-09-27); hold the corner still by
        // translating half the growth. The capture panel is absolutely placed
        // and grows down-right on its own.
        const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(box.style.transform || "");
        size = {box, x0: e.clientX, y0: e.clientY, w0: r.width, h0: r.height, id: e.pointerId,
                tx: m ? +m[1] : 0, ty: m ? +m[2] : 0, centered: box.id !== "importsheet"};
        try { grip.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        e.preventDefault(); return;
      }
      const hit = handleFor(e.target);
      if (!hit || !hit.box) return;
      // Phase B (drag-to-dock): a DOCKED window's title now also arms a drag —
      // it's undocked once the drag crosses the threshold below (a plain tap
      // must not rip it out of its dock).
      const overlay = hit.box.closest && hit.box.closest(".overlay");
      const wasDocked = !!(overlay && overlay.classList.contains("docked"));
      const wmId = overlay && overlay.id;
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(hit.box.style.transform || "");
      drag = {box: hit.box, x0: e.clientX, y0: e.clientY, dx: m ? +m[1] : 0, dy: m ? +m[2] : 0, id: e.pointerId,
              wasDocked, wmId, moved: false, zone: null};
      if (!wasDocked) hit.box.classList.add("dragging");
      try { hit.handle.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault();
    }, {capture: true});
    document.addEventListener("pointermove", e => {
      if (size && e.pointerId === size.id) {
        const w = Math.max(280, Math.round(size.w0 + e.clientX - size.x0)), h = Math.max(160, Math.round(size.h0 + e.clientY - size.y0));
        size.box.style.width = w + "px"; size.box.style.maxWidth = "none"; size.box.style.height = h + "px"; size.box.style.maxHeight = "none";
        if (size.centered) size.box.style.transform = "translate(" + Math.round(size.tx + (w - size.w0) / 2) + "px, " + Math.round(size.ty + (h - size.h0) / 2) + "px)";
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.wasDocked && !drag.moved) {
        // a tap on a docked title must not undock it — only a real drag does
        // (the app's own 8px gesture threshold, reused here for drag-to-dock)
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
        drag.moved = true;
        drag.box.classList.add("dragging");
        wmFloat(drag.wmId); // undock — its node moves back to its floating home
        drag.box.style.transform = ""; // measure the floating (centered) position it just landed at…
        const r = drag.box.getBoundingClientRect();
        drag.dx = e.clientX - (r.left + r.width / 2); drag.dy = e.clientY - (r.top + r.height / 2); // …so the drag continues under the SAME finger position instead of jumping to center
        drag.x0 = e.clientX; drag.y0 = e.clientY;
      } else if (!drag.moved) {
        drag.moved = true; // a floating window: unchanged behavior — moves from the very first pixel
      }
      drag.box.style.transform = "translate(" + Math.round(drag.dx + e.clientX - drag.x0) + "px, " + Math.round(drag.dy + e.clientY - drag.y0) + "px)";
      if (drag.wmId && WM_WINDOWS[drag.wmId] && WM_WINDOWS[drag.wmId].dockable) {
        drag.zone = wmZoneForPointer(e.clientX, e.clientY);
        wmShowDropZone(drag.zone);
      }
    });
    // where you left a sheet is where it reopens, on this device (Josh,
    // 2026-09-27): translate + size per overlay id, a UI pref in localStorage
    const sheetKey = box => { const ov = box.id === "importsheet" ? box : box.closest(".overlay"); return ov && ov.id ? "ff1roll-sheetpos-" + ov.id : null; };
    const remember = box => {
      const k = sheetKey(box); if (!k) return;
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(box.style.transform || "");
      const rec = {tx: m ? +m[1] : 0, ty: m ? +m[2] : 0, w: box.style.width || "", h: box.style.height || ""};
      try { localStorage.setItem(k, JSON.stringify(rec)); } catch (err) { /* private mode */ }
    };
    const restore = box => { // the saved spot, nudged back on screen if the window shrank; nothing saved = centered, as before
      box.style.transform = ""; box.style.width = ""; box.style.height = ""; box.style.maxWidth = ""; box.style.maxHeight = "";
      const k = sheetKey(box); let rec = null;
      try { rec = k && JSON.parse(localStorage.getItem(k) || "null"); } catch (err) { rec = null; }
      if (!rec) return;
      if (rec.w) { box.style.width = rec.w; box.style.maxWidth = "none"; }
      if (rec.h) { box.style.height = rec.h; box.style.maxHeight = "none"; }
      box.style.transform = "translate(" + rec.tx + "px, " + rec.ty + "px)";
      // measured right away (the overlay is already display:flex here); an
      // animation frame would never come in a hidden tab
      const r = box.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
      if (!r.width) return;
      let dx = 0, dy = 0;
      if (r.right > W - 8) dx = W - 8 - r.right; if (r.left + dx < 8) dx += 8 - (r.left + dx);
      if (r.bottom > H - 8) dy = H - 8 - r.bottom; if (r.top + dy < 8) dy += 8 - (r.top + dy);
      if (dx || dy) box.style.transform = "translate(" + Math.round(rec.tx + dx) + "px, " + Math.round(rec.ty + dy) + "px)";
    };
    const end = e => {
      if (size && (!e || e.pointerId === size.id)) { remember(size.box); size = null; }
      if (drag && (!e || e.pointerId === drag.id)) {
        drag.box.classList.remove("dragging");
        wmHideDropZone();
        // released over a drop zone (drag-to-dock): dock there instead of
        // remembering a floating position
        if (drag.moved && drag.zone && drag.wmId && WM_WINDOWS[drag.wmId] && WM_WINDOWS[drag.wmId].dockable) {
          if (drag.zone.side === "bottom") wmDockBottomWindow(drag.wmId);
          else wmDockSide(drag.wmId, drag.zone.side, drag.zone.mode);
        } else {
          remember(drag.box);
        }
        drag = null;
      }
    };
    document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
    // a sheet opens where you left it (or centered, the first time) when its
    // overlay turns on — a docked sheet skips this, the dock lays it out instead
    if (typeof MutationObserver === "function") new MutationObserver(muts => {
      for (const mu of muts) { const el = mu.target; if (el.classList && el.classList.contains("on") && !el.classList.contains("docked")) { const box = el.classList.contains("overlay") ? el.querySelector(".sheet") : el.id === "importsheet" ? el : null; if (box) restore(box); } }
    }).observe(document.body, {attributes: true, attributeFilter: ["class"], subtree: true});
  })();
                               S.wm = wmLoad();
  // ⋯ More is gone entirely now (a drop-up, 2026-10-01, then removed outright
  // in the chrome density follow-up the same day) — a device that had
  // "moresheet" docked or tabbed from before either change would otherwise
  // strand a dead id in wm forever (wmLayoutAll has nothing to lay out for
  // it; makeWindow() is never called for it either). Purge it once, here,
  // before any layout runs — pure (wmRemoveSideTab/wmClearBottom take no
  // DOM), so it's safe at module-eval time in the vm harness too.
  for (const side of ["left", "right"]) if (S.wm[side] && S.wm[side].ids && S.wm[side].ids.includes("moresheet")) S.wm = wmRemoveSideTab(S.wm, side, "moresheet");
  if (S.wm.bottom && S.wm.bottom.ids && S.wm.bottom.ids.includes("moresheet")) S.wm = wmClearBottom(S.wm, "moresheet");
  wmSave(S.wm);
  try { localStorage.removeItem("ff1roll-sheetpos-moresheet"); } catch (err) { /* private mode */ }  // Applies wm[side] to the DOM: parks EVERY member of the tab group (full or
  if (typeof document !== "undefined" && document.body) { // real browser only — dismissing the menu is not unit tested (see comment above)
    document.addEventListener("pointerdown", e => {
      const menu = document.getElementById("wmmenu");
      if (menu.classList.contains("on") && !(e.target.closest && (e.target.closest("#wmmenu") || e.target.closest(".wmdock")))) wmCloseMenu();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") wmCloseMenu(); });
  }
  // ---- migrate the windows onto the shared window shape (phase A, extended
  // footer v2 tweaks 2026-09-30) — asksheet already had a right-only dock;
  // the rest are new. infosheet
  // (Status, the full-message reader) is registered but NOT dockable (Josh,
  // 2026-09-29) — a one-shot reveal for a truncated status line isn't a panel
  // worth pinning open while working the roll, same reasoning as the import
  // hub below. Settings (#settingssheet, not yet migrated onto makeWindow at
  // all) stays non-dockable too.
  makeWindow("asksheet", {dockable: true});
  makeWindow("notelistsheet", {dockable: true});
  makeWindow("instsheet", {dockable: true});
  makeWindow("jobssheet", {dockable: true});
  makeWindow("pubjobsheet", {dockable: true});
  makeWindow("mixersheet", {dockable: true}); // Logic-style: dockable to the bottom
  // ⋯ More was briefly the seventh window (footer v2 tweaks, 2026-09-30),
  // then a drop-up (2026-10-01), then removed entirely (chrome density
  // follow-up, 2026-10-01 pm) — its tools are in View ▾ and the footer now;
  // nothing here was ever registered for it.
  makeWindow("infosheet", {dockable: false});
  // the import hub (docs/import-hub-design.md): a one-shot picker, not a panel
  // worth pinning open while working the roll — registered so it's a known
  // window (WM_WINDOWS), but not dockable, so it gets no Dock button.
  makeWindow("importhub", {dockable: false});
  makeWindow("versionssheet", {dockable: false});
  wmSideDividerize("wmdivider-left-full", "left");
  wmSideDividerize("wmdivider-left-inner", "left");
  wmSideDividerize("wmdivider-right-full", "right");
  wmSideDividerize("wmdivider-right-inner", "right");
  (function wmBottomHeightDividerize() { // along the bottom dock's top edge — drag up (negative clientY delta) grows it
    const divider = document.getElementById("wmdivider-bottomh");
    let drag = null, lastTap = -Infinity; // double-tap resets to the default height
    divider.addEventListener("pointerdown", e => {
      if (e.button && e.button !== 0) return;
      if (!S.wm.bottom) return;
      const now = performance.now();
      if (now - lastTap < 350) {
        lastTap = -Infinity;
        S.wm = wmSetBottomHeight(S.wm, WM_DEFAULT_H, wmInnerHeight());
        wmSave(S.wm);
        wmLayoutAll();
        e.preventDefault();
        return;
      }
      lastTap = now;
      drag = {y0: e.clientY, h0: S.wm.bottom.h, id: e.pointerId};
      divider.classList.add("dragging");
      try { divider.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault();
    });
    document.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id || !S.wm.bottom) return;
      S.wm = wmSetBottomHeight(S.wm, drag.h0 - (e.clientY - drag.y0), wmInnerHeight());
      wmLayoutAll();
    });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      divider.classList.remove("dragging");
      drag = null;
      wmSave(S.wm);
    };
    document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
  })();
  (function wmBottomSplitDividerize() { // between the bottom dock's two slots, only shown with both occupied
    const divider = document.getElementById("wmdivider-bottomsplit");
    let drag = null;
    divider.addEventListener("pointerdown", e => {
      if (e.button && e.button !== 0) return;
      if (!S.wm.bottom) return;
      const r = document.getElementById("dockbottom").getBoundingClientRect();
      drag = {x0: e.clientX, split0: S.wm.bottom.split != null ? S.wm.bottom.split : 0.5, width: r.width || wmInnerWidth(), id: e.pointerId};
      divider.classList.add("dragging");
      try { divider.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      e.preventDefault();
    });
    document.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id || !S.wm.bottom) return;
      S.wm = wmSetBottomSplit(S.wm, drag.split0 + (e.clientX - drag.x0) / Math.max(1, drag.width));
      wmLayoutAll();
    });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      divider.classList.remove("dragging");
      drag = null;
      wmSave(S.wm);
    };
    document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
  })();
  // growing/shrinking the window re-checks wmAllowed() live: crossing below
  // phone width mid-session floats every docked window (the pref itself is
  // untouched — growing back re-offers and reapplies it)
  window.addEventListener("resize", wmLayoutAll);
}

export function initWm2() {
  if (typeof document.querySelectorAll === "function") { // vm harness stubs document
  // A sheet keeps the scroll position it had when it was last closed, so
  // reopening the notes list dropped Josh halfway down it (2026-08-25). Reset on
  // open wherever the open happens — watching the class beats hunting ~30 call
  // sites and cannot miss a future one. Scoped to the overlays themselves, NOT
  // document.body: an app that repaints at 60fps must not run an observer over
  // every class write in the tree. Overlay classes change only when a sheet
  // opens or closes.
  const SHEET_TOP = new MutationObserver(ms => {
    for (const m of ms) {
      // VoiceOver (2026-09-30): a docked window sits beside the roll like a
      // panel, not over it — aria-modal="true" would tell a screen reader
      // everything else on the page is inert, which is false while docked.
      // Recomputed on every class write (open/close AND dock-side changes all
      // touch the class), so it never goes stale.
      m.target.setAttribute("aria-modal", m.target.classList.contains("on") && !m.target.classList.contains("docked") ? "true" : "false");
      // any migrated, docked window: reserve/free its dock's space alongside
      // its own visibility, however it closes (✕, backdrop, Esc, or
      // reopening) — the one choke point every close path already runs through
      if (WM_WINDOWS[m.target.id]) wmLayoutAll();
      if (!m.target.classList.contains("on")) { // closing: a live 🎤 inside must not keep transcribing
        if (S.micBtn && m.target.contains(S.micBtn)) micStop(true);
        if (m.target.id === "mixersheet") teardownMixerMeters(); // ✕/backdrop/Esc all end here too — no cost while closed
        // VoiceOver: give focus back to whatever opened this sheet (a button
        // in most cases) — otherwise focus is left on a now-hidden node and a
        // screen reader user loses their place. Deferred repeat closes (the
        // Escape handler below, or a second class write before this one even
        // ran) leave nothing to restore — harmless no-op.
        if (m.target._srReturnFocus) {
          const back = m.target._srReturnFocus;
          m.target._srReturnFocus = null;
          if (typeof back.focus === "function") try { back.focus(); } catch (err) {}
        }
        continue;
      }
      // only a sheet that has just OPENED starts at its top: docking, undocking
      // and switching sides rewrite the class too, and reset the AI chat to its
      // first message every time (Josh, 2026-09-29, the docked AI panel)
      if (/(^|\s)on(\s|$)/.test(m.oldValue || "")) continue;
      if (m.target.id === "mixersheet") { // opened some other way than openMixer() (e.g. a docked tab click): render + start meters
        renderMixer();
        ensureMixerMeters();
        ensureMixerMeterLoop();
      }
      const sh = m.target.querySelector(".sheet");
      if (sh) sh.scrollTop = 0;
      // VoiceOver: remember who had focus, then move focus INTO the sheet —
      // deferred one frame so a sheet's own open-time focus (e.g. rename's
      // text input, already existing code) wins if it set one; only step in
      // when nothing in the sheet already has focus.
      m.target._srReturnFocus = (typeof document !== "undefined" && document.activeElement && document.activeElement !== document.body) ? document.activeElement : null;
      const target = m.target;
      requestAnimationFrame(() => {
        if (!target.classList.contains("on")) return; // closed again before the frame landed
        if (document.activeElement && document.activeElement !== document.body && target.contains(document.activeElement)) return; // the sheet already focused itself
        // the SHEET itself, never a field inside it: focusing a text box pops
        // the iPad keyboard every time a sheet opens (Josh already fought an
        // unwanted keyboard in ✦ AI); VoiceOver still announces the dialog
        const sh2 = target.querySelector(".sheet");
        const land = sh2 || target;
        if (land && !land.hasAttribute("tabindex")) land.setAttribute("tabindex", "-1");
        if (land && typeof land.focus === "function") try { land.focus({preventScroll: true}); } catch (err) {}
      });
    }
  });
  for (const ov of document.querySelectorAll(".overlay")) {
    SHEET_TOP.observe(ov, {attributes: true, attributeFilter: ["class"], attributeOldValue: true}); // incl. confirm
    // VoiceOver: every overlay is a dialog (confirmsheet included — it's the
    // one MODAL_KEEP exempts from backdrop/Esc dismissal, not from being a
    // dialog), labelled by its own heading so a screen reader announces WHICH
    // sheet just opened instead of a bare "dialog". aria-modal is kept live by
    // the observer above (docked vs. floating can change after open).
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    const sh0 = ov.querySelector(".sheet");
    if (sh0) {
      if (!(sh0.tabIndex >= 0)) sh0.tabIndex = -1; // a focus target with nothing else inside, never in the Tab order itself
      const h = sh0.querySelector("h2, h3");
      if (h) {
        if (!h.id) h.id = ov.id + "-srlabel";
        ov.setAttribute("aria-labelledby", h.id);
      }
    }
    if (MODAL_KEEP.has(ov.id)) continue;
    // pointerdown, and only when the backdrop ITSELF is the target — a drag that
    // starts inside the sheet and releases outside must not count as a dismiss
    ov.addEventListener("pointerdown", e => { if (e.target === ov) ov.classList.remove("on"); });
    const sh = ov.querySelector(".sheet");
    if (!sh || sh.querySelector(".sheetx")) continue;
    const x = document.createElement("button");
    x.className = "sheetx";
    x.textContent = "✕";
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", () => wmCloseWindow(ov));
    sh.prepend(x);
  }
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const open = [...document.querySelectorAll(".overlay.on")].filter(o => !MODAL_KEEP.has(o.id));
    if (!open.length) return;
    open[open.length - 1].classList.remove("on"); // topmost only, so Esc unstacks
    e.preventDefault();
  });
  }
}
