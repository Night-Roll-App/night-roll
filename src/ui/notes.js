import { checkKeyVsFile } from "../model/song.js";
import { appMode } from "../platform/mode.js";
import { estimateKey } from "../model/song.js";
import { checkMeterVsFile } from "../theory/key.js";
import { openEditor } from "./note-editor.js";
import { TONIC_SPELL } from "../theory/key.js";
import { tonicPcOfName } from "../theory/key.js";
import { S, prof } from "../state.js";
import { barTicks } from "../model/rollnotes.js";
import { keyNameFor } from "../theory/key.js";
import { trackShown } from "../render/roll.js";
import { trackIsDrums } from "../model/grid.js";
import { parseChordSym } from "../theory/chords.js";
import { LETTER_PC } from "../theory/chords.js";
import { CHORD_TEMPLATES } from "../theory/chords.js";
import { nameChord } from "../theory/chords.js";
import { sfDeclaredAt } from "../model/song.js";
import { pitchName } from "../theory/chords.js";
import { spellPc } from "../theory/chords.js";
import { beatTicks } from "../model/grid.js";
import { applyChop } from "../model/rollnotes.js";
import { resolveNote } from "../model/rollnotes.js";
import { bakesTempo } from "../model/provenance.js";
import { updateTrackGains } from "../audio/engine.js";
import { computeSongEnd } from "../model/song.js";
import { SF_MAJOR } from "../theory/chords.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { keyLabelState } from "./chrome.js";
import { secDepthCap } from "../model/grid.js";
import { TRACK_COLORS } from "../render/roll.js";
import { BASE_RULER_H } from "../render/roll.js";
import { LANE_H } from "../render/roll.js";
import { songHasAudio } from "../model/song.js";
import { AUDIO_STRIP_H } from "../render/roll.js";
import { STRIP_H } from "../render/roll.js";
import { isComposition } from "../model/provenance.js";
import { dropLocalKeyAt } from "../model/rollnotes.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { saveLocalNotes } from "../model/edits.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { updateSubtitleImpl as updateSubtitle } from "./chrome.js";
import { drawImpl as draw } from "./chrome.js";
import { setInfoImpl as setInfo } from "./chrome.js";
import { clampViewImpl as clampView } from "./chrome.js";
import { openDropUp } from "./chrome.js";
import { closeDropUp } from "./chrome.js";
import { toggleSubtitle } from "./chrome.js";
import { renderViewMenu } from "./chrome.js";
import { closeFileMenus } from "./chrome.js";
import { draftKeys } from "../model/versions.js";
import { clearMultiSel } from "../model/selection.js";

