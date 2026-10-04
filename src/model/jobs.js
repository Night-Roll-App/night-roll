import { S } from "../state.js";
import { appMode } from "../platform/mode.js";
import { updateJobsBtn } from "../hooks.js";

// the strip's un-truncated text — CSS only clips the DISPLAY (Josh, 2026-09-29:
                           // "those messages at the bottom … you can't always read them all"); tapping
                           // shows this in full via #infosheet when there's no copy action to run instead
// Error log (Josh's design 2026-08-17): errors must outlive the info strip
// (the next message overwrites it) and be findable without devtools —
// crucial on the iPad. ⚠ appears in the footer only when something logged.
export const appErrors = [];
// ---------------------------------------------------- jobs (footer ⏳)
// Long work that must outlive the sheet that started it (Josh, 2026-09-27:
// "you should not feel worried about minimizing or even closing that
// capture window as it goes"; design: capture-jobs-design.md, generalized
// at his ask — captures are the first kind, not the only one). A job is a
// plain record: no bytes, no DOM. It is mirrored to localStorage on every
// state change (pct throttled) so a reload can say what was running; the
// real output (drafts, commits) lands through the normal seams. Kinds
// register how to label, open and retry themselves.
export const JOB_KINDS = {};
// oldest first
export const jobListeners = new Set();
export const jobControls = {};
// id -> {aborted}
export function jobsSave(now) { // throttled: a pct tick every frame must not write 90 items each time
  if (now) { clearTimeout(jobsSave.t); jobsSave.t = 0; try { localStorage.setItem("ff1roll-jobs", JSON.stringify(S.jobs)); } catch (err) { /* private mode */ } return; }
  if (!jobsSave.t) jobsSave.t = setTimeout(() => jobsSave(true), 250);
}
export function jobsOnChange(fn) { jobListeners.add(fn); return () => jobListeners.delete(fn); }
export function jobProgress(job) { // "12/92 · Frog's Theme 40%"
  const items = job.items || [], done = items.filter(it => it.st === "done" || it.st === "silent" || it.st === "failed" || it.st === "cancelled").length;
  const cur = items.find(it => it.st === "running" || it.st === "interrupted");
  return (items.length > 1 ? done + "/" + items.length : "") + (cur ? (items.length > 1 ? " · " : "") + cur.label + (cur.pct ? " " + Math.round(cur.pct * 100) + "%" : "") : "") + (job.note ? (items.length > 1 || cur ? " — " : "") + job.note : "");
}
export function jobFraction(job) { // 0..1: finished items + the running item's own pct, over the item count — what the bar draws
  const items = job.items || [];
  if (!items.length) return job.state === "running" || job.state === "queued" ? 0 : 1;
  const done = items.filter(it => it.st === "done" || it.st === "silent" || it.st === "failed" || it.st === "cancelled").length;
  const cur = items.find(it => it.st === "running" || it.st === "interrupted");
  return Math.max(0, Math.min(1, (done + (cur ? (cur.pct || 0) : 0)) / items.length));
}
export const JOBS_AUTOCLEAR_MS = 10000;
export function jobsList() { return S.jobs.slice(); }
export function jobsFind(kind, slug, live) { // the newest matching job; live = still running/queued
  return S.jobs.filter(j => j.kind === kind && (!slug || j.slug === slug) && (!live || j.state === "running" || j.state === "queued")).pop() || null;
}
export function jobBarSet(bar, frac) { // self-healing: appends its fill div on first use, so a bar built fresh in JS or read from static markup both work
  if (!bar) return;
  let fill = bar.children && bar.children[0];
  if (!fill) { fill = document.createElement("div"); bar.appendChild(fill); }
  fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%";
}
// Two levels (Josh, 2026-09-28: "these errors are genuinely not helpful …
// maybe a debug mode"). logErr: something went wrong that he can act on —
// it raises the ⚠ chip. logDebug: diagnostics (audio wake-up probes, engine
// rebuilds) — kept, but shown and counted only with Settings → Debug log on.
// A line identical to the one before it is counted (×N), not repeated.
export const appDebug = [];
export function debugLogOn() { try { return localStorage.getItem("ff1roll-debuglog") === "1"; } catch (err) { return false; } }
export function logPush(list, msg) {
  const last = list[list.length - 1], m = String(msg);
  if (last && last.msg === m) { last.n = (last.n || 1) + 1; last.t = new Date(); }
  // mode: normal-mode-only content (a key/chord/meter estimate) must never
  // leak into a Learning-mode bridge context (CLAUDE.md hard rule) — tagged
  // at push time so askNewSinceLines can drop it, whatever the text says
  else { list.push({id: ++S.logSeq, t: new Date(), msg: m, mode: appMode()}); if (list.length > 200) list.shift(); }
}
export function logLines() { // what the ⚠ sheet and chip show: errors, plus debug lines when the switch is on, in time order
  const all = debugLogOn() ? [...appErrors, ...appDebug.map(x => ({...x, debug: true}))] : [...appErrors];
  return all.sort((a, b) => a.t - b.t);
}
export const logLine = x => x.t.toLocaleTimeString() + "  " + (x.debug ? "[debug] " : "") + x.msg + (x.n > 1 ? "  ×" + x.n : "");
// Benign browser noise (Josh, 2026-10-01 pm): Chrome/Safari fire this when a
// ResizeObserver callback's own DOM write (fitReadline's classList.toggle —
// see the observer wiring further down) triggers another layout pass within
// the same notification cycle. The deferred-write fix there (observe →
// requestAnimationFrame(fitReadline), not a direct callback) avoids the loop
// itself; this filter is belt-and-suspenders for the message browsers still
// sometimes raise on the frame it settles — it is never actionable, so it
// must never cost Josh a ⚠.
export const BENIGN_ERRORS = /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

export function jobsNotify() { for (const fn of jobListeners) { try { fn(); } catch (err) { /* a listener's problem */ } } updateJobsBtn(); }
