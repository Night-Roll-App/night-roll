import { S } from "../state.js";

// ------------------------------------------------- Learning / Normal mode
// CLAUDE.md: "Keys/analyses are Josh's discoveries — Learning mode is the
// law." Learning (the default posture) volunteers nothing: meter, key and
// chord names stay undeclared until found by ear. Normal (other users, one
// device-global switch) shows them as ESTIMATES — labelled, never written
// without a tap — for people who aren't doing Josh's ear-training exercise.
// One device pref, migrated ONCE: an existing device (Josh's own — it
// already has Night Roll prefs) lands in Learning; a fresh install lands in
// Normal. MUST live in this early boot block: setSong/updateLCD/
// renderViewMenu all read appMode() during boot, before a `let` declared
// further down the file would be past its TDZ (see the boot-path-tdz-check
// memory — three boot bricks already shipped from this exact mistake).
export function hasExistingNightRollPrefs() {
  try {
    for (const k of ["ff1roll-lastsong", "ff1roll-cfg", "ff1roll-ghtoken"])
      if (localStorage.getItem(k) !== null) return true;
    for (const k of Object.keys(localStorage)) // Object.keys, not .length/.key(i) — the vm test harness's
      if (k.startsWith("ff1roll-notes-") || k.startsWith("ff1roll-draft-")) return true; // localStorage stub only enumerates that way
  } catch (e) { /* private mode / storage denied: nothing to detect */ }
  return false;
}
export function appMode() { return S.APP_MODE; }
// "learning" | "normal"
export function setAppMode(mode) {
  if (mode !== "learning" && mode !== "normal") return;
  S.APP_MODE = mode;
  try { localStorage.setItem("ff1roll-mode", mode); } catch (e) {}
  if (typeof document !== "undefined" && document.body) document.body.dataset.mode = mode;
}
// ---- P6: Analyze ▸ — Normal-mode-only VIEW layer (View ▾ → Analyze) ----
// Per-bar chord names + a whole-song key estimate, drawn dashed/outlined on
// the roll like the section/chord bands but never IN rollnotes — nothing is
// written until a tap Adopts a specific band (or "Adopt all chords"), same
// "estimate vs declared" discipline as P3's LCD "Gm~". Learning never
// reaches any of this — appMode() gates the one entry point below, same
// discipline as estimateKey's own call sites (spy-tested).
export function analysisAvailable() { return appMode() === "normal"; }