// key dial: preview any signature live; Set writes "key: X" at the cursor bar.
// A signature is mode-ambiguous (Bb major and G minor share two flats), so a
// major/minor toggle picks which TONIC gets recorded — "key: Gm", never the
// relative major standing in for it.
// Key picker (reworked 2026-08-07, Josh's design from the sweep handoff):
// FIRST dropdown = tonic pitch only, SECOND = mode. The old signature list
// ("D / B minor") let a missed mode write a silent wrong key. Tonic without
// mode is a normal mid-derivation state (floating castle), so it's STORABLE
// ("key: G#/Ab?") but never APPLIED — no signature, no respelling, nothing
// downstream until the mode lands. Stored vs applied is always visible.
export const keysel = document.getElementById("keysel");
export const keysetBtn = document.getElementById("keyset");
export const keymodeSel = document.getElementById("keymode");
// ---- ☰ Notes' "Check vs file" button (C7) — the KEY and METER group
// headers, on EVERY song. Learning: fileCheckLine's text NEVER contains the
// file's value or runs estimateKey (spy-tested); Normal states the file's
// value plainly (+ the note-census estimate, for key) and offers a one-tap
// "Use the file's" action.
export function fileCheckLine(r, kind) { // same wording for key and meter (spec: "meter: same lines")
  const noun = kind === "key" ? "key" : "meter";
  if (r.state === "nofile") return "This song's file carries no " + noun + " label of its own — nothing to compare (game captures and songs made here never do).";
  if (r.state === "noanswer") return "Set your " + noun + " first — this compares your answer with the file's own label.";
  if (r.state === "match") return r.tonicOnly
    ? "Your tonic matches the file's label; add the mode to check the whole key."
    : "Your " + noun + " matches the file's own label.";
  if (r.state === "partial-match") return "Matches the file's label for part of the song — labels can be wrong.";
  return "The file's label says something else — labels can be wrong (many programs write C major / 4/4 by default). Listen again, or keep yours.";
}
export function runKeyCheck() {
  const r = checkKeyVsFile();
  let text = fileCheckLine(r, "key");
  if (appMode() === "normal" && r.file) {
    text += " The file says: " + r.file.name + ".";
    const est = estimateKey();
    if (est) text += " Estimate from the notes: " + est.name + " (confidence " + (Math.round(est.conf * 100) / 100) + ").";
  }
  const status = document.getElementById("notelistStatus");
  if (status) status.textContent = text;
  return r;
}
export function runMeterCheck() {
  const r = checkMeterVsFile();
  let text = fileCheckLine(r, "meter");
  if (appMode() === "normal" && r.file) text += " The file says: " + r.file.num + "/" + r.file.den + ".";
  const status = document.getElementById("notelistStatus");
  if (status) status.textContent = text;
  return r;
}
// Normal-only: prefills the meter editor and stops — Save still runs the
// existing two-tap re-bar warning (a meter change re-anchors every
// annotation), so nothing is written just from this tap.
export function useFileMeter() {
  const r = checkMeterVsFile();
  if (!r.file) return;
  openEditor(null, "timesig");
  document.getElementById("ntsnum").value = String(r.file.num);
  document.getElementById("ntsden").value = String(r.file.den);
}
export function tonicLabel(pc) { return TONIC_SPELL[pc].join("/"); }
export function chosenTonic() { // {pc, sp} — sp = "" when the spelling is undecided/unambiguous
  if (keysel.value === "") return null;
  const [pc, sp] = keysel.value.split(":");
  return {pc: +pc, sp: sp || ""};
}
export function chosenTonicPc() { const t = chosenTonic(); return t ? t.pc : null; }
export function partialNameOf(t) { return t.sp || tonicLabel(t.pc); }
// "Bb" asserted vs "A#/Bb" fused
export function tonicOptionValue(name) { // stored name -> option value ("Bb"→"10:Bb", "A#/Bb"→"10:", "C"→"0:")
  const pc = tonicPcOfName(name);
  if (pc === null) return "";
  const single = (name.match(/^([A-G][#b]?)$/) || [])[1];
  return pc + ":" + (single && TONIC_SPELL[pc].length > 1 ? single : "");
}
export function refreshKeysetLabel() {
  const t = chosenTonic();
  if (!S.song || !t) return;
  const mode = keymodeSel.value;
  const bar = Math.floor(S.playCursor / barTicks()) + 1;
  const label = mode
    ? "Set " + keyNameFor(t.pc, mode).name + " @ bar " + bar
    : "Store " + partialNameOf(t) + "? @ bar " + bar;
  if (keysetBtn.textContent !== label) keysetBtn.textContent = label; // runs per frame
}
// ---------------------------------------------------------------- notes list
export const notelistSheet = document.getElementById("notelistsheet");
// one group per annotation type, so working a single layer (all the chords,
// all the keys) never means hunting through a mixed chronological pile
export const NOTE_GROUPS = [
  {title: "KEY", type: "key", match: n => n.keydir !== undefined || n.keypartial},
  {title: "TEMPO", type: "tempo", match: n => n.tempodir !== undefined},
  {title: "TRACKS", type: "note", match: n => n.trackdir},
  {title: "METER", type: "timesig", match: n => !!n.tsdir},
  {title: "SECTIONS", type: "section", match: n => n.section},
  {title: "CHORDS", type: "chord", match: n => n.chord},
  {title: "LOOP", type: "loop", match: n => n.loopTo !== undefined},
  {title: "CHOP", type: "chop", match: n => !!n.chopdir},
  {title: "TEXT NOTES", type: "note", match: () => true}, // catches the rest
];
// Jump bar across the top: one chip per annotation type, with its count.
// Types that HAVE entries scroll to their group; empty ones open the editor
// preset to that type, because an empty group has nothing to scroll to and
// "add one of these" is the only thing you could want from it. Josh, 2026-08-25:
// "I just need a set of buttons at the top to easily go to those sections."
export function renderNoteJump(counts) {
  const bar = document.getElementById("notejump");
  bar.innerHTML = "";
  for (const g of NOTE_GROUPS) {
    const n = counts.get(g) || 0;
    const b = document.createElement("button");
    b.textContent = g.title + (n ? " " + n : "");
    b.className = n ? "has" : "";
    b.setAttribute("aria-label", n ? "Go to " + g.title : "Add " + g.title.toLowerCase());
    b.addEventListener("click", () => {
      const box = document.querySelector('.notegroup[data-type="' + g.title + '"]');
      if (box) { box.scrollIntoView({block: "start", behavior: "smooth"}); return; }
      notelistSheet.classList.remove("on");
      openEditor(null, g.type);
    });
    bar.appendChild(b);
  }
}
export function showHelpTab(name) {
  const sheet = document.getElementById("helpsheet");
  const secs = [...sheet.querySelectorAll(".hsec")];
  // an unknown tab falls back to Views — but only once the sections are
  // there to check against: before ensureHelpLoaded lands there are none,
  // and the asked-for tab must stay highlighted so the right one shows
  // the moment the body arrives (openHelp re-runs this then)
  if (secs.length && !secs.some(s => s.dataset.hsec === name)) name = "views";
  for (const b of sheet.querySelectorAll("#helptabs button")) {
    b.classList.toggle("on", b.dataset.hs === name);
    b.setAttribute("aria-selected", String(b.dataset.hs === name));
  }
  for (const sec of secs) sec.classList.toggle("on", sec.dataset.hsec === name);
  try { localStorage.setItem("ff1roll-helptab", name); } catch (e) {}
}
// The help body (the eight .hsec sections, 110 KB) is help/help.html, not
// index.html (docs/plans/2026-10-04-help-out.md): fetched the first time Help
// opens, injected into #helpbody, never re-fetched for the page's life. The
// promise lives on S (no top-level let outside state.js); a failed load
// clears it so the next open tries again instead of showing the error
// forever. Offline the service worker answers from its precache (sw.js);
// with no worker at all (dev server, first-ever visit gone offline) the
// error line below points at the GitHub manual — never a native dialog.
export const HELP_URL = "help/help.html";
export function ensureHelpLoaded() {
  if (S.helpLoad) return S.helpLoad;
  const body = document.getElementById("helpbody");
  S.helpLoad = (async () => {
    try {
      const r = await fetch(HELP_URL);
      if (!r.ok) throw new Error("HTTP " + r.status);
      body.innerHTML = await r.text();
      return true;
    } catch (err) {
      S.helpLoad = null;
      body.innerHTML = '<p class="status">Help couldn\u2019t be loaded (offline?). The full manual is on GitHub: ' +
        '<a href="https://github.com/Night-Roll-App/night-roll/blob/main/HELP.md" target="_blank" rel="noopener">HELP.md\u2009\u2197</a></p>';
      return false;
    }
  })();
  return S.helpLoad;
}
// The one way to open Help (File ▾ → Help; the e2e suite): the sheet shows
// at once with the tab strip live and "Loading help…" in the body, and the
// chosen section switches on when the body lands. `tab` defaults to the
// last one read on this device.
export function openHelp(tab) {
  const name = tab || localStorage.getItem("ff1roll-helptab") || "views";
  showHelpTab(name);
  document.getElementById("helpsheet").classList.add("on");
  return ensureHelpLoaded().then(ok => { if (ok) showHelpTab(name); return ok; });
}
export const lassobtn = document.getElementById("lassobtn");
// Challenge a chord band (Josh, 2026-08-07): tap the band, then ask. Reports
// the evidence — label tones present/missing, extra pitches, and what the
// lasso namer would call the full stack. On request only; never volunteers,
// never touches unlabeled spans. Extra tones are EVIDENCE, not verdicts: a
// tonic pedal under a V7 shows up here as "extra", and that's correct.
export function chordEvidence(sec) {
  const pitches = new Set();
  const byTrack = [];
  S.song.tracks.forEach((tr, ti) => {
    if (!trackShown(ti) || trackIsDrums(ti)) return;
    const ps = new Set();
    for (const n of tr.notes) {
      if (!n.gone && n.t < sec.end && n.t + n.d > sec.start) { pitches.add(n.p); ps.add(n.p); }
    }
    if (ps.size) byTrack.push({name: tr.name || "track " + (ti + 1), pitches: [...ps].sort((a, b) => a - b)});
  });
  if (!pitches.size) return {err: "no notes sound in this span"};
  const present = new Set([...pitches].map(p => p % 12));
  const m = parseChordSym(sec.text);
  let expected = null, roles = null;
  if (m) {
    const rootPc = (LETTER_PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
    const tmpl = CHORD_TEMPLATES.find(([suf]) => suf === (m[3] || ""));
    if (tmpl) {
      expected = new Set(tmpl[1].map(iv => (rootPc + iv) % 12));
      // pc -> role in the LABELED chord, so a partial match reads as
      // "has the 3rd and 7th, missing root and 5th" — the guide-tone story
      roles = {};
      for (const iv of tmpl[1]) {
        roles[(rootPc + iv) % 12] =
          iv === 0 ? "root" : iv <= 2 ? "9th" : iv <= 4 ? "3rd" : iv === 5 ? "4th"
          : iv <= 8 ? "5th" : iv === 9 ? (m[3].includes("6") ? "6th" : "7th") : "7th";
      }
      if (m[4]) {
        const bpc = (LETTER_PC[m[4][0]] + (m[4][1] === "#" ? 1 : m[4][1] === "b" ? -1 : 0) + 12) % 12;
        expected.add(bpc);
        if (!(bpc in roles)) roles[bpc] = "bass";
      }
    }
  }
  const missing = expected ? [...expected].filter(pc => !present.has(pc)) : null;
  const extra = expected ? [...present].filter(pc => !expected.has(pc)) : null;
  return {pitches: [...pitches].sort((a, b) => a - b), present, expected, missing, extra, roles, byTrack,
          namer: nameChord([...pitches], sfDeclaredAt(sec.start))};
}
export function openChallenge(sec) {
  const ev = chordEvidence(sec);
  const sf = sfDeclaredAt(sec.start);
  const body = document.getElementById("chbody");
  body.innerHTML = "";
  const copyLines = [];
  const line = (text, cls) => {
    const d = document.createElement("div");
    d.className = "chline" + (cls ? " " + cls : "");
    d.textContent = text;
    body.appendChild(d);
    copyLines.push(text);
  };
  const title = "CHALLENGE — " + sec.text + " · bar " + sec.b1 +
                (sec.b2 && sec.b2 !== sec.b1 ? "–" + sec.b2 : "");
  document.getElementById("chtitle").textContent = title;
  copyLines.push(title);
  if (ev.err) {
    line(ev.err, "dim");
  } else {
    const occ = pc => ev.pitches.filter(p => p % 12 === pc).map(p => pitchName(p, sf)).join(" ");
    line("label tones", "chhead");
    if (ev.expected === null) {
      line("label not in the chord vocabulary — tone check skipped", "dim");
    } else {
      for (const pc of ev.expected) {
        const has = ev.present.has(pc);
        line(spellPc(pc, sf) + " — " + ev.roles[pc] + (has ? " · sounds as " + occ(pc) : " · MISSING"),
             has ? "ok" : "bad");
      }
    }
    line("also sounding — evidence, not verdict (pedals and passing tones land here)", "chhead");
    if (ev.extra === null) {
      const all = [...new Set(ev.pitches.map(p => p % 12))];
      line(all.map(pc => spellPc(pc, sf)).join(" "), "warn");
    } else if (ev.extra.length) {
      for (const pc of ev.extra) line(spellPc(pc, sf) + " · sounds as " + occ(pc), "warn");
    } else {
      line("nothing outside the label", "dim");
    }
    line("by channel", "chhead");
    for (const t of ev.byTrack) line(t.name + ":  " + t.pitches.map(p => pitchName(p, sf)).join(" "), "dim");
    line("namer's read of the full stack", "chhead");
    line(ev.namer);
  }
  S.challengeCopy = copyLines.join("\n");
  document.getElementById("challengesheet").classList.add("on");
}

export function updateChordStale() { // Phase 2 (open-items plan): a chord band whose
  // label no longer matches what SOUNDS in its span gets a stale flag —
  // marked, never rewritten; renaming stays Josh's call in ☰ Notes
  if (!S.song || !isComposition()) return;
  for (const band of S.rollnotes) {
    delete band.stale;
    if (!band.chord || band.section || !(band.end > band.start)) continue;
    const pitches = [];
    S.song.tracks.forEach((tr, ti) => {
      if (trackIsDrums(ti)) return;
      for (const n of tr.notes)
        if (!n.gone && n.t < band.end && n.t + n.d > band.start) pitches.push(n.p);
    });
    if (!pitches.length) continue;
    const read = nameChord(pitches, sfDeclaredAt(band.start));
    if (read && !read.includes("one pitch class") &&
        read.split(" ")[0] !== band.text.split("/")[0].trim())
      band.stale = read;
  }
}
// Normal-only, one tap — same "declared, not just previewed" pattern as
// #keysetest (which promotes the ESTIMATE); this promotes the FILE's key.
export function useFileKey() {
  if (!S.song || !S.songKey) return;
  const r = checkKeyVsFile();
  if (!r.file || !r.file.name) return;
  const bar = Math.floor(S.playCursor / barTicks()) + 1;
  dropLocalKeyAt(bar);
  const fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + r.file.name, keydir: r.file.sf, added: true};
  S.rollnotes.push(resolveNote(fresh));
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  S.lastSubtitle = undefined;
  updateSubtitle();
  draw();
  setInfo("key set to " + r.file.name + " at bar " + bar + " (from the file's label — unsynced — Sync to commit)");
}
export function renderNoteList() {
  const rows = document.getElementById("notelistrows");
  rows.innerHTML = "";
  const counts = new Map();
  const sorted = [...S.rollnotes].sort((a, b) => a.start - b.start || (a.section ? -1 : 1));
  document.getElementById("notelistStatus").textContent = sorted.length
    ? sorted.length + " notes · tap one to edit or delete · synced-note changes need Sync to stick"
    : "No notes yet — add the first one.";
  const remaining = [...sorted];
  for (const g of NOTE_GROUPS) {
    const mine = [];
    for (let i = 0; i < remaining.length; i++) {
      if (g.match(remaining[i])) { mine.push(remaining[i]); remaining.splice(i--, 1); }
    }
    counts.set(g, mine.length);
    // hide empty groups; Text notes always shows (its + adds one), and KEY/
    // METER always show too — Check vs file works on every song, even one
    // with no key/meter declared yet (docs/declared-vs-learner-spec.md C7)
    if (!mine.length && g.type !== "note" && g.title !== "KEY" && g.title !== "METER") continue;
    const box = document.createElement("div");
    box.className = "notegroup";
    box.dataset.type = g.title; // the jump bar scrolls to this
    const head = document.createElement("div");
    head.className = "ghead";
    head.textContent = g.title + (mine.length ? " · " + mine.length : "");
    const add = document.createElement("button");
    add.className = "gadd";
    add.textContent = "+";
    add.setAttribute("aria-label", "Add " + g.title.toLowerCase());
    add.addEventListener("click", e => {
      e.stopPropagation();
      notelistSheet.classList.remove("on");
      openEditor(null, g.type);
    });
    if (g.type === "chord" && mine.length && isComposition()) {
      // on-demand label review — the app NEVER volunteers this (Josh's rule:
      // findings are his; a report he asked for is a tool, one he didn't is an answer)
      const chk = document.createElement("button");
      chk.className = "gadd";
      chk.style.width = "auto";
      chk.style.padding = "0 8px";
      chk.textContent = "Check labels";
      chk.addEventListener("click", e => {
        e.stopPropagation();
        updateChordStale();
        const flagged = S.rollnotes.filter(n => n.stale).length;
        renderNoteList();
        document.getElementById("notelistStatus").textContent = flagged
          ? flagged + " label(s) don't match what sounds in their span — shown below and as ⚠ on the bands. Your labels; rename or ignore. Any note edit clears the flags."
          : "Every chord label matches what sounds in its span.";
        draw();
      });
      head.appendChild(chk);
    }
    if (g.title === "KEY" || g.title === "METER") {
      // Check vs file (docs/declared-vs-learner-spec.md C7): on EVERY song —
      // seeing the button reveals nothing by itself, so it's never gated by
      // mode or by whether this song even carries a source. Learning never
      // shows the file's value or runs estimateKey (CLAUDE.md); Normal adds
      // the file's own value (+ the estimate, for key) and a one-tap "use
      // the file's" action.
      const chk = document.createElement("button");
      chk.className = "gadd";
      chk.style.width = "auto";
      chk.style.padding = "0 8px";
      chk.textContent = "Check vs file";
      const useBtn = document.createElement("button");
      useBtn.className = "gadd";
      useBtn.style.width = "auto";
      useBtn.style.padding = "0 8px";
      useBtn.style.display = "none";
      chk.addEventListener("click", e => {
        e.stopPropagation();
        const r = g.title === "KEY" ? runKeyCheck() : runMeterCheck();
        if (appMode() === "normal" && r.file) {
          useBtn.textContent = g.title === "KEY" ? "Use the file's (" + r.file.name + ")" : "Use the file's (" + r.file.num + "/" + r.file.den + ")";
          useBtn.style.display = "";
        } else useBtn.style.display = "none";
      });
      useBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (g.title === "KEY") useFileKey(); else useFileMeter();
        useBtn.style.display = "none";
      });
      head.appendChild(chk);
      head.appendChild(useBtn);
    }
    head.appendChild(add);
    const grows = document.createElement("div");
    grows.className = "grows";
    for (const n of mine) {
      const row = document.createElement("div");
      row.className = "noterow";
      row.setAttribute("role", "button");
      const where = document.createElement("span");
      where.className = "where";
      where.textContent = (n.b2 ? n.b1 + "." + n.q1 + "–" + n.b2 + "." + (n.q2 || beatsPerBarDisp())
                               : "bar " + n.b1 + (n.q1 !== 1 ? "." + n.q1 : "")) +
                          (n.chopdir ? " raw" : ""); // chop anchors are pre-chop capture coordinates
      const body = document.createElement("span");
      body.className = "body";
      body.textContent = n.text + (n.stale ? " — reads: " + n.stale : "");
      if ((n.section || n.chord) && S.sectionColors[n.text]) {
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
      if (n.added) {
        const u = document.createElement("span");
        u.className = "unsynced";
        u.textContent = "unsynced";
        row.append(u);
      }
      row.addEventListener("click", () => {
        notelistSheet.classList.remove("on");
        S.playCursor = n.start;
        updateSubtitle();
        draw();
        openEditor(n);
      });
      grows.appendChild(row);
    }
    box.append(head, grows);
    rows.appendChild(box);
  }
  renderNoteJump(counts);
}
// ☰ All notes (chrome density pass, 2026-10-01): extracted from #listbtn's
// own direct handler so #notesall (inside #notesmenu, the drop-up below)
// can call it too — #listbtn itself now just opens the drop-up.
export function openNoteList() {
  if (!S.song) return;
  renderNoteList();
  notelistSheet.classList.add("on");
}

export function fileMeterAt(tick) { // the file's own declared meter at a tick, or null
  if (!S.song || !S.song.source || !S.song.source.timesigs || !S.song.source.timesigs.length) return null;
  let cur = S.song.source.timesigs[0];
  for (const ts of S.song.source.timesigs) { if (ts.tick <= tick) cur = ts; else break; }
  return {num: cur.num, den: cur.den};
}
export function refreshKeyPreview() { // preview applies only when tonic AND mode are chosen
  const pc = chosenTonicPc(), mode = keymodeSel.value;
  const full = pc !== null && mode ? keyNameFor(pc, mode) : null;
  S.previewSf = full ? full.sf : null;
  keymodeSel.style.display = pc === null ? "none" : "";
  keysetBtn.style.display = pc === null ? "none" : "";
  refreshKeysetLabel();
  buildScoreModel();
  clampView();
  draw();
}

export function initNotes1() {
  {
    // black keys get THREE options (2026-08-12 spec): fused "A#/Bb" = spelling
    // undetermined, plus each asserted spelling — Josh can know a tonic is Bb
    // and not A# before knowing the mode, and the picker must let him say so.
    // Option value = "pc:spelling", fused/naturals = "pc:".
    for (let pc = 0; pc < 12; pc++) {
      const add = (sp, label) => {
        const o = document.createElement("option");
        o.value = pc + ":" + sp;
        o.textContent = label;
        keysel.appendChild(o);
      };
      if (TONIC_SPELL[pc].length === 1) add("", TONIC_SPELL[pc][0]);
      else {
        add("", tonicLabel(pc)); // undecided
        for (const sp of TONIC_SPELL[pc]) add(sp, "· " + sp);
      }
    }
    const nk = document.getElementById("nkeysel"); // editor picker: same tonic list
    for (const opt of keysel.querySelectorAll("option")) {
      if (opt.value === "") continue;
      nk.appendChild(opt.cloneNode(true));
    }
  }
   keysel.addEventListener("change", refreshKeyPreview);
  keymodeSel.addEventListener("change", refreshKeyPreview);
  keysetBtn.addEventListener("click", () => {
    const t = chosenTonic(), mode = keymodeSel.value;
    if (!t || !S.song || !S.songKey) return;
    const bar = Math.floor(S.playCursor / barTicks()) + 1;
    dropLocalKeyAt(bar);
    let name, fresh;
    if (mode) {
      const full = keyNameFor(t.pc, mode);
      name = full.name;
      fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + name, keydir: full.sf, added: true};
    } else { // tonic only: stored, NOT applied — asserted spelling if Josh chose one
      const tonic = partialNameOf(t);
      name = tonic + "?";
      fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + name, keypartial: tonic, added: true};
    }
    S.rollnotes.push(resolveNote(fresh));
    S.previewSf = null;
    keysel.value = "";
    keymodeSel.value = "";
    keysetBtn.style.display = "none";
    keymodeSel.style.display = "none";
    finalizeNotes();
    saveLocalNotes();
    buildScoreModel();
    S.lastSubtitle = undefined;
    updateSubtitle();
    draw();
    setInfo(mode ? "key set to " + name + " at bar " + bar + " (unsynced — Sync to commit)"
                 : "tonic " + name + " stored at bar " + bar + " — NOT applied until a mode is set");
  });
  document.getElementById("keysetest").addEventListener("click", () => {
    // promotes the Normal-mode estimate to a real, declared key: annotation —
    // still only on a tap, same as any other key declaration (never written
    // just because Normal mode is on)
    if (!S.song || !S.songKey) return;
    const est = estimateKey();
    if (!est) return;
    const bar = Math.floor(S.playCursor / barTicks()) + 1;
    dropLocalKeyAt(bar);
    const fresh = {b1: bar, q1: 1, b2: null, q2: null, text: "key: " + est.name, keydir: est.sf, added: true};
    S.rollnotes.push(resolveNote(fresh));
    finalizeNotes();
    saveLocalNotes();
    buildScoreModel();
    S.lastSubtitle = undefined;
    updateSubtitle();
    draw();
    setInfo("key set to " + est.name + " at bar " + bar + " (from the estimate — unsynced — Sync to commit)");
  });
}

export function initNotes2() {
  document.getElementById("listbtn").addEventListener("click", e => {
    document.getElementById("notesstrip").textContent = S.subOn ? "Hide notes strip" : "Show notes strip";
    openDropUp(e.currentTarget, document.getElementById("notesmenu"));
  });
  document.getElementById("notesstrip").addEventListener("click", () => { closeDropUp(); toggleSubtitle(); renderViewMenu(); });
  document.getElementById("notesall").addEventListener("click", () => { closeDropUp(); openNoteList(); });
  document.getElementById("notelistSync").addEventListener("click", () => {
    notelistSheet.classList.remove("on");
    document.getElementById("syncbtn").click();
    S.syncReturnToList = true; // after a successful commit, go back to the list
  });
  document.getElementById("notelistAdd").addEventListener("click", () => {
    notelistSheet.classList.remove("on");
    openEditor(null);
  });

  document.getElementById("helptabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-hs]");
    if (b) showHelpTab(b.dataset.hs);
  });
  document.getElementById("filehelp").addEventListener("click", () => {
    closeFileMenus();
    openHelp();
  });
  document.getElementById("fileabout").addEventListener("click", () => {
    closeFileMenus();
    const n = Object.values(S.CATALOG).reduce((k, s) => k + s.length, 0);
    document.getElementById("aboutstats").textContent =
      Object.keys(S.CATALOG).length + " albums · " + n + " songs · " + draftKeys().length + " local drafts";
    document.getElementById("aboutsheet").classList.add("on");
  });
}

