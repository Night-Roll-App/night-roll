import { S, prof } from "../state.js";
import { setAnchorBQ } from "../hooks.js";
import { resolveNote } from "../model/rollnotes.js";
import { barTicks } from "../model/rollnotes.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { isComposition } from "../model/provenance.js";
import { chordQualCompose } from "../theory/chords.js";
import { parseChordSym } from "../theory/chords.js";
import { chordQualParse } from "../theory/chords.js";
import { micStop } from "./chrome.js";
import { LINK_SONGS } from "../platform/base.js";
import { setInfoImpl as setInfo } from "./chrome.js";
import { linkRepoLabel } from "../platform/base.js";
import { beatTicks } from "../model/grid.js";
import { tonicOptionValue } from "./notes.js";
import { modeOfName } from "../theory/chords.js";
import { selEditItems } from "../model/selection.js";
import { selClipObj } from "../render/tracks.js";
import { clipboardHas } from "../model/selection.js";
import { isDirective } from "../model/rollnotes.js";
import { lassoedAnnos } from "../hooks.js";
import { annoInLassoImpl as annoInLasso } from "../render/roll.js";
import { editableSong } from "../model/song.js";
import { ownFolderPath } from "../model/provenance.js";
import { originOf } from "../model/provenance.js";
import { drawImpl as draw } from "./chrome.js";
import { sfShownAt } from "../model/song.js";
import { pitchName } from "../theory/chords.js";
import { spellPc } from "../theory/chords.js";
import { appMode } from "../platform/mode.js";
import { nameChord } from "../theory/chords.js";
import { snapBeat } from "../model/grid.js";
import { setEndBQ } from "../model/rollnotes.js";
import { dropSupersededBy } from "../model/rollnotes.js";
import { isTripletDur } from "../model/grid.js";
import { trackShown } from "../render/roll.js";
import { annoSnapshot } from "../model/edits.js";
import { annoRestore } from "../model/rollnotes.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { saveLocalNotes } from "../model/edits.js";
import { pruneTombstones } from "../model/edits.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { renderTrackbarImpl as renderTrackbar } from "./trackbar.js";
import { updateTrackGains } from "../audio/engine.js";
import { saveDraft } from "../model/versions.js";
import { renderMixer } from "./mixer.js";
import { saveEdits } from "../model/edits.js";
import { computeSongEnd } from "../model/song.js";
import { openGridSheet } from "./sheets.js";
import { editsKey } from "../model/edits.js";
import { loadSong } from "../session/song.js";
import { CHORD_BASES } from "../theory/chords.js";
import { CHORD_EXTS } from "../theory/chords.js";
import { nmic } from "./chrome.js";
import { ROLLNOTES_LOCK_MSG } from "../model/rollnotes.js";
import { retireEdited } from "../model/edits.js";
import { dropLocalKeyAt } from "../model/rollnotes.js";
import { keyNameFor } from "../theory/key.js";
import { tonicLabel } from "./notes.js";
import { effTs } from "../model/grid.js";
import { convertAnchors } from "../model/rollnotes.js";
import { shiftAnchors } from "../model/rollnotes.js";
import { clampViewImpl as clampView } from "./chrome.js";
import { updateSubtitleImpl as updateSubtitle } from "./chrome.js";
import { tombstone } from "../model/edits.js";
import { selEditApply } from "../model/selection.js";
import { copySelection } from "../model/selection.js";
import { clipSummary } from "../model/selection.js";
import { nudgeSelection } from "../model/selection.js";
import { diatonicShift } from "../model/selection.js";
import { divideSelection } from "../model/selection.js";
import { quantizeSelection } from "../model/selection.js";
import { cutSelection } from "../model/selection.js";
import { splitSelectedClipAtCursor } from "../audio/clips.js";
import { splitSelectionAt } from "../model/selection.js";
import { splitSelectionHalves } from "../model/selection.js";
import { joinSelection } from "../model/selection.js";
import { deleteSelection } from "../model/selection.js";
import { moveSnapTicks } from "../model/grid.js";
import { saveVersion } from "../session/files.js";
import { pasteClipboard } from "../model/selection.js";
import { duplicateSelection } from "../model/selection.js";
import { resizeSelection } from "../model/selection.js";

export const CHORD_ROOTS = ["C", "C♯/D♭", "D", "D♯/E♭", "E", "F", "F♯/G♭", "G", "G♯/A♭", "A", "A♯/B♭", "B"];
export const INS_DURS = [["16th", 0.25], ["8th", 0.5], ["8th.", 0.75], ["quarter", 1],
                  ["quarter.", 1.5], ["half", 2], ["half.", 3], ["whole", 4]];
