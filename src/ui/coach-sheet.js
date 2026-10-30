import { S } from "../state.js";
import { barTicks } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { coachCurrent } from "../model/coach-comments.js";
import { COACH_ENABLED } from "../model/coach-comments.js";
import { coachImport } from "../model/coach-comments.js";
import { coachRepoPath } from "../model/coach-comments.js";
import { coachWhen } from "../model/coach-comments.js";
import { coachPosText } from "../model/coach-comments.js";
import { readData } from "../platform/folder.js";
import { jumpToTick } from "../input/gestures.js";
import { drawImpl as draw } from "./chrome.js";
import { closeDropUp } from "./chrome.js";

// ☰ Notes ▴ → Coach comments (Q30-36, src/model/coach-comments.js). Her
// comments arrive by message; here he pastes them (one tap: Paste & import
// reads the clipboard) and sees them as a read-only layer — a list, plus
// marks on the ruler he can switch off. Nothing here edits his annotations,
// and nothing here adds a word of analysis: her text is shown as written,
// under her name and the time.
export function coachStatus(text) { document.getElementById("coachStatus").textContent = text || ""; }
export function coachImportText(text) { // the one import door: the sheet's buttons and the Ask action both end here
  if (!S.songKey) throw new Error("open a song first");
  const r = coachImport(S.songKey, text, {now: Date.now()});
  const msg = r.found ? (r.added ? "Added " + r.added + " comment" + (r.added === 1 ? "" : "s") + (r.found > r.added ? " (" + (r.found - r.added) + " already here)" : "") + " — " + r.total + " in all. They publish with the song's next Publish." : "Nothing new — all " + r.found + " were already here.")
                        : "No comments found. Lines look like \"bar 12: the bass walks\" — or paste the JSON the share page makes.";
  return {...r, message: msg + (r.skipped.length ? " (" + r.skipped.length + " line" + (r.skipped.length === 1 ? "" : "s") + " skipped)" : "")};
}
export function coachBarTick(c) { return c.at ? Math.round((c.at[0] - 1) * barTicks() + (c.at[1] - 1) * beatTicks()) : 0; }
export function renderCoachSheet() {
  const box = document.getElementById("coachrows");
  box.textContent = "";
  const list = coachCurrent();
  const tog = document.getElementById("coachtoggle");
  tog.textContent = S.coachShow ? "Marks on the ruler: on" : "Marks on the ruler: off";
  tog.setAttribute("aria-pressed", String(S.coachShow));
  if (!list.length) {
    const e = document.createElement("div");
    e.className = "meta";
    e.textContent = "No coach comments on this song yet.";
    box.appendChild(e);
    return;
  }
  for (const c of list) {
    const r = document.createElement("button");
    r.className = "fitem noterow";
    r.style.cssText = "display:block;text-align:left;width:100%;white-space:normal";
    const h = document.createElement("div");
    h.className = "meta";
    h.textContent = (c.at ? "Bar " + coachPosText(c) : "Whole song") + " · " + (c.by || "coach") + (c.ts ? " · " + coachWhen(c.ts) : "");
    const t = document.createElement("div");
    t.textContent = c.text; // as written
    t.style.whiteSpace = "pre-wrap";
    r.appendChild(h);
    r.appendChild(t);
    if (c.at) r.addEventListener("click", () => jumpToTick(coachBarTick(c)));
    box.appendChild(r);
  }
}
export async function openCoachSheet() {
  if (!S.song) return;
  coachStatus("");
  renderCoachSheet();
  document.getElementById("coachsheet").classList.add("on");
  const key = S.songKey;
  if (!coachCurrent().length && !S.coachFetched[key]) { // his other device may have published them
    S.coachFetched[key] = true;
    try {
      const res = await readData("analysis", coachRepoPath(key), true);
      if (res && res.ok) { const r = coachImport(key, await res.text(), {now: Date.now()}); if (r.added && key === S.songKey) { renderCoachSheet(); draw(); } }
    } catch (err) { /* no published copy: fine */ }
  }
}
export function initCoachSheet1() {
  if (!COACH_ENABLED) { document.getElementById("notescoach").style.display = "none"; } // switched off (#1068); the sheet and its wiring stay for the flag
  document.getElementById("notescoach").addEventListener("click", () => { closeDropUp(); openCoachSheet(); });
  const run = text => {
    try { coachStatus(coachImportText(text).message); } catch (err) { coachStatus(err.message); }
    renderCoachSheet();
    draw();
  };
  document.getElementById("coachimport").addEventListener("click", () => {
    const ta = document.getElementById("coachpaste");
    run(ta.value);
    if (ta.value.trim()) ta.value = "";
  });
  document.getElementById("coachclip").addEventListener("click", async () => {
    let t = "";
    try { t = await navigator.clipboard.readText(); } catch (err) { coachStatus("The clipboard can't be read here — paste into the box and tap Import."); return; }
    run(t);
  });
  document.getElementById("coachtoggle").addEventListener("click", () => {
    S.coachShow = !S.coachShow;
    try { localStorage.setItem("ff1roll-coachshow", S.coachShow ? "1" : "0"); } catch (err) { /* private mode */ }
    renderCoachSheet();
    draw();
  });
}
