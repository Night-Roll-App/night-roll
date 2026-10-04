import { S } from "../state.js";

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