// quarters — the Insert dialogs' own duration, independent of the pencil
export function chordLabel() {
  return CHORD_ROOTS[S.chordRoot].split("/")[0] + (S.chordQual === "maj" ? "" : S.chordQual);
}
// Progression library (Josh, 2026-08-17): emotions → Roman-numeral recipes.
// Numerals are major-scale-relative (♭VI = lowered 6th degree), the app's
// degree convention; lowercase = minor chord. Deliberately key-agnostic.
export const PROG_LIB = [
  ["Triumphant", "I – IV – V – I", "the textbook full cadence — arrival with banners"],
  ["Heroic", "I – ♭VII – IV – I", "the Mixolydian rock-hero loop; ♭VII is the swagger"],
  ["Hopeful", "I – V – vi – IV", "the four-chord anthem — rises, dips minor, lands warm"],
  ["Bittersweet", "vi – IV – I – V", "same chords as Hopeful, started on the minor — smiling through it"],
  ["Nostalgic", "I – vi – IV – V", "the 50s doo-wop turnaround; instant sepia"],
  ["Romantic", "Imaj7 – vi7 – ii7 – V7", "jazz turnaround with the sevenths left in — candlelight"],
  ["Peaceful", "I – IV – I – IV", "plagal rocking, no leading tone anywhere — nothing needs to happen"],
  ["Dreamy", "Imaj7 – IVmaj7", "two maj7 chords floating a fourth apart; time gets soft"],
  ["Wonder", "I – II", "the Lydian lift — the major chord one whole step up opens the sky"],
  ["Playful", "I – VI7 – II7 – V7", "the ragtime circle of dominants; every chord winks"],
  ["Yearning", "IV – V – iii – vi", "the JRPG 'royal road' — reaches, almost resolves, aches instead"],
  ["Anxious", "vi – V – IV – V", "circles the tonic without ever landing on it"],
  ["Melancholy", "i7 – iv7 – ♭VI – V7", "minor with sevenths — sadness that still moves forward"],
  ["Sad (epic)", "i – ♭VI – ♭III – ♭VII", "the dark pop loop; grief with scale"],
  ["Grieving", "i – ♭VII – ♭VI – V", "the Andalusian descent — the bass walks down to the funeral"],
  ["Lonely", "i – v – i – v", "minor v instead of major V: no leading tone, no one coming"],
  ["Dark epic", "i – ♭VI – ♭VII – i", "the boss-theme loop; menace in armor"],
  ["Ominous", "i – ♭II", "the Neapolitan half-step shadow — Jaws lives here"],
  ["Villainous", "i – ♭vi", "minor chromatic mediant (Cm→A♭m): wrongness with a cape"],
  ["Creepy", "i – ♯iv°", "tonic against the tritone diminished — the floor isn't real"],
  ["Battle", "i – ♭VII – ♭VI – ♭VII", "the driving minor loop; run, fight, repeat"],
  ["Mysterious", "I – ♭VI", "major chromatic mediant (C→A♭): familiar light, unfamiliar room"],
  ["Tense", "i – ♭II – ♭III – ♭II", "phrygian steps grinding a half-step above home"],
];
// ---------------------------------------------------------------- note editor
export const editor = document.getElementById("noteeditor");
export function fillBarBeatSelects() {
  const bars = Math.max(1, Math.round(S.songEndTick / barTicks()));
  const beatsPerBar = beatsPerBarDisp();
  const mkBars = (id, noneOption, pastEnd) => {
    const s = document.getElementById(id);
    s.innerHTML = "";
    if (noneOption) {
      const o = document.createElement("option");
      o.value = ""; o.textContent = "—";
      s.appendChild(o);
    }
    // pastEnd: one extra bar so a loop's "from" can name the absolute end
    // of the song — bar N+1 beat 1 IS the end of bar N
    for (let b = 1; b <= bars + (pastEnd ? 1 : 0); b++) {
      const o = document.createElement("option");
      o.value = String(b); o.textContent = String(b);
      s.appendChild(o);
    }
  };
  const mkBeats = (id) => { // whole beats only — subdivisions live in the paired select
    const s = document.getElementById(id);
    s.innerHTML = "";
    for (let b = 1; b <= beatsPerBar; b++) {
      const o = document.createElement("option");
      o.value = String(b); o.textContent = String(b);
      s.appendChild(o);
    }
  };
  const mkSubs = (id) => { // Josh's split (2026-08-18): one merged 1/1e/1&/1a…
    // dropdown got huge — beat picks the beat, this picks the 16th within it
    const s = document.getElementById(id);
    s.innerHTML = "";
    for (const [f, syl] of [[0, "·"], [0.25, "e"], [0.5, "&"], [0.75, "a"]]) {
      const o = document.createElement("option");
      o.value = String(f); o.textContent = syl;
      s.appendChild(o);
    }
  };
  mkBars("nb1", false, true); mkBars("nb2", true); mkBars("nlb", false);
  mkBeats("nq1"); mkBeats("nq2"); mkBeats("nlq");
  mkSubs("ns1"); mkSubs("ns2"); mkSubs("nls");
}
export function editorType() { return document.getElementById("ntype").value; }
export function applyEditorType() {
  const t = editorType();
  document.getElementById("ntext").style.display = ""; // every authored type carries a note (Josh, 2026-08-22)
  document.getElementById("nsectrow").style.display = t === "section" ? "" : "none";
  document.getElementById("nkeyrow").style.display = t === "key" ? "" : "none";
  document.getElementById("nchordbox").style.display = t === "chord" ? "" : "none";
  document.getElementById("ntsrow").style.display = t === "timesig" ? "" : "none";
  document.getElementById("ntemporow").style.display = t === "tempo" ? "" : "none";
  document.getElementById("nlooprow").style.display = t === "loop" ? "" : "none";
  document.getElementById("nchoprow").style.display = t === "chop" ? "" : "none";
  document.getElementById("ntorow").style.display = t === "loop" || t === "timesig" || t === "chop" || t === "tempo" ? "none" : "";
  document.getElementById("nmic").style.display =
    SPEECH && t !== "key" && t !== "loop" && t !== "timesig" && t !== "chop" && t !== "tempo" ? "" : "none"; // dictation targets the text box
  document.getElementById("ntext").placeholder =
    t === "note" ? "What's happening at this beat?"
                 : "Optional note about this " + (t === "timesig" ? "meter" : t) + " (✱ in the ruler)";
  document.getElementById("nstatus").textContent =
    t === "key" ? "To bar '—' = until further notice; set it to make a temporary key that reverts after." :
    t === "chord" ? "Tap chips or type the symbol. Standard: bare root = major (C), m = minor (Gm), /X = bass note (G7/B)." :
    t === "chop" ? "Non-destructive trim: the chopped part disappears entirely and bars renumber. Chopping the start shifts your annotations to match; delete the chop to restore." :
    t === "loop" ? "When playback reaches the 'from' point (or the song end, if 'from' is at/before the target), it jumps back to the target bar/beat." :
    t === "timesig" ? "Until you declare a meter, the grid is a neutral 4/4 ruler. Declaring re-bars the song; existing annotations are converted to keep their musical positions." :
    t === "tempo" ? (isComposition()
      ? "Authoring: sets the tempo from this bar/beat onward. Playback, the LCD, and Save all follow."
      : "Observation: records that the music changes tempo here. Playback is untouched — the capture's timing is measured fact.") :
    document.getElementById("nstatus").textContent;
}
export const BASS_SPELLINGS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb",
                        "G", "G#", "Ab", "A", "A#", "Bb", "B"];
