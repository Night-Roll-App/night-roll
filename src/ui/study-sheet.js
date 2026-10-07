import { S } from "../state.js";
import { LINK_SONGS } from "../platform/base.js";
import { visibleNotes } from "../model/rollnotes.js";
import { studyEntryFor } from "../model/rollnotes.js";
import { putStudyEntry } from "../model/rollnotes.js";
import { isUndrawnAnno } from "../model/rollnotes.js";
import { isDirective } from "../model/rollnotes.js";
import { ROLLNOTES_LOCK_MSG } from "../model/rollnotes.js";
import { pushUndo } from "../model/edits.js";
import { annoSnapshot } from "../model/edits.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { canvas } from "../render/roll.js";
import { pxPerTick } from "../render/roll.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { drawImpl as draw } from "./chrome.js";
import { clampViewImpl as clampView } from "./chrome.js";
import { updateSubtitleImpl as updateSubtitle } from "./chrome.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { openEditor } from "./note-editor.js";
import { micToggle } from "./note-editor.js";
import { SPEECH } from "./note-editor.js";
import { openHelp } from "./notes.js";
import { ensureHelpLoaded } from "./notes.js";
import { closeDropUp } from "./chrome.js";

// ---- The Analysis sheet (docs/plans/2026-10-05-analysis-sheet.md §2, S2):
// one window per song that groups his own analysis under the sixteen
// prompts of the guide — his annotations by TYPE (section bands, key lines,
// chord bands), his ticks, his answers — and nothing the app worked out.
// Code uses the `study` stem throughout (#studysheet, studyGroups,
// openStudySheet): `analysis*` in src/ is the Normal-only ESTIMATE layer
// (S.analysisOn, analysisAvailable, gen/analysis.js, #analyzesheet), and
// this window is the opposite thing — his findings, in every mode. The
// user-visible label stays "Analysis sheet".
//
// Learning mode is the law here (CLAUDE.md): the window never says what is
// missing, never counts coverage on screen (the group chips are bare names —
// review finding 6a), never names a key or chord of its own; the only count
// it shows unasked is the number of chord bands HE wrote, the same number
// ☰ All notes' jump bar shows. "Check coverage" is the one on-demand report
// (the Check-vs-file precedent): a button, a line in the status row, cleared
// on the next open, computed from his ticks, answers and annotation TYPES
// only — studyCoverage() takes the notes list and nothing else, so it cannot
// read the music (a spy test holds it to that).
//
// Storage is S1's: one `analysis` note per prompt (n.study = {item, done},
// body in n.cnote), putStudyEntry() the one write path (it retires the old
// entry, so re-dictating never stacks and a published answer never comes
// back on reload). Every write here snapshots first and lands as ONE undo
// step (kind "anno", the editor's pattern). The prompt ids are stored in
// his files — they never change once shipped; only the wording may.
export const STUDY_GROUPS = [
  {id: "form", title: "FORM", prompts: [
    {id: "form.sections", label: "Sections", type: "section"},
    {id: "form.phrases", label: "Phrase lengths, in bars"},
    {id: "form.pairing", label: "Phrase pairing — question and answer, or a changed ending"},
  ]},
  {id: "harmony", title: "HARMONY", prompts: [
    {id: "harmony.chords", label: "Key and chords", type: "chord"},
    {id: "harmony.numerals", label: "Roman numerals — each chord's job in the key"},
    {id: "harmony.cadences", label: "Cadences — where phrases rest, and how"},
    {id: "harmony.bass", label: "The bass line as its own melody"},
    {id: "harmony.tension", label: "Where tension builds and where it releases"},
  ]},
  {id: "melody", title: "MELODY", prompts: [
    {id: "melody.degrees", label: "Scale degrees at phrase ends"},
    {id: "melody.shape", label: "Shape — steps or leaps, rising or falling, the high point"},
    {id: "melody.motifs", label: "Motifs that return changed"},
  ]},
  {id: "texture", title: "TEXTURE & RHYTHM", prompts: [
    {id: "texture.roles", label: "Who carries the tune, the harmony, the bass"},
    {id: "texture.rhythm", label: "Rhythm and groove"},
    {id: "texture.scene", label: "What it does in the scene"},
  ]},
  {id: "summary", title: "SUMMARY", prompts: [
    {id: "summary.what", label: "What the piece does and why it works"},
    {id: "summary.compare", label: "Compared with the composer's other work"},
  ]},
];
export const STUDY_PROMPTS = STUDY_GROUPS.flatMap(g => g.prompts.map(p => Object.assign({group: g.id}, p)));
export const STUDY_DRAFT_KEY = "ff1roll-study-draft-"; // + songKey + "|" + item: an answer that could not be written (song switched under it, or the song is locked) waits here, device-local, until the box next opens
// A typed prompt lists the annotations of its type: sections for
// form.sections; key lines and chord bands for harmony.chords. ✦ AI estimate
// bands are already gone from visibleNotes() in Learning, so a Learning
// sheet never lists one.
export function studyTypeMatch(type, n) {
  if (type === "section") return !!n.section;
  if (type === "chord") return !!n.chord || n.keydir !== undefined || !!n.keypartial;
  return false;
}
// pure: notes -> {groups: [{...group, prompts: [{...prompt, auto: [notes], entry: note|null}]}], barNotes: [notes]}
// `barNotes` are his plain text notes (not a directive, not a band) — the
// sheet's last fold lists them so a cadence he wrote as a bare note is one
// tap away; nothing here decides what such a note is about.
export function studyGroups(notes) {
  const list = notes || [];
  const groups = STUDY_GROUPS.map(g => Object.assign({}, g, {prompts: g.prompts.map(p => {
    const entry = list.find(n => n.study && n.study.item === p.id) || null;
    const auto = p.type ? list.filter(n => studyTypeMatch(p.type, n)).sort((a, b) => a.start - b.start) : [];
    return Object.assign({group: g.id}, p, {auto, entry});
  })}));
  const barNotes = list.filter(n => !isDirective(n) && !n.keypartial && !isUndrawnAnno(n)).sort((a, b) => a.start - b.start);
  return {groups, barNotes};
}
// pure: the on-demand report. A prompt counts as covered by his tick, his
// answer, or (a typed prompt) an annotation of its type; a chord band
// counts as noted when it carries an attached note. Nothing else is looked
// at — not the notes' text, not the song.
export function studyCoverage(notes) {
  const {groups} = studyGroups(notes);
  const empty = [];
  let chords = 0, bare = 0;
  for (const g of groups) for (const p of g.prompts) {
    const covered = !!(p.entry && (p.entry.study.done || p.entry.cnote)) || p.auto.length > 0;
    if (!covered) empty.push(p.label.split(" — ")[0]);
    if (p.id === "harmony.chords") for (const n of p.auto) if (n.chord) { chords++; if (!n.cnote) bare++; }
  }
  return {empty, chords, bare};
}
export function studyCoverageText(c) {
  let t = c.empty.length ? "Nothing ticked or answered under: " + c.empty.join(", ") + "." : "Every prompt has a tick or an answer.";
  if (c.chords) t += " " + (c.bare ? c.bare + " of " + c.chords + " chord band" + (c.chords === 1 ? "" : "s") + " " + (c.bare === 1 ? "has" : "have") + " no note."
                                   : "Every chord band has a note.");
  return t + " — counted from your ticks, answers and annotation types, never from the music.";
}
export function studyIsOpen() {
  const el = document.getElementById("studysheet");
  return !!(el && el.classList && el.classList.contains("on"));
}
export function studyStatus(text) { document.getElementById("studyStatus").textContent = text || ""; }
// the sheet's one write: undo step first, the lock reason on the status
// line (never a native dialog), a re-render through finalizeNotes
export function studyWrite(item, patch) {
  if (LINK_SONGS) { studyStatus("you're listening to a shared song from a link — its sheet is read-only here; open your own copy to write"); return false; }
  if (!S.song || !S.songKey) return false;
  const cur = studyEntryFor(item);
  const next = Object.assign({done: !!(cur && cur.study.done), text: (cur && cur.cnote) || ""}, patch);
  const before = annoSnapshot();
  try { putStudyEntry(item, next); }
  catch (err) { studyStatus(err && err.message ? err.message : ROLLNOTES_LOCK_MSG); return false; }
  pushUndo({kind: "anno", json: before});
  finalizeNotes(); // re-resolves the layer and (studyAfterNotesChange) redraws this sheet
  return true;
}
export function studyToggleTick(item) {
  const cur = studyEntryFor(item);
  return studyWrite(item, {done: !(cur && cur.study.done)});
}
export function studyDraftKey(songKey, item) { return STUDY_DRAFT_KEY + songKey + "|" + item; }
export function studyStashDraft(songKey, item, text) {
  try { if (text) localStorage.setItem(studyDraftKey(songKey, item), text); else localStorage.removeItem(studyDraftKey(songKey, item)); } catch (err) { /* private mode */ }
}
export function studyTakeDraft(songKey, item) {
  try { const t = localStorage.getItem(studyDraftKey(songKey, item)); if (t !== null) localStorage.removeItem(studyDraftKey(songKey, item)); return t; } catch (err) { return null; }
}
// Done on the answer box. The box remembers which song it opened on
// (review finding 9): an album run can swap the song under an open box, and
// a late Done must never land in the next song — the words go to a
// device-local draft for the song they belong to instead, and come back the
// next time that prompt's box opens on that song.
export function studyCommitDraft() {
  const d = S.studyDraft;
  if (!d) return false;
  const text = ((d.ta && d.ta.value) || "").trim();
  S.studyDraft = null;
  if (d.songKey !== S.songKey) {
    studyStashDraft(d.songKey, d.item, text);
    renderStudySheet(); // (a render rewrites the status line from S.studyCheck — so the message goes on after it)
    studyStatus("the song changed while this box was open — your words are kept as a draft and will be back when you reopen that prompt on " + (songTitleOf(d.songKey) || "that song"));
    return false;
  }
  const cur = studyEntryFor(d.item);
  if (text === ((cur && cur.cnote) || "")) { renderStudySheet(); return true; } // nothing changed: no undo step, no unsynced write
  const ok = studyWrite(d.item, {text});
  if (!ok) { // refused (a locked song): the words wait as this song's draft, and the lock reason studyWrite put on the status line survives the re-render
    studyStashDraft(d.songKey, d.item, text);
    const why = document.getElementById("studyStatus").textContent;
    renderStudySheet();
    studyStatus(why);
  }
  return ok;
}
export function studyDiscardDraft() { S.studyDraft = null; renderStudySheet(); }
// setSong calls this FIRST, while S.songKey and S.rollnotes are still the
// outgoing song's: an open answer box is committed to the song it was
// written on (or stashed as its draft if the write refuses), never carried
// into the next one. Also the moment the one-shot coverage line clears.
export function studyBeforeSongChange() {
  if (S.studyDraft) {
    const d = S.studyDraft;
    const text = ((d.ta && d.ta.value) || "").trim();
    S.studyDraft = null;
    if (d.songKey === S.songKey) {
      const cur = studyEntryFor(d.item);
      if (text !== ((cur && cur.cnote) || "")) {
        let ok = false;
        try { ok = studyWrite(d.item, {text}); } catch (err) { ok = false; }
        if (!ok) studyStashDraft(d.songKey, d.item, text);
      }
    } else studyStashDraft(d.songKey, d.item, text);
  }
  S.studyCheck = "";
  S.studyChordsOpen = false;
}
// finalizeNotes' tail: the layer changed (an edit, an undo, a song's notes
// landing) — an open sheet follows it. An open answer box survives the
// re-render (its textarea node is kept, not rebuilt, so dictation into it
// keeps landing).
export function studyAfterNotesChange() { if (studyIsOpen()) renderStudySheet(); }
export function studyJumpTo(n) { // tap a listed annotation: cursor to its bar, the view brought to it, its editor open (☰ All notes' row, minus closing this window)
  S.playCursor = n.start;
  updateSubtitle();
  const x = n.start * pxPerTick(), W = ((canvas && canvas.clientWidth) || 800) - (S.RULER_W || 0);
  if (S.view && (x < S.view.x || x > S.view.x + W)) { S.view.x = Math.max(0, x - W * 0.3); S.followFree = false; clampView(); }
  draw();
  openEditor(n);
}
function studyWhere(n) {
  return n.b2 ? n.b1 + "." + n.q1 + "–" + n.b2 + "." + (n.q2 || beatsPerBarDisp()) : "bar " + n.b1 + (n.q1 !== 1 ? "." + n.q1 : "");
}
function studyAnnoRow(n) { // the same row ☰ All notes draws — his text, his ✱ note, nothing added
  const row = document.createElement("div");
  row.className = "noterow";
  row.setAttribute("role", "button");
  const where = document.createElement("span");
  where.className = "where";
  where.textContent = studyWhere(n);
  const body = document.createElement("span");
  body.className = "body";
  body.textContent = n.text;
  if ((n.section || n.chord) && S.sectionColors && S.sectionColors[n.text]) {
    const dot = document.createElement("span");
    dot.textContent = "■ ";
    dot.style.color = S.sectionColors[n.text];
    body.prepend(dot);
  }
  row.append(where, body);
  if (n.cnote) {
    const c = document.createElement("span");
    c.className = "cnote";
    c.textContent = "✱ " + n.cnote.split("\n")[0];
    row.append(c);
  }
  row.addEventListener("click", () => studyJumpTo(n));
  return row;
}
function studyAnswerBox(p) { // the inline answer box: his words, typed or dictated; no forced focus (the keyboard pops only when he taps the box)
  const d = S.studyDraft;
  const box = document.createElement("div");
  box.className = "studyanswer";
  if (!d.ta) { // first render of this box: a stashed draft (studyCommitDraft) comes back ahead of the saved answer
    const ta = document.createElement("textarea");
    ta.rows = 3;
    ta.placeholder = "Your words — type here, or tap Speak.";
    ta.setAttribute("aria-label", p.label);
    const stashed = studyTakeDraft(S.songKey, p.id);
    ta.value = stashed !== null ? stashed : ((p.entry && p.entry.cnote) || "");
    d.ta = ta;
  }
  const ta = d.ta;
  const row = document.createElement("div");
  row.className = "row studyanswerrow";
  const done = document.createElement("button");
  done.className = "primary";
  done.textContent = "Done";
  done.addEventListener("click", () => studyCommitDraft());
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => studyDiscardDraft());
  row.append(done, cancel);
  if (SPEECH) {
    const mic = document.createElement("button");
    mic.textContent = "Speak";
    mic.setAttribute("aria-label", "Dictate into this answer");
    mic.addEventListener("click", () => micToggle(mic, ta, studyStatus));
    row.append(mic);
  }
  box.append(ta, row);
  return box;
}
function studyPromptRow(p) {
  const wrap = document.createElement("div");
  wrap.className = "studyprompt";
  wrap.id = "studyprompt-" + p.id.replace(".", "-");
  const head = document.createElement("div");
  head.className = "studyhead";
  const done = !!(p.entry && p.entry.study.done);
  const tick = document.createElement("button");
  tick.className = "studytick" + (done ? " on" : "");
  tick.textContent = done ? "☑" : "☐";
  tick.setAttribute("aria-label", (done ? "Ticked: " : "Not ticked: ") + p.label + " — tap to " + (done ? "untick" : "tick"));
  tick.setAttribute("aria-pressed", String(done));
  tick.addEventListener("click", () => studyToggleTick(p.id));
  const lbl = document.createElement("span");
  lbl.className = "studylbl";
  lbl.textContent = p.label;
  const acts = document.createElement("span");
  acts.className = "studyacts";
  const open = S.studyDraft && S.studyDraft.item === p.id && S.studyDraft.songKey === S.songKey;
  if (!open) {
    const ans = document.createElement("button");
    ans.className = "gadd";
    ans.textContent = p.entry && p.entry.cnote ? "Edit" : "Answer";
    ans.setAttribute("aria-label", (p.entry && p.entry.cnote ? "Edit your answer: " : "Answer: ") + p.label);
    ans.addEventListener("click", () => { if (S.studyDraft) studyCommitDraft(); renderStudySheet(p.id); });
    acts.appendChild(ans);
  }
  const addType = p.type || "note";
  const add = document.createElement("button");
  add.className = "gadd";
  add.textContent = "+ " + addType;
  add.setAttribute("aria-label", "Add a " + addType + " annotation at the cursor");
  add.addEventListener("click", () => openEditor(null, addType)); // a normal bar annotation, on the roll; the sheet lists sections and chords by type
  acts.appendChild(add);
  head.append(tick, lbl, acts);
  wrap.appendChild(head);
  if (p.auto.length) {
    const rows = document.createElement("div");
    rows.className = "grows studyauto";
    const chords = p.id === "harmony.chords" ? p.auto.filter(n => n.chord) : [];
    const inline = p.id === "harmony.chords" ? p.auto.filter(n => !n.chord) : p.auto;
    for (const n of inline) rows.appendChild(studyAnnoRow(n));
    if (chords.length) { // a count of a TYPE he wrote (☰ All notes shows the same number); the rows fold because a song may carry dozens
      const fold = document.createElement("button");
      fold.className = "studyfoldbtn";
      fold.textContent = (S.studyChordsOpen ? "▾ " : "▸ ") + chords.length + " chord band" + (chords.length === 1 ? "" : "s");
      fold.setAttribute("aria-expanded", String(!!S.studyChordsOpen));
      fold.addEventListener("click", () => { S.studyChordsOpen = !S.studyChordsOpen; renderStudySheet(); });
      rows.appendChild(fold);
      if (S.studyChordsOpen) for (const n of chords) rows.appendChild(studyAnnoRow(n));
    }
    wrap.appendChild(rows);
  }
  if (open) wrap.appendChild(studyAnswerBox(p));
  else if (p.entry && p.entry.cnote) {
    const a = document.createElement("div");
    a.className = "studytext";
    a.setAttribute("role", "button");
    a.textContent = p.entry.cnote;
    a.addEventListener("click", () => { if (S.studyDraft) studyCommitDraft(); renderStudySheet(p.id); });
    wrap.appendChild(a);
  }
  return wrap;
}
// "What to look for ▸": that one group's part of the guide, cloned out of
// help/help.html's analysis section (data-topic="form" etc.) — one source,
// one fetch, offline through the same precache; folded by default (Josh,
// Terminal #144: the long guide was hard to read — the sheet stays compact).
function studyGuideFold(g) {
  const btn = document.createElement("button");
  btn.className = "studyfoldbtn";
  const on = !!(S.studyFolds && S.studyFolds[g.id]);
  btn.textContent = "What to look for " + (on ? "▾" : "▸");
  btn.setAttribute("aria-expanded", String(on));
  btn.addEventListener("click", () => { S.studyFolds[g.id] = !S.studyFolds[g.id]; renderStudySheet(); });
  const body = document.createElement("div");
  body.className = "studyguide";
  if (on) {
    body.textContent = "Loading…";
    ensureHelpLoaded().then(ok => {
      const q = typeof document.querySelector === "function" ? document.querySelector('#helpbody .hsec[data-hsec="analysis"] [data-topic="' + g.id + '"]') : null;
      if (ok && q) body.innerHTML = q.innerHTML;
      else body.textContent = "This part of the guide is under Help → Analysis.";
    });
  }
  return {btn, body: on ? body : null};
}
// SONG NOTES at the top: his titled ideas stacked title-then-body, so they
// read as one page; a tap opens one in the note window, + Song note adds one
// (the window's Song chip). Shown even when empty — the + is how he starts.
function studySongNotesBox(list) {
  const box = document.createElement("div");
  box.className = "notegroup studygroup";
  box.id = "studygroup-songnotes";
  const head = document.createElement("div");
  head.className = "ghead";
  head.textContent = "SONG NOTES";
  const add = document.createElement("button");
  add.className = "gadd";
  add.textContent = "+ Song note";
  add.style.width = "auto";
  add.style.padding = "0 8px";
  add.setAttribute("aria-label", "Add a song note");
  add.addEventListener("click", () => openEditor(null, "song"));
  head.appendChild(add);
  box.appendChild(head);
  for (const n of list.filter(x => x.songnote)) {
    const item = document.createElement("div");
    item.className = "studysongnote";
    item.setAttribute("role", "button");
    const t = document.createElement("b");
    t.textContent = n.songnote.title;
    item.appendChild(t);
    if (n.cnote) {
      const body = document.createElement("div");
      body.className = "studytext";
      body.textContent = n.cnote;
      item.appendChild(body);
    }
    item.addEventListener("click", () => openEditor(n));
    box.appendChild(item);
  }
  return box;
}
export function renderStudySheet(openItem) {
  if (!S.song) return;
  const rows = document.getElementById("studyrows");
  const title = document.getElementById("studysheettitle");
  if (title) title.textContent = "ANALYSIS — " + (songTitleOf(S.songKey) || "this song");
  if (openItem && !(S.studyDraft && S.studyDraft.item === openItem && S.studyDraft.songKey === S.songKey)) S.studyDraft = {item: openItem, songKey: S.songKey, ta: null}; // renderStudySheet(id) opens that prompt's box; studyAnswerBox builds its textarea once
  else if (S.studyDraft && S.studyDraft.songKey !== S.songKey) { // a box from another song never shows here — and its words are never dropped: they wait as that song's draft (studyBeforeSongChange normally wrote them first; this is the net under it)
    const d = S.studyDraft;
    S.studyDraft = null;
    studyStashDraft(d.songKey, d.item, ((d.ta && d.ta.value) || "").trim());
  }
  // the group strip: names only — a fraction there would be a coverage
  // figure on screen unasked (review finding 6a)
  const jump = document.getElementById("studyjump");
  jump.innerHTML = "";
  for (const g of STUDY_GROUPS) {
    const b = document.createElement("button");
    b.textContent = g.title;
    b.setAttribute("aria-label", "Go to " + g.title.toLowerCase());
    b.addEventListener("click", () => { const box = document.getElementById("studygroup-" + g.id); if (box && typeof box.scrollIntoView === "function") box.scrollIntoView({block: "start", behavior: "smooth"}); });
    jump.appendChild(b);
  }
  studyStatus(S.studyCheck || "");
  rows.innerHTML = "";
  rows.appendChild(studySongNotesBox(visibleNotes()));
  const {groups, barNotes} = studyGroups(visibleNotes());
  for (const g of groups) {
    const box = document.createElement("div");
    box.className = "notegroup studygroup";
    box.id = "studygroup-" + g.id;
    box.dataset.type = g.title;
    const head = document.createElement("div");
    head.className = "ghead";
    head.textContent = g.title;
    const fold = studyGuideFold(g);
    head.appendChild(fold.btn);
    box.appendChild(head);
    if (fold.body) box.appendChild(fold.body);
    for (const p of g.prompts) box.appendChild(studyPromptRow(p));
    rows.appendChild(box);
  }
  if (barNotes.length) { // his plain bar notes, one tap from their bar — the sheet says nothing about what they cover
    const box = document.createElement("div");
    box.className = "notegroup studygroup";
    box.id = "studygroup-barnotes";
    const head = document.createElement("div");
    head.className = "ghead";
    const fold = document.createElement("button");
    fold.className = "studyfoldbtn";
    fold.textContent = (S.studyBarNotesOpen ? "▾ " : "▸ ") + "BAR NOTES · " + barNotes.length;
    fold.setAttribute("aria-expanded", String(!!S.studyBarNotesOpen));
    fold.addEventListener("click", () => { S.studyBarNotesOpen = !S.studyBarNotesOpen; renderStudySheet(); });
    head.appendChild(fold);
    box.appendChild(head);
    if (S.studyBarNotesOpen) {
      const grows = document.createElement("div");
      grows.className = "grows";
      for (const n of barNotes) grows.appendChild(studyAnnoRow(n));
      box.appendChild(grows);
    }
    rows.appendChild(box);
  }
}
export function openStudySheet() {
  if (!S.song) return;
  S.studyCheck = ""; // the coverage line is one-shot: never there on the next open
  renderStudySheet();
  document.getElementById("studysheet").classList.add("on");
}
export function closeStudySheet() {
  if (S.studyDraft) studyCommitDraft(); // ✕ with a box open: the words are not lost
  S.studyCheck = "";
  document.getElementById("studysheet").classList.remove("on");
}
export function toggleStudySheet() { if (studyIsOpen()) closeStudySheet(); else openStudySheet(); }
export function studyRunCheck() { // the on-demand report (Josh, Terminal #136: "tell me what I'm missing") — from his notes list only
  if (!S.song) return "";
  S.studyCheck = studyCoverageText(studyCoverage(visibleNotes()));
  studyStatus(S.studyCheck);
  return S.studyCheck;
}
export function initStudySheet1() {
  document.getElementById("notesstudy").addEventListener("click", () => { closeDropUp(); openStudySheet(); });
  document.getElementById("studyguide").addEventListener("click", () => { openHelp("analysis"); });
  document.getElementById("studycheck").addEventListener("click", () => { studyRunCheck(); });
}
