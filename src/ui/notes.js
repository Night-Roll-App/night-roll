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
import { computeSongEnd } from "./sheets.js";
import { SF_MAJOR } from "../theory/chords.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { keyLabelState } from "./chrome.js";
import { secDepthCap } from "../model/grid.js";
import { TRACK_COLORS } from "../render/roll.js";
import { BASE_RULER_H } from "../render/roll.js";
import { LANE_H } from "../render/roll.js";
import { songHasAudio } from "../audio/clips.js";
import { AUDIO_STRIP_H } from "../render/roll.js";
import { STRIP_H } from "../render/roll.js";

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
  if (!sheet.querySelector('.hsec[data-hsec="' + name + '"]')) name = "views";
  for (const b of sheet.querySelectorAll("#helptabs button")) {
    b.classList.toggle("on", b.dataset.hs === name);
    b.setAttribute("aria-selected", String(b.dataset.hs === name));
  }
  for (const sec of sheet.querySelectorAll(".hsec")) sec.classList.toggle("on", sec.dataset.hsec === name);
  try { localStorage.setItem("ff1roll-helptab", name); } catch (e) {}
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