export const chordSel = {root: null, acc: "", base: "maj", exts: []};
export function refreshChordChips() {
  for (const b of document.querySelectorAll("#nchordroot button"))
    b.classList.toggle("active", b.dataset.v === chordSel.root);
  for (const b of document.querySelectorAll("#nchordacc button"))
    b.classList.toggle("active", chordSel.root !== null && b.dataset.v === chordSel.acc);
  for (const b of document.querySelectorAll("#nchordqual button"))
    b.classList.toggle("active", chordSel.base !== null && b.dataset.v === chordSel.base);
  for (const b of document.querySelectorAll("#nchordext button"))
    b.classList.toggle("active", chordSel.base !== null && chordSel.exts.includes(b.dataset.v));
}
export function composeChord() {
  if (!chordSel.root || chordSel.base === null) return; // incomplete/unknown — leave the box alone
  const bass = document.getElementById("nchordbass").value;
  document.getElementById("nchordsym").value = chordSel.root + chordSel.acc +
    chordQualCompose(chordSel.base, chordSel.exts) + (bass ? "/" + bass : "");
}
export function setChordWidget(sym) {
  const m = parseChordSym(sym);
  chordSel.root = m ? m[1] : null;
  chordSel.acc = m ? m[2] : "";
  const q = m ? chordQualParse(m[3]) : {base: "maj", exts: []};
  chordSel.base = q ? q.base : null; // unknown quality: chips stand down
  chordSel.exts = q ? q.exts : [];
  document.getElementById("nchordbass").value = m && m[4] ? m[4] : "";
  document.getElementById("nchordsym").value = sym || "";
  refreshChordChips();
}
// dictation into the note text box (Web Speech API — easier on hands than
// typing; falls back silently to the keyboard mic where unsupported)
export const SPEECH = window.SpeechRecognition || window.webkitSpeechRecognition || null;
// whichever 🎤 is live (annotation editor or ✦ AI)
// Safari hands dictation back one segment per pause, with no space and no
// period between segments, but it capitalizes the first word after a pause
// (Josh, 2026-09-26: "nowAnd", "butIt"). Join segments with a space, and when
// the next one starts with a capital and the last ended with none of .?!,;:
// close the sentence with a period first.
export function micJoin(parts) {
  let out = "";
  for (let p of parts) {
    p = (p || "").trim();
    if (!p) continue;
    if (!out) { out = p; continue; }
    const closes = /[.?!,;:]$/.test(out);
    out += (!closes && /^[A-Z]/.test(p) ? ". " : " ") + p;
  }
  return out;
}
export function micToggle(btn, textarea, statusFn) { // shared dictation: append into any box
  if (S.micRec) { const same = S.micBtn === btn; micStop(!same); if (same) return; } // same button = a tapped Stop: its words still land
  // a stale late result must not overwrite this session's base — and Safari
  // runs ONE recognition at a time: a stopped session still winding down made
  // the new start() throw while the button said it was listening (Josh,
  // 2026-09-26: "it just wasn't accepting anything")
  if (S.micPrev) { S.micPrev.onresult = null; try { S.micPrev.abort(); } catch (err) { /* already gone */ } S.micPrev = null; }
  const base = textarea.value ? textarea.value.replace(/\s+$/, "") + " " : "";
  let finals = "";
  S.micRec = new SPEECH();
  S.micBtn = btn;
  S.micRec.continuous = true;
  S.micRec.interimResults = true;
  S.micRec.onresult = e => {
    const fin = [], mid = [];
    for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? fin : mid).push(e.results[i][0].transcript);
    finals = micJoin(fin);
    textarea.value = micJoin([base, finals, micJoin(mid)]);
    textarea.dispatchEvent(new Event("input")); // so the box grows/scrolls as it would when typed into
  };
  S.micRec.onerror = e => {
    statusFn(e.error === "not-allowed" ? "Microphone permission denied — allow it in Safari settings."
                                       : "Dictation error: " + e.error);
    micStop();
  };
  S.micRec.onend = () => micStop(); // Safari ends recognition on silence
  btn.classList.add("active");
  btn.textContent = "■ Stop listening"; // the Ask sheet has a second ■ (stop reply): say which this is
  try { S.micRec.start(); }
  catch (err) { statusFn("Dictation couldn't start (" + (err.message || err) + ") — tap 🎤 again"); micStop(true); } // never a listening button that isn't
}
export function setBeatPair(qid, sid, q) { // 2.75 → beat "2", sub ".75"
  q = snapBeat(q);
  const beat = Math.floor(q + 0.03);
  document.getElementById(qid).value = String(beat);
  document.getElementById(sid).value = String(Math.round((q - beat) * 4) / 4);
}
export function getBeatPair(qid, sid) {
  return (+document.getElementById(qid).value || 1) + (+document.getElementById(sid).value || 0);
}
export function openEditor(note, presetType, opts) { // opts.atStart: a new note anchors at bar 1 beat 1, ignoring the cursor/selection
  if (LINK_SONGS) { setInfo("you're listening to " + linkRepoLabel(LINK_SONGS) + "'s song from a link — annotations are theirs; open your own copy to write"); return; }
  micStop(true);
  S.editingNote = note || null;
  fillBarBeatSelects();
  const bt = barTicks();
  // a tapped note anchors a new note: tapping no longer moves the cursor
  // (DAW habit, 2026-09-29), and tap-a-note → + Note is how Josh annotates
  const at0 = opts && opts.atStart ? 0 : !note && S.selNote && S.song.tracks[S.selNote.ti] && S.song.tracks[S.selNote.ti].notes[S.selNote.ni] ? S.song.tracks[S.selNote.ti].notes[S.selNote.ni].t : S.playCursor;
  let b1 = Math.floor(at0 / bt) + 1;
  let q1 = snapBeat((at0 % bt) / beatTicks() + 1);
  let b2 = "", q2 = "";
  if (!note && S.rangeSel && !(opts && opts.atStart)) { // prefill the from/to fields from the ruler selection
    b1 = Math.floor(S.rangeSel.a / bt) + 1;
    q1 = snapBeat((S.rangeSel.a % bt) / beatTicks() + 1);
    const last = S.rangeSel.b - beatTicks(); // inclusive last beat of the selection
    if (last >= S.rangeSel.a) { // >= so a one-beat selection prefills To = From
      b2 = Math.floor(last / bt) + 1;
      q2 = snapBeat((last % bt) / beatTicks() + 1);
    }
  }
  const type = note ? (note.chord ? "chord" : note.section ? "section"
                       : note.keydir !== undefined || note.keypartial ? "key"
                       : note.tsdir ? "timesig" : note.tempodir !== undefined ? "tempo" : note.chopdir ? "chop"
                       : note.loopTo !== undefined ? "loop" : "note")
             : presetType ? presetType // a group's + button pre-picks its type
             // a drag before + Note means "label this span" — as whichever of
             // section/chord was dragged last (chord runs stay in chord mode)
             : S.rangeSel ? (localStorage.getItem("ff1roll-dragtype") || "section")
             : "note";
  document.getElementById("ntype").value = type;
  if (type === "tempo") {
    let usq = S.song.tempos[0].usq;
    for (const tp of S.song.tempos) { if (tp.tick <= at0) usq = tp.usq; else break; }
    document.getElementById("ntempo").value =
      note && note.tempodir !== undefined ? String(note.tempodir) : String(Math.round(6e7 / usq));
  }
  if (type === "timesig" && note) {
    document.getElementById("ntsnum").value = String(note.tsdir[0]);
    document.getElementById("ntsden").value = String(note.tsdir[1]);
  }
  S.rebarArmed = false; // any editor open resets the two-tap warning
  if (!note && S.rangeSel) setTimeout(() =>
    document.getElementById(type === "chord" ? "nchordsym" : "ntext").focus(), 50);
  if (type === "loop" && note) {
    const lbt = barTicks();
    document.getElementById("nlb").value = String(Math.floor(note.loopTo / lbt) + 1);
    setBeatPair("nlq", "nls", (note.loopTo % lbt) / beatTicks() + 1);
  }
  document.getElementById("nb1").value = String(note ? note.b1 : b1);
  setBeatPair("nq1", "ns1", note ? note.q1 : q1);
  document.getElementById("nb2").value = note ? (note.b2 ? String(note.b2) : "") : (b2 ? String(b2) : "");
  setBeatPair("nq2", "ns2", note ? (note.q2 || beatsPerBarDisp()) : (q2 || beatsPerBarDisp()));
  if (type === "chop" && note) {
    // show the cut in DISPLAYED coordinates (start chop = the current bar 1),
    // overriding the raw-space b1/q1 the directive itself stores
    document.getElementById("nchopmode").value = note.chopdir;
    const dt = note.chopdir === "start" ? 0 : Math.max(0, (S.chopE !== null ? S.chopE : 0) - S.chopS);
    document.getElementById("nb1").value = String(Math.floor(dt / barTicks()) + 1);
    setBeatPair("nq1", "ns1", (dt % barTicks()) / beatTicks() + 1);
  }
  document.getElementById("ntext").value =
    ["chord", "key", "tempo", "timesig", "loop", "section", "chop"].includes(type)
      ? (note && note.cnote || "")
      : note ? note.text : "";
  document.getElementById("nsectlabel").value = type === "section" && note ? note.text : "";
  if (type === "chord") setChordWidget(note ? note.text : "");
  if (type === "key" && note) {
    const nm = (note.text.match(/^key:\s*(\S+(?:\s+[a-z]+)?)/i) || [])[1] || "";
    if (note.keypartial) {
      document.getElementById("nkeysel").value = tonicOptionValue(note.keypartial);
      document.getElementById("nkeymode").value = ""; // tonic stored, mode pending
    } else {
      document.getElementById("nkeysel").value = tonicOptionValue((nm.match(/^([A-G][#b]?)/) || ["", "C"])[1]);
      document.getElementById("nkeymode").value = modeOfName(nm);
    }
  }
  document.getElementById("ndelete").style.display = note ? "" : "none";
  document.getElementById("nstatus").textContent = note && !note.added
    ? "Synced note — edits and deletes become permanent when you Sync." : "";
  applyEditorType();
  editor.classList.add("on");
  // the text box gets focus only for a NEW text note, where typing is the
  // next thing — opening an existing one (any kind) must not raise the iPad
  // keyboard over half the screen (Josh, 2026-10-03)
  if (type === "note" && !note) document.getElementById("ntext").focus();
  else if (document.activeElement && editor.contains(document.activeElement)) document.activeElement.blur();
}
export function updateEditButtons() { // disabled = "this can't do anything right now"
  const sel = S.song ? selEditItems().length : 0;
  const annos = S.song && S.lassoAnno ? lassoedAnnos().length : 0;
  const piece = !!(S.song && S.selClip && selClipObj()); // a selected audio piece splits too
  const st = [!S.editUndo.length, !S.editRedo.length, !sel, !clipboardHas(), !(sel || annos), !(sel || piece)];
  const key = st.join("|");
  if (key === S.editBtnCache) return;
  S.editBtnCache = key;
  const set = (id, off) => { const b = document.getElementById(id); if (b) b.disabled = off; };
  set("undobtn", st[0]); set("emUndo", st[0]);
  set("redobtn", st[1]); set("emRedo", st[1]);
  set("splitbtn", st[5]); set("emSplit", st[5]);
  for (const id of ["joinbtn", "emJoin", "movebtn", "emMove",
                    "divbtn", "emDivide", "trbtn", "emTranspose",
                    "quantbtn", "emQuantize"]) set(id, st[2]);
  for (const id of ["copybtn", "emDup", "cutbtn", "emCut", "delbtn", "emDelete"]) set(id, st[4]); // these also act on lasso'd annotations, notes or not
  set("pastebtn", st[3]); set("emPaste", st[3]); set("emPasteTo", st[3]);
}
updateEditButtons = prof("updateEditButtons", updateEditButtons); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

export function setAnchorBQImpl(n, tick) { // start anchor from a tick
  const bt = barTicks(), qt = beatTicks(), t = Math.max(0, tick);
  n.b1 = Math.floor(t / bt) + 1;
  n.q1 = snapBeat((t % bt) / qt + 1);
}
export function lassoedAnnosImpl() { return S.lassoAnno ? S.rollnotes.filter(n => annoInLasso(n, S.lassoAnno)) : []; }

export function refreshSelInfo() { // one source of truth for the selection readout
  // 8va (footer v2, 2026-09-30): moved into ⋯ More → SELECTION READOUT as an
  // always-visible toggle (Josh's usage note: it's reached with no lasso
  // selection too, to set the sticky preference ahead of time) — no more
  // show/hide here, just its checked state, rendered every call.
  renderOctBtn();
  if (!S.multiSel.length) {
    document.getElementById("chordbtn").style.display = "none";
    setInfo("lasso: nothing selected");
    draw();
    return;
  }
  const tMin = Math.min(...S.multiSel.map(s => S.song.tracks[s.ti].notes[s.ni].t));
  S.multiSelSf = sfShownAt(Math.max(0, tMin));
  reflectSelVel();
  const pitches = [...new Set(S.multiSel.map(s => S.song.tracks[s.ti].notes[s.ni].p))].sort((a, b) => a - b);
  // 8va off = chord-reading mode: pitch classes only, octave duplicates collapsed
  const names = S.selOctaves
    ? pitches.map(p => pitchName(p, S.multiSelSf))
    : [...new Set(pitches.map(p => p % 12))].map(pc => spellPc(pc, S.multiSelSf));
  const vels = [...new Set(S.multiSel.map(s => S.song.tracks[s.ti].notes[s.ni].v))];
  const velTxt = vels.length === 1 ? " · vel " + vels[0] : ""; // uniform velocity is worth stating
  S.challengeSec = null;
  const cb = document.getElementById("chordbtn");
  if (appMode() === "normal") {
    // Normal: the chord names itself (nameChord is pattern-matching, not a
    // ruling on Josh's music) — Chord? stays hidden, nothing to reveal
    const chordName = nameChord(pitches, S.multiSelSf);
    setInfo(names.join(" · ") + "  →  " + chordName + "  (" + S.multiSel.length + " notes" + velTxt + ")",
            names.join(", ") + " — " + chordName);
    cb.style.display = "none";
  } else {
    setInfo(names.join(" · ") + "  (" + S.multiSel.length + " notes" + velTxt + ")", names.join(", "));
    cb.textContent = "Chord?";
    cb.style.display = "";
  }
  draw();
}
// 8va: octave numbers in the readout
export function renderOctBtn() { // ✓ = selOctaves on — same convention as renderViewMenu's checkmarks
  const ob = document.getElementById("octbtn");
  ob.textContent = (S.selOctaves ? "✓ " : "   ") + "8va  Show octave numbers (F#3 vs F#)";
  ob.classList.toggle("primary", S.selOctaves);
}

export function reflectSelVel() { // slider face shows the selection's velocity
  const items = selEditItems();
  if (!items.length) return;
  const v = items[0].n.v || 80;
  const sl = document.getElementById("velslider");
  if (sl) { sl.value = v; document.getElementById("velval").textContent = v; }
}

export function syncDurSeg() {
  if (typeof document.querySelectorAll !== "function") return; // vm harness
  const seg = document.getElementById("durseg"); // a custom grid outranks the chips: say so, always
  // (handoff 2026-09-12: a 4/bar grid left armed from another song read as
  // "everything moves in quarters" with nothing on screen to say why)
  seg.title = S.gridDiv ? "custom grid " + S.gridDiv + "/bar rules — pencil taps and moves use its cells (the grid chip to change or turn off)" : "";
  const gc = document.getElementById("gridchip");
  if (gc) { gc.style.display = S.gridDiv ? "" : "none"; const l = gc.querySelector(".lbl"); if (l) l.textContent = S.gridDiv || ""; gc.classList.toggle("active", !!S.gridDiv); gc.setAttribute("aria-pressed", String(!!S.gridDiv)); }
  for (const x of document.querySelectorAll("#durseg button")) {
    if (x.dataset.grid) continue;
    const on = !S.gridDiv && (x.dataset.nv ? +x.dataset.nv === S.pencilNV : parseFloat(x.dataset.mod) === S.pencilMod);
    x.classList.toggle("active", on);
    x.setAttribute("aria-pressed", String(on));
    x.style.opacity = S.gridDiv ? "0.45" : "";
  }
}

// The grid picks up the note you touch: a triplet note (triplet position or
// triplet length) moves on triplet steps, a straight one on 16ths — no trip
// to the chips to move either (Josh, 2026-09-12). Chips still override after.
export function gridFollowNote(n) {
  if (!n || S.gridDiv) return false; // a custom grid outranks all
  const q = S.song.ppq, onLine = (t, g) => Math.abs(t / g - Math.round(t / g)) < 1e-6;
  const trip = (onLine(n.t, q / 3) && !onLine(n.t, q / 4)) || isTripletDur(n.d / q);
  if (trip === isTripletDur(S.pencilDur)) return false;
  if (trip) { S.pencilMod = 2 / 3; S.pencilNV = n.d / q >= 0.6 ? 4 : n.d / q >= 0.3 ? 8 : 16; }
  else { S.pencilMod = 1; S.pencilNV = 16; }
  S.pencilDur = (4 / S.pencilNV) * S.pencilMod;
  syncDurSeg();
  return true;
}

export function selectAllNotes() { // ⌘A: every visible note (hidden tracks stay out — H means out of reach)
  if (!S.song) return 0;
  S.multiSel = [];
  S.song.tracks.forEach((tr, ti) => { if (!trackShown(ti) || tr.kind === "audio") return; tr.notes.forEach((n, ni) => { if (!n.gone) S.multiSel.push({ti, ni}); }); });
  S.multiSelKey = new Set(S.multiSel.map(({ti, ni}) => ti + ":" + ni));
  S.selNote = null; S.lassoAnno = null;
  if (typeof refreshSelInfo === "function") refreshSelInfo();
  draw();
  return S.multiSel.length;
}
export function invertEdit(u) { // the entry that would undo an applyU(u), captured NOW
  if (u.kind === "group") return {kind: "group", entries: u.entries.map(invertEdit).reverse()};
  if (u.kind === "trackRemove") return {kind: "trackInsert", ti: u.ti, track: S.song.tracks[u.ti],
    raw: S.song.rawNotes ? S.song.rawNotes[u.ti] : null, state: S.trackState[u.ti]};
  if (u.kind === "trackInsert") return {kind: "trackRemove", ti: u.ti};
  if (u.kind === "trackReorder") return {kind: "trackReorder", tracks: S.song.tracks.slice(), trackState: S.trackState.slice(), // current state, like anno/mod
    trackGains: S.trackGains.slice(), trackPanners: S.trackPanners.slice(), rawNotes: S.song.rawNotes ? S.song.rawNotes.slice() : null,
    selTrack: S.selTrack, selNote: S.selNote ? {ti: S.selNote.ti, ni: S.selNote.ni} : null, selClip: S.selClip ? {ti: S.selClip.ti, ci: S.selClip.ci} : null};
  if (u.kind === "mod") return {kind: "mod", items: u.items.map(({ti, ni}) => {
    const n = S.song.tracks[ti].notes[ni];
    return {ti, ni, t: n.t, d: n.d, p: n.p, v: n.v};
  })};
  if (u.kind === "addBatch") return {kind: "eraseBatch", items: u.items};
  if (u.kind === "eraseBatch") return {kind: "addBatch", items: u.items};
  if (u.kind === "anno") return {kind: "anno", json: annoSnapshot()}; // current state, like mod
  return {ti: u.ti, ni: u.ni, kind: u.kind === "add" ? "erase" : "add"};
}
export function editRedoPop() {
  const r = S.editRedo.pop();
  if (!r || !S.song) return;
  S.editUndo.push(invertEdit(r)); // plain push: redo must not clear its own stack
  applyEditEntry(r);
}
export function editUndoPop() {
  const u = S.editUndo.pop();
  if (!u || !S.song) return;
  S.editRedo.push(invertEdit(u));
  applyEditEntry(u);
}
export function applyEditEntry(u) {
  const setGone = (ti, ni, gone) => {
    const nn = S.song.tracks[ti] && S.song.tracks[ti].notes[ni];
    if (!nn) return;
    nn.gone = gone;
    if (S.song.rawNotes && nn.ri !== undefined && S.song.rawNotes[ti][nn.ri]) S.song.rawNotes[ti][nn.ri].gone = gone;
  };
  const applyU = v => {
    if (v.kind === "group") { for (let i = v.entries.length - 1; i >= 0; i--) applyU(v.entries[i]); }
    else if (v.kind === "mod") { // restore each note's prior time/duration/pitch
      for (const it of v.items) {
        const nn = S.song.tracks[it.ti] && S.song.tracks[it.ti].notes[it.ni];
        if (!nn) continue;
        nn.t = it.t; nn.d = it.d; nn.p = it.p;
        if (it.v !== undefined) nn.v = it.v;
        const rn = S.song.rawNotes && nn.ri !== undefined && S.song.rawNotes[it.ti][nn.ri];
        if (rn) { rn.t = it.t + S.chopS; rn.d = it.d; rn.p = it.p; if (it.v !== undefined) rn.v = it.v; }
      }
    } else if (v.kind === "anno") { // restore the whole annotation layer
      annoRestore(v.json);
      finalizeNotes();
      saveLocalNotes();
      pruneTombstones();
      if (S.viewMode === "score") buildScoreModel();
    } else if (v.kind === "trackInsert") { // put a deleted track back where it was
      S.song.tracks.splice(v.ti, 0, v.track);
      if (S.song.rawNotes) S.song.rawNotes.splice(v.ti, 0, v.raw || []);
      S.trackState.splice(v.ti, 0, v.state || {muted: false, solo: false});
      S.selTrack = v.ti;
      S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
      renderTrackbar(); updateTrackGains();
    } else if (v.kind === "trackRemove") {
      S.song.tracks.splice(v.ti, 1);
      if (S.song.rawNotes) S.song.rawNotes.splice(v.ti, 1);
      S.trackState.splice(v.ti, 1);
      S.selTrack = Math.max(0, Math.min(S.selTrack, S.song.tracks.length - 1));
      S.multiSel = []; S.multiSelKey = new Set(); S.selNote = null;
      renderTrackbar(); updateTrackGains();
    } else if (v.kind === "trackReorder") { // Mixer drag reorder: a full snapshot restore, not a re-derived move — see reorderTrack()
      S.song.tracks = v.tracks.slice();
      S.trackState = v.trackState.slice();
      S.trackGains = v.trackGains.slice();
      S.trackPanners = v.trackPanners.slice();
      if (v.rawNotes) S.song.rawNotes = v.rawNotes.slice();
      S.selTrack = v.selTrack;
      S.selNote = v.selNote ? {ti: v.selNote.ti, ni: v.selNote.ni} : null;
      S.selClip = v.selClip ? {ti: v.selClip.ti, ci: v.selClip.ci} : null;
      S.multiSel = []; S.multiSelKey = new Set();
      saveDraft(); // the track order is draft-only state; saveEdits() below drafts only compositions and local songs
      renderTrackbar(); renderMixer(); updateTrackGains();
    } else if (v.kind === "addBatch") { for (const it of v.items) setGone(it.ti, it.ni, true); }
    else if (v.kind === "eraseBatch") { for (const it of v.items) setGone(it.ti, it.ni, false); }
    else setGone(v.ti, v.ni, v.kind === "add"); // undo an add = remove it; undo an erase = restore it
  };
  applyU(u);
  saveEdits();
  computeSongEnd();
  if (S.viewMode === "score") buildScoreModel();
  draw();
}

export function initNoteEditor1() {
  renderOctBtn(); // boot: correct checkmark before any selection ever runs refreshSelInfo
  document.getElementById("octbtn").addEventListener("click", () => {
    S.selOctaves = !S.selOctaves;
    localStorage.setItem("ff1roll-seloct", S.selOctaves ? "1" : "0");
    refreshSelInfo();
  });
}

// (editOn is declared early, with the view state — the phone boot path calls
// renderViewMenu before this file's later sections ran; TDZ here bricked
// every iPhone: "Cannot access 'editOn' before initialization", 2026-08-23)
export function initNoteEditor2() {
  document.getElementById("accseg").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    S.pencilAcc = b.dataset.acc;
    for (const x of document.querySelectorAll("#accseg button")) {
      x.classList.toggle("active", x === b);
      x.setAttribute("aria-checked", String(x === b));
    }
  });
}

export function initNoteEditor3() {
  document.getElementById("modeseg").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    // tapping the active tool AGAIN turns it off (Josh: sometimes you just want
    // to drag the song around without accidentally moving a note)
    S.mode = b.dataset.mode === S.mode ? null : b.dataset.mode;
    for (const x of document.querySelectorAll("#modeseg button")) {
      x.classList.toggle("active", x.dataset.mode === S.mode);
      x.setAttribute("aria-checked", String(x.dataset.mode === S.mode));
    }
    // duration chips show in Select too: there they are the MOVE grid (T = triplet
    // steps), so changing it doesn't cost a trip through Pencil (Josh, 2026-09-12)
    document.getElementById("durseg").style.display = S.mode === "pencil" || S.mode === "select" ? "" : "none";
    // velocities show in Select too: with a selection they APPLY to it
    document.getElementById("velseg").style.display = S.mode === "pencil" || S.mode === "select" ? "" : "none";
    document.getElementById("accseg").style.display =
      S.mode === "pencil" && S.viewMode === "score" ? "" : "none";
    setInfo(S.mode === "pencil" ? (S.viewMode === "score" ? "pencil: tap a staff position — the stave picks the track"
                                                      : "pencil: tap grid to add to selected track") :
            S.mode === "erase" ? "erase: tap a note to remove" :
            S.mode === "select" ? "tap a note" : "pan: drag moves the view — notes are safe");
  });
  document.getElementById("durseg").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.grid) { openGridSheet(); return; } // the ▦N chip: the grid sheet, from either mode
    if (b.dataset.nv) S.pencilNV = parseInt(b.dataset.nv, 10);
    else if (b.dataset.mod) S.pencilMod = parseFloat(b.dataset.mod);
    else return;
    S.pencilDur = (4 / S.pencilNV) * S.pencilMod;
    syncDurSeg();
  });
  document.getElementById("clearbtn").addEventListener("click", () => {
    if (editsKey()) localStorage.removeItem(editsKey());
    loadSong(S.songKey).catch(e => setInfo(e.message));
  });
}