export function initNotes3() {
  lassobtn.addEventListener("click", () => {
    S.lassoMode = !S.lassoMode;
    lassobtn.classList.toggle("active", S.lassoMode);
    lassobtn.setAttribute("aria-pressed", String(S.lassoMode));
    clearMultiSel();
    setInfo(S.lassoMode ? "lasso: drag across notes to identify them" : "tap a note");
    draw();
  });
  document.getElementById("chcopy").addEventListener("click", async e => {
    try { await navigator.clipboard.writeText(S.challengeCopy); e.target.textContent = "✓ copied"; }
    catch { e.target.textContent = "✗ copy failed"; }
    setTimeout(() => { e.target.textContent = "Copy"; }, 1200);
  });
  document.getElementById("chordbtn").addEventListener("click", () => {
    if (S.challengeSec) { openChallenge(S.challengeSec); return; }
    if (!S.multiSel.length) return;
    const pitches = S.multiSel.map(s => S.song.tracks[s.ti].notes[s.ni].p);
    const names = [...new Set(pitches)].sort((a, b) => a - b).map(p => pitchName(p, S.multiSelSf));
    const chordName = nameChord(pitches, S.multiSelSf);
    setInfo(names.join(" · ") + "  →  " + chordName, names.join(", ") + " — " + chordName);
  });
}