export function initNoteEditor4() {
  document.getElementById("ntype").addEventListener("change", applyEditorType);

  (function buildChordWidget() {
    const mkRow = (id, items) => {
      const row = document.getElementById(id);
      for (const [v, label] of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.v = v;
        b.textContent = label;
        row.appendChild(b);
      }
    };
    mkRow("nchordroot", "CDEFGAB".split("").map(l => [l, l]));
    mkRow("nchordacc", [["b", "♭"], ["", "♮"], ["#", "♯"]]);
    mkRow("nchordqual", CHORD_BASES.map(q => [q, q]));
    mkRow("nchordext", CHORD_EXTS.map(q => [q, q]));
    const bass = document.getElementById("nchordbass");
    const none = document.createElement("option");
    none.value = ""; none.textContent = "—";
    bass.appendChild(none);
    for (const s of BASS_SPELLINGS) {
      const o = document.createElement("option");
      o.value = s; o.textContent = s;
      bass.appendChild(o);
    }
    document.getElementById("nchordroot").addEventListener("click", e => {
      if (!e.target.dataset.v) return;
      chordSel.root = e.target.dataset.v;
      if (chordSel.base === null) { chordSel.base = "maj"; chordSel.exts = []; }
      refreshChordChips(); composeChord();
    });
    document.getElementById("nchordacc").addEventListener("click", e => {
      if (e.target.dataset.v === undefined) return;
      chordSel.acc = e.target.dataset.v;
      refreshChordChips(); composeChord();
    });
    document.getElementById("nchordqual").addEventListener("click", e => {
      if (!e.target.dataset.v) return;
      chordSel.base = e.target.dataset.v;
      if (chordSel.exts === null) chordSel.exts = [];
      refreshChordChips(); composeChord();
    });
    document.getElementById("nchordext").addEventListener("click", e => { // extensions STACK
      if (!e.target.dataset.v) return;
      if (chordSel.base === null) chordSel.base = "maj";
      const x = e.target.dataset.v, i = chordSel.exts.indexOf(x);
      if (i >= 0) chordSel.exts.splice(i, 1); else chordSel.exts.push(x);
      refreshChordChips(); composeChord();
    });
    bass.addEventListener("change", composeChord);
    const sym = document.getElementById("nchordsym");
    sym.addEventListener("input", () => { // follow hand-edits without rewriting them
      const m = parseChordSym(sym.value);
      chordSel.root = m ? m[1] : null;
      chordSel.acc = m ? m[2] : "";
      const q = m ? chordQualParse(m[3]) : null;
      chordSel.base = q ? q.base : null;
      chordSel.exts = q ? q.exts : [];
      if (m) bass.value = m[4] || "";
      refreshChordChips();
    });
    sym.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("nsave").click(); }
    });
  })();

    nmic.addEventListener("click", () =>
    micToggle(nmic, document.getElementById("ntext"), s2 => document.getElementById("nstatus").textContent = s2));

  document.getElementById("notebtn").addEventListener("click", () => {
    if (!S.song) return;
    // ALWAYS a new note (Josh, 2026-08-25). It used to reopen whatever
    // annotation the cursor sat on, so a note at 1.1 made the button
    // permanently un-add-able, with no way to tell whether Save would create or
    // overwrite. + Note adds; editing an existing one is a tap in ☰ Notes.
    openEditor(null);
  });
  document.getElementById("ncancel").addEventListener("click", () => { micStop(true); editor.classList.remove("on"); });
   document.getElementById("ntext").addEventListener("keydown", e => {
    // sections are one-line labels: Enter = save. Text notes keep Enter = newline
    if (e.key === "Enter" && editorType() === "section") {
      e.preventDefault();
      document.getElementById("nsave").click();
    }
  });
  document.getElementById("nsave").addEventListener("click", () => {
    // P4 (docs/annotations-v2.md): closes P3's known gap — every manual
    // annotation edit refuses on a locked (newer-than-this-app) song, same
    // message as the Ask tool's add/edit_annotation, instead of landing
    // in-memory/localStorage with no way to ever publish it
    if (S.rollnotesReadOnly) { document.getElementById("nstatus").textContent = S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; return; }
    micStop(true); // the text is read now; a late result would land in a closed editor
    const type = editorType();
    const text = document.getElementById("ntext").value.trim();
    if (type === "note" && !text) { document.getElementById("nstatus").textContent = "Note text is empty."; return; }
    const b1 = Math.max(1, +document.getElementById("nb1").value || 1);
    const q1 = Math.max(1, getBeatPair("nq1", "ns1"));
    const b2raw = +document.getElementById("nb2").value || 0;
    const q2raw = document.getElementById("nb2").value === "" ? 0 : getBeatPair("nq2", "ns2");
    if (S.editingNote) retireEdited(S.editingNote);
    let fresh;
    if (type === "key") {
      const [pcS, spS] = document.getElementById("nkeysel").value.split(":");
      const pc = +pcS, sp = spS || "";
      const mode = document.getElementById("nkeymode").value;
      dropLocalKeyAt(b1, q1); // anchor-level: only a key at this exact beat is replaced
      if (mode) {
        const full = keyNameFor(pc, mode);
        fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
                 text: "key: " + full.name, keydir: full.sf, cnote: text || undefined, added: true};
      } else { // tonic only: stored, not applied — asserted spelling if chosen
        const tonic = sp || tonicLabel(pc);
        fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
                 text: "key: " + tonic + "?", keypartial: tonic, cnote: text || undefined, added: true};
      }
    } else if (type === "tempo") {
      const bpm = Math.max(20, Math.min(400, +document.getElementById("ntempo").value || 120));
      fresh = {b1, q1, b2: null, q2: null, text: "tempo: " + bpm, tempodir: bpm, cnote: text || undefined, added: true};
    } else if (type === "timesig") {
      const num = +document.getElementById("ntsnum").value, den = +document.getElementById("ntsden").value;
      const oldTs = effTs();
      // bar length OR beat unit changing moves anchors (6/8 counts eighths)
      const tsChanged = num !== oldTs[0] || den !== oldTs[1];
      const others = S.rollnotes.filter(n => !n.tsdir).length;
      if (tsChanged && others > 0 && !S.rebarArmed) {
        S.rebarArmed = true; // big warning, second tap confirms
        document.getElementById("nstatus").textContent =
          "⚠ Re-bar from " + effTs()[0] + "/" + effTs()[1] + " to " + num + "/" + den + "? " +
          others + " annotation(s) will be converted to keep their musical positions. " +
          "Tap Save again to confirm (then Sync to make permanent).";
        return;
      }
      S.rebarArmed = false;
      if (tsChanged) convertAnchors(oldTs, [num, den]);
      S.rollnotes = S.rollnotes.filter(n => !(n.tsdir)); // one meter per song
      fresh = {b1: tsChanged ? 1 : b1, q1: tsChanged ? 1 : q1, b2: null, q2: null,
               text: "timesig: " + num + "/" + den, tsdir: [num, den], cnote: text || undefined, added: true};
    } else if (type === "loop") {
      const lb = Math.max(1, +document.getElementById("nlb").value || 1);
      const lq = getBeatPair("nlq", "nls");
      // one loop point per song: a new one replaces any local one
      S.rollnotes = S.rollnotes.filter(n => !(n.added && n.loopTo !== undefined));
      fresh = {b1, q1, b2: null, q2: null, text: "loop: " + lb + "." + lq, cnote: text || undefined, added: true};
    } else if (type === "chop") {
      const cmode = document.getElementById("nchopmode").value;
      const dispTick = (b1 - 1) * barTicks() + (q1 - 1) * beatTicks();
      const raw = dispTick + S.chopS; // fields are displayed coords; the directive stores raw
      const newS = cmode === "start" ? raw : S.chopS;
      const delta = S.chopS - newS;
      const others = S.rollnotes.filter(n => !n.chopdir).length;
      if (cmode === "start" && delta !== 0 && others > 0 && !S.rebarArmed) {
        S.rebarArmed = true;
        document.getElementById("nstatus").textContent =
          "⚠ Chop the song start here? Bars renumber and " + others +
          " annotation(s) shift to keep their musical positions. Tap Save again to confirm.";
        return;
      }
      S.rebarArmed = false;
      if (cmode === "start" && delta !== 0) shiftAnchors(delta);
      S.rollnotes = S.rollnotes.filter(n => n.chopdir !== cmode); // one chop per side
      const cbt = barTicks();
      fresh = {b1: Math.floor(raw / cbt) + 1, q1: snapBeat((raw % cbt) / beatTicks() + 1),
               b2: null, q2: null, text: "chop: " + cmode, added: true};
    } else if (type === "chord") {
      const sym = document.getElementById("nchordsym").value.trim();
      if (!sym) { document.getElementById("nstatus").textContent = "Chord symbol is empty — tap chips or type one."; return; }
      localStorage.setItem("ff1roll-dragtype", "chord");
      fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
               text: sym, chord: true, cnote: text || undefined, added: true};
    } else if (type === "section") {
      const label = document.getElementById("nsectlabel").value.trim();
      if (!label) { document.getElementById("nstatus").textContent = "Section label is empty."; return; }
      localStorage.setItem("ff1roll-dragtype", "section");
      fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null,
               text: label, section: true, added: true,
               cnote: text || undefined};
    } else {
      fresh = {b1, q1, b2: b2raw || null, q2: b2raw ? (q2raw || null) : null, text, added: true};
    }
    dropSupersededBy(fresh);
    S.rollnotes.push(resolveNote(fresh));
    S.rangeSel = null;
    finalizeNotes();
    saveLocalNotes();
    buildScoreModel(); // annotations can change signatures/spelling
    clampView();
    S.lastSubtitle = undefined;
    updateSubtitle();
    editor.classList.remove("on");
    draw();
  });
  document.getElementById("ndelete").addEventListener("click", () => {
    // P4 (docs/annotations-v2.md): closes P3's known gap — see #nsave's own guard
    if (S.rollnotesReadOnly) { document.getElementById("nstatus").textContent = S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; return; }
    // deleting the meter directive re-bars back to neutral 4/4 — same two-tap
    // warning + anchor conversion as declaring one, never a silent move
    if (S.editingNote && S.editingNote.tsdir) {
      const oldTs = effTs(), others = S.rollnotes.filter(n => !n.tsdir).length;
      const tsChanged = oldTs[0] !== 4 || oldTs[1] !== 4;
      if (tsChanged && others > 0 && !S.rebarArmed) {
        S.rebarArmed = true;
        document.getElementById("nstatus").textContent =
          "⚠ Removing the meter re-bars back to neutral 4/4. " + others +
          " annotation(s) will be converted to keep their musical positions. Tap Delete again to confirm.";
        return;
      }
      S.rebarArmed = false;
      if (tsChanged) convertAnchors(oldTs, [4, 4]);
    }
    // removing a start chop restores hidden bars: annotations shift right to stay
    // glued to their music, with the same two-tap warning as re-barring
    if (S.editingNote && S.editingNote.chopdir === "start" && S.chopS) {
      const others = S.rollnotes.filter(n => !n.chopdir).length;
      if (others > 0 && !S.rebarArmed) {
        S.rebarArmed = true;
        document.getElementById("nstatus").textContent =
          "⚠ Removing the start chop restores the hidden bars; " + others +
          " annotation(s) will shift to keep their musical positions. Tap Delete again to confirm.";
        return;
      }
      S.rebarArmed = false;
      shiftAnchors(S.chopS);
    }
    tombstone(S.editingNote); // synced notes need the deletion to survive a reload
    S.rollnotes = S.rollnotes.filter(n => n !== S.editingNote);
    finalizeNotes();
    saveLocalNotes();
    buildScoreModel();
    clampView();
    S.lastSubtitle = undefined;
    updateSubtitle();
    editor.classList.remove("on");
    draw();
  });
}

export function initNoteEditor5() {
  { // velocity slider: pencil loudness always; with a selection it LIVE-adjusts
    // those notes while dragging and commits ONE undo step on release
    const slider = document.getElementById("velslider"), val = document.getElementById("velval");
    let velSnap = null; // pre-gesture values for the undo entry
    slider.addEventListener("input", () => {
      const v = parseInt(slider.value, 10);
      val.textContent = v;
      S.pencilVel = v;
      if (S.mode !== "select" || !editableSong()) return;
      const items = selEditItems();
      if (!items.length) return;
      if (!velSnap) velSnap = items.map(({ti, ni, n}) => ({ti, ni, t: n.t, d: n.d, p: n.p, v: n.v}));
      for (const it of items) it.n.v = v;
      draw(); // brightness tracks the drag
    });
    slider.addEventListener("change", () => {
      if (!velSnap) return;
      const items = selEditItems();
      if (items.length) {
        selEditApply(items, () => {}, velSnap);
        setInfo("set " + items.length + " note" + (items.length === 1 ? "" : "s") + " to velocity " + slider.value);
      }
      velSnap = null;
    });
  }
  document.getElementById("copybtn").addEventListener("click", () => {
    const k = copySelection();
    if (!k) { setInfo("nothing selected — lasso or tap notes first"); return; }
    setInfo("copied " + clipSummary() + " — move the cursor anywhere, Paste puts them there");
    updateEditButtons();
  });
}

export function initNoteEditor6() {
  document.getElementById("octupbtn").addEventListener("click", () => {
    if (nudgeSelection(0, 12)) setInfo("selection up an octave (undo undoes)");
    else setInfo("nothing selected — lasso or tap notes first");
  });
  document.getElementById("octdownbtn").addEventListener("click", () => {
    if (nudgeSelection(0, -12)) setInfo("selection down an octave (undo undoes)");
    else setInfo("nothing selected — lasso or tap notes first");
  });
  // ⋯ folds the less-used tools (Josh, 2026-08-22: pencil mode wrapped the row)
  {
    const wrap2 = document.getElementById("morewrap");
    const open = localStorage.getItem("ff1roll-editmore") === "1";
    wrap2.style.display = open ? "inline-flex" : "none";
    document.getElementById("morebtn").classList.toggle("active", open);
    document.getElementById("morebtn").addEventListener("click", () => {
      const on = wrap2.style.display === "none";
      wrap2.style.display = on ? "inline-flex" : "none";
      document.getElementById("morebtn").classList.toggle("active", on);
      localStorage.setItem("ff1roll-editmore", on ? "1" : "0");
    });
  }
  document.getElementById("trbtn").addEventListener("click", () => {
    if (!selEditItems().length) { setInfo("select notes first — then ⇅ transposes them"); return; }
    const row = document.getElementById("trchips");
    if (!row.children.length) {
      const mk = (label, fn) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = "flex:1;min-height:44px";
        b.addEventListener("click", fn);
        row.appendChild(b);
      };
      mk("−2", () => nudgeSelection(0, -2) && setInfo("down a whole step (chromatic)"));
      mk("−1", () => nudgeSelection(0, -1) && setInfo("down a half step"));
      mk("+1", () => nudgeSelection(0, 1) && setInfo("up a half step"));
      mk("+2", () => nudgeSelection(0, 2) && setInfo("up a whole step (chromatic)"));
      mk("in key ▼", () => diatonicShift(-1) && setInfo("down one scale degree — still in key"));
      mk("in key ▲", () => diatonicShift(1) && setInfo("up one scale degree — still in key"));
      mk("▼ 8va", () => nudgeSelection(0, -12) && setInfo("down an octave"));
      mk("▲ 8va", () => nudgeSelection(0, 12) && setInfo("up an octave"));
    }
    document.getElementById("trsheet").classList.add("on");
  });
  document.getElementById("divbtn").addEventListener("click", () => {
    if (!selEditItems().length) { setInfo("select notes first — then ➗ divides each into equal parts"); return; }
    const row = document.getElementById("divchips");
    if (!row.children.length) {
      for (const n of [2, 3, 4, 5, 6, 7]) {
        const b = document.createElement("button");
        b.textContent = String(n);
        b.style.cssText = "flex:1;min-height:44px;font-size:1.0625rem";
        b.addEventListener("click", () => {
          const k = divideSelection(n);
          document.getElementById("divsheet").classList.remove("on");
          setInfo(k ? "divided " + k + " note" + (k === 1 ? "" : "s") + " into " + n + " (one undo undoes)"
                    : "those notes are too short to divide by " + n);
        });
        row.appendChild(b);
      }
    }
    document.getElementById("divsheet").classList.add("on");
  });
  document.getElementById("quantbtn").addEventListener("click", () => {
    if (!selEditItems().length) { setInfo("select notes first — then Q quantizes them to the grid"); return; }
    const row = document.getElementById("quantchips");
    if (!row.children.length) {
      for (const pct of [100, 75, 50]) {
        const b = document.createElement("button");
        b.textContent = pct + "%";
        b.style.cssText = "flex:1;min-height:44px;font-size:1.0625rem";
        b.addEventListener("click", () => {
          const alsoEnds = document.getElementById("quantends").checked;
          const k = quantizeSelection(pct / 100, alsoEnds);
          document.getElementById("quantsheet").classList.remove("on");
          setInfo(k ? "quantized " + k + " note" + (k === 1 ? "" : "s") + " at " + pct + "% (one undo undoes)"
                    : "nothing to quantize");
        });
        row.appendChild(b);
      }
    }
    document.getElementById("quantsheet").classList.add("on");
  });
  document.getElementById("cutbtn").addEventListener("click", () => {
    const k = cutSelection();
    if (!k) { setInfo("nothing selected — lasso or tap notes first"); return; }
    setInfo("cut " + clipSummary() + " — Paste puts them at the cursor (undo restores)");
  });
  document.getElementById("splitbtn").addEventListener("click", () => {
    if (S.selClip && !S.multiSel.length && editableSong()) { splitSelectedClipAtCursor(); return; } // a selected audio piece splits like a note would
    let k = splitSelectionAt(S.playCursor), how = "at the cursor";
    if (!k) { k = splitSelectionHalves(); how = "in half"; }
    setInfo(k ? "split " + k + " note" + (k === 1 ? "" : "s") + " " + how
              : "select notes first — cursor inside splits there, otherwise each splits in half");
  });
  document.getElementById("joinbtn").addEventListener("click", () => {
    const k = joinSelection();
    setInfo(k ? "joined " + k + " notes"
              : "select two or more notes on the same pitch first");
  });
  document.getElementById("delbtn").addEventListener("click", () => {
    const k = deleteSelection();
    setInfo(k ? "deleted " + k + " note" + (k === 1 ? "" : "s") + " (undo restores them)"
              : "nothing selected — lasso or tap notes first");
  });
   document.getElementById("undobtn").addEventListener("click", editUndoPop);
  document.getElementById("redobtn").addEventListener("click", editRedoPop);
  // keyboard editing — every drag gesture has a key equivalent (easier on the
  // hands): arrows move, shift = octave, alt+arrows resize, cmd-c/v copy/paste
  // at the playhead, delete removes. Ignored while typing in a field.
  document.addEventListener("keydown", e => {
    if (!S.song || !editableSong()) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const grid = moveSnapTicks(); // 16ths, or triplet steps while a T duration is active
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); saveVersion(); return; }
    if (meta && e.key.toLowerCase() === "c") {
      const k = copySelection();
      if (k) { setInfo("copied " + clipSummary() + " — ⌘V pastes at the playhead"); e.preventDefault(); }
      return;
    }
    if (meta && e.key.toLowerCase() === "v") {
      const k = pasteClipboard(S.playCursor);
      if (k) { setInfo("pasted " + clipSummary() + " (selected — arrows move them; cursor at their end, ⌘V again chains)"); e.preventDefault(); }
      return;
    }
    if (meta && e.key.toLowerCase() === "z") { // ⌘Z / ⇧⌘Z (Josh, 2026-09-12: ⌘Z did nothing on his Mac)
      if (e.shiftKey) editRedoPop(); else editUndoPop();
      e.preventDefault();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") { editRedoPop(); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === "a") { const k = selectAllNotes(); setInfo(k + " notes selected"); e.preventDefault(); return; }
    if (meta && e.key.toLowerCase() === "x") { // cut = copy, then delete — one ⌘Z brings the notes back
      if (copySelection()) { const s = clipSummary(); deleteSelection(); setInfo("cut " + s + " — ⌘V pastes at the playhead"); e.preventDefault(); }
      return;
    }
    if (meta && e.key.toLowerCase() === "d") { if (duplicateSelection()) setInfo("duplicated — ⌘D again repeats it"); e.preventDefault(); return; }
    if (meta) return; // don't eat browser shortcuts
    if (e.key === "Backspace" || e.key === "Delete") {
      if (deleteSelection()) e.preventDefault();
      return;
    }
    if (!selEditItems().length) return;
    let did = false;
    if (e.key === "ArrowUp") did = nudgeSelection(0, e.shiftKey ? 12 : 1);
    else if (e.key === "ArrowDown") did = nudgeSelection(0, e.shiftKey ? -12 : -1);
    else if (e.key === "ArrowLeft") did = e.altKey ? resizeSelection(-grid) : nudgeSelection(-grid, 0);
    else if (e.key === "ArrowRight") did = e.altKey ? resizeSelection(grid) : nudgeSelection(grid, 0);
    if (did) e.preventDefault();
  });
}
