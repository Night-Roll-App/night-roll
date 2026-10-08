import { S, prof } from "../state.js";
import { setAnchorBQ } from "../hooks.js";
import { resolveNote } from "../model/rollnotes.js";
import { visibleNotes } from "../model/rollnotes.js";
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
import { lockedAnnoSong } from "../model/song.js";
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
import { pushUndo } from "../model/edits.js";
import { annoRestore } from "../model/rollnotes.js";
import { putSongNote } from "../model/rollnotes.js";
import { SONGNOTE_KINDS } from "../model/rollnotes.js";
import { songNoteKind } from "../model/rollnotes.js";
import { songNoteKindInfo } from "../model/rollnotes.js";
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
import { shapeSnap } from "../model/noteshape.js";
import { shapeRestore } from "../model/noteshape.js";
import { setSelectionShape } from "../model/noteshape.js";
import { SHAPE_ROOM_V } from "../model/noteshape.js";
import { SHAPE_PRESETS } from "../model/noteshape.js";
import { askUndoDescribe } from "../ask/actions.js";
import { noteIdentity } from "../model/edits.js";
import { setControl } from "./controls.js";
import { wmWhereIs } from "./wm.js";
import { wmCloseWindow } from "./wm.js";
import { wmAllowed } from "./wm.js";
import { wmInnerWidth } from "./wm.js";
import { wmLayoutAll } from "./wm.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { showRulerHl } from "./chrome.js";
import { softFocus } from "./chrome.js";
import { canvas } from "../render/roll.js";
import { pxPerTick } from "../render/roll.js";

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
  mkBars("nb1", false, true); mkBars("nb2", true, true); mkBars("nlb", false);
  mkBeats("nq1"); mkBeats("nq2"); mkBeats("nlq");
  mkSubs("ns1"); mkSubs("ns2"); mkSubs("nls");
}
export function editorType() { return document.getElementById("ntype").value; }
// the type as a row of chips, not a drop-down (Josh, 2026-10-06, #152/#153);
// the hidden <select> stays the one source of truth every other path reads
export const NTYPE_CHIPS = [["note", "Note"], ["section", "Section"], ["chord", "Chord"], ["key", "Key"],
  ["timesig", "Meter"], ["loop", "Loop"], ["tempo", "Tempo"], ["chop", "Chop"], ["song", "Song"]]; // song = a titled song note, not tied to a bar (model/rollnotes.js putSongNote) — never guessed
export function renderTypeChips() {
  const row = document.getElementById("ntypechips"), t = editorType();
  if (!row.children.length) for (const [v, label] of NTYPE_CHIPS) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.v = v; b.textContent = label; b.setAttribute("role", "radio");
    row.appendChild(b);
  }
  for (const b of row.children) { b.classList.toggle("active", b.dataset.v === t); b.setAttribute("aria-checked", String(b.dataset.v === t)); }
}
// a song note's kind (Josh, Terminal #225): one tap, no keyboard. The row's
// data-v is the one source of truth; a kind from a newer build that this
// one doesn't list shows as an extra chip so Save keeps it.
export function editorSongKind() { return document.getElementById("nsongkinds").dataset.v || "general"; }
export function setEditorSongKind(kind) {
  const row = document.getElementById("nsongkinds"), id = songNoteKindInfo(kind).id;
  row.dataset.v = id;
  row.textContent = "";
  const kinds = SONGNOTE_KINDS.some(k => k.id === id) ? SONGNOTE_KINDS : SONGNOTE_KINDS.concat([songNoteKindInfo(id)]);
  for (const k of kinds) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.v = k.id; b.setAttribute("role", "radio");
    b.textContent = (k.glyph ? k.glyph + " " : "") + k.label;
    b.classList.toggle("active", k.id === id); b.setAttribute("aria-checked", String(k.id === id));
    row.appendChild(b);
  }
}
export function pickEditorType(v) {
  S.ntypePicked = true;
  const g = S.ntypeGuess;
  if (g) { clearTimeout(g.timer); if (v === "note" && g.from && !document.getElementById("ntext").value.trim()) document.getElementById("ntext").value = g.from; } // back to Note: the words come back
  S.ntypeGuess = null;
  document.getElementById("ntype").value = v;
  applyEditorType();
  if (editorDocked()) { // docked: no field ever takes focus (Josh #250); a pick before/while drafting carries to the next new entry
    if (S.edFollow.mode === "idle" || S.edFollow.mode === "new") S.edFollow.prePick = v;
    return;
  }
  // Section: the label is what he types first, and usually all (Josh #227) — the cursor goes there, not the text box
  if (v === "section") softFocus(document.getElementById("nsectlabel"));
}
// what the typed words look like — only the WHOLE text, only these four
// shapes; anything else stays a note. Reads his own words, never the music.
export function guessNoteType(text) {
  const t = (text || "").trim();
  if (!t || t.includes("\n")) return null;
  let m = t.match(/^loop\s*(?:to\s*)?(\d{1,3})(?:\.(\d+(?:\.\d+)?))?$/i);
  if (m) return {type: "loop", bar: +m[1], beat: m[2] ? +m[2] : 1};
  m = t.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (m && [2, 4, 8, 16].includes(+m[2]) && [2, 3, 4, 5, 6, 7, 9, 12].includes(+m[1])) return {type: "timesig", num: +m[1], den: +m[2]};
  m = t.match(/^(\d{2,3})\s*bpm$/i);
  if (m && +m[1] >= 20 && +m[1] <= 400) return {type: "tempo", bpm: +m[1]};
  m = parseChordSym(t);
  if (m && chordQualParse(m[3]) !== null) return {type: "chord", sym: t};
  return null;
}
export function applyNoteTypeGuess() {
  if (S.ntypePicked || editorType() !== "note") return;
  const box = document.getElementById("ntext"), text = box.value, g = guessNoteType(text);
  if (!g) return;
  if (g.type === "chord") setChordWidget(g.sym);
  if (g.type === "timesig") { document.getElementById("ntsnum").value = String(g.num); document.getElementById("ntsden").value = String(g.den); }
  if (g.type === "tempo") document.getElementById("ntempo").value = String(g.bpm);
  if (g.type === "loop") { document.getElementById("nlb").value = String(g.bar); setBeatPair("nlq", "nls", g.beat); }
  box.value = "";
  S.ntypeGuess = {timer: 0, from: text};
  document.getElementById("ntype").value = g.type;
  applyEditorType();
  setInfo("type: " + NTYPE_CHIPS.find(c => c[0] === g.type)[1] + " — from what you typed; tap Note to undo");
}
export function applyEditorType() {
  const t = editorType();
  renderTypeChips();
  document.getElementById("ntext").style.display = ""; // every authored type carries a note (Josh, 2026-08-22)
  document.getElementById("nsectrow").style.display = t === "section" ? "" : "none";
  document.getElementById("nkeyrow").style.display = t === "key" ? "" : "none";
  document.getElementById("nchordbox").style.display = t === "chord" ? "" : "none";
  document.getElementById("ntsrow").style.display = t === "timesig" ? "" : "none";
  document.getElementById("ntemporow").style.display = t === "tempo" ? "" : "none";
  document.getElementById("nlooprow").style.display = t === "loop" ? "" : "none";
  document.getElementById("nchoprow").style.display = t === "chop" ? "" : "none";
  document.getElementById("ntorow").style.display = t === "loop" || t === "timesig" || t === "chop" || t === "tempo" || t === "song" ? "none" : "";
  document.getElementById("nfromrow").style.display = t === "song" ? "none" : ""; // a song note has no bar
  document.getElementById("nsongrow").style.display = t === "song" ? "" : "none";
  document.getElementById("nsongkindrow").style.display = t === "song" ? "" : "none";
  document.getElementById("nmic").style.display =
    SPEECH && t !== "key" && t !== "loop" && t !== "timesig" && t !== "chop" && t !== "tempo" ? "" : "none"; // dictation targets the text box
  document.getElementById("ntext").placeholder =
    t === "note" ? "What's happening at this beat?"
    : t === "song" ? "The idea, in your words — a rule you found, a couple of example bars…"
                 : "Optional note about this " + (t === "timesig" ? "meter" : t) + " (✱ in the ruler)";
  document.getElementById("nstatus").textContent =
    t === "key" ? "To bar '—' = until further notice; set it to make a temporary key that reverts after." :
    t === "chord" ? "Tap chips or type the symbol. Standard: bare root = major (C), m = minor (Gm), /X = bass note (G7/B)." :
    t === "song" ? "A song note is about the whole song, not one bar: it lists under SONG NOTES in ☰ All notes and the Analysis sheet." :
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
  // docked, every way in (+ Note, a ☰ Notes row, a flag, the LCD) loads into
  // the docked window and never focuses a field (plan R11/R18; Josh #250)
  if (editorDocked()) { editorDockedOpen({kind: "open", note: note || null, presetType, opts}); return; }
  const type = editorFill(note, presetType, opts);
  editorRender();
  editor.classList.add("on");
  if (!note && S.rangeSel) setTimeout(() =>
    softFocus(document.getElementById(type === "chord" ? "nchordsym" : "ntext")), 50);
  // the text box gets focus only for a NEW text note, where typing is the
  // next thing — opening an existing one (any kind) must not raise the iPad
  // keyboard over half the screen (Josh, 2026-10-03); and only where focus
  // raises no keyboard unasked (softFocus, Josh #251)
  if (type === "note" && !note) softFocus(document.getElementById("ntext"));
  else if (type === "section" && !note) softFocus(document.getElementById("nsectlabel")); // a new section starts with its label (Josh #227)
  else if (type === "song" && !note) softFocus(document.getElementById("nsongtitle")); // a new song note starts with its title
  else if (document.activeElement && editor.contains(document.activeElement)) document.activeElement.blur();
}
// fills every field for `note` (or a new entry); never shows the window and
// never focuses a field — openEditor (floating) and the docked follow mode
// each decide that for themselves. Returns the type it filled.
export function editorFill(note, presetType, opts) {
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
    if (S.rangeSel.b > S.rangeSel.a) { // the span's own end, to the 16th — a 16th-long chord stays a 16th (Josh #154)
      b2 = Math.floor(S.rangeSel.b / bt) + 1;
      q2 = snapBeat((S.rangeSel.b % bt) / beatTicks() + 1);
    }
  }
  const type = note ? (note.songnote ? "song" : note.chord ? "chord" : note.section ? "section"
                       : note.keydir !== undefined || note.keypartial ? "key"
                       : note.tsdir ? "timesig" : note.tempodir !== undefined ? "tempo" : note.chopdir ? "chop"
                       : note.loopTo !== undefined ? "loop" : "note")
             : presetType ? presetType // a group's + button pre-picks its type
             // a drag before + Note means "label this span" — as whichever of
             // section/chord was dragged last (chord runs stay in chord mode)
             // more than two bars is a section, not a chord (Josh, 2026-10-06, #160:
             // 22 bars opened as a chord); shorter spans keep the last-dragged type
             : S.rangeSel ? (S.rangeSel.b - S.rangeSel.a > 2 * barTicks() ? "section" : (localStorage.getItem("ff1roll-dragtype") || "section"))
             : "note";
  document.getElementById("ntype").value = type;
  if (S.ntypeGuess) clearTimeout(S.ntypeGuess.timer);
  S.ntypeGuess = null;
  S.ntypePicked = !!(note || presetType || S.rangeSel); // only a fresh plain + Note guesses from the words
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
  if (type === "loop" && note) {
    const lbt = barTicks();
    document.getElementById("nlb").value = String(Math.floor(note.loopTo / lbt) + 1);
    setBeatPair("nlq", "nls", (note.loopTo % lbt) / beatTicks() + 1);
  }
  document.getElementById("nb1").value = String(note ? note.b1 : b1);
  setBeatPair("nq1", "ns1", note ? note.q1 : q1);
  // the second row is where the span ENDS (Josh, 2026-10-06, #154/#156): the
  // file still stores "through" (to: [bar, beats-from-the-bar's-start]); only
  // this row shows and reads it as an end position, so every existing
  // annotation keeps its exact span and anything down to a 16th can be written
  if (note && note.b2 && note.end !== null && note.end !== undefined) { b2 = Math.floor(note.end / bt) + 1; q2 = snapBeat((note.end % bt) / beatTicks() + 1); }
  else if (note) { b2 = ""; q2 = ""; }
  document.getElementById("nb2").value = b2 ? String(b2) : "";
  setBeatPair("nq2", "ns2", q2 || 1);
  if (type === "chop" && note) {
    // show the cut in DISPLAYED coordinates (start chop = the current bar 1),
    // overriding the raw-space b1/q1 the directive itself stores
    document.getElementById("nchopmode").value = note.chopdir;
    const dt = note.chopdir === "start" ? 0 : Math.max(0, (S.chopE !== null ? S.chopE : 0) - S.chopS);
    document.getElementById("nb1").value = String(Math.floor(dt / barTicks()) + 1);
    setBeatPair("nq1", "ns1", (dt % barTicks()) / beatTicks() + 1);
  }
  document.getElementById("ntext").value =
    ["chord", "key", "tempo", "timesig", "loop", "section", "chop", "song"].includes(type)
      ? (note && note.cnote || "")
      : note ? note.text : "";
  document.getElementById("nsectlabel").value = type === "section" && note ? note.text : "";
  document.getElementById("nsongtitle").value = type === "song" && note && note.songnote ? note.songnote.title : "";
  setEditorSongKind(note && note.songnote ? songNoteKind(note) : opts && opts.songKind || "general"); // opts.songKind: "+ question" opens a new one already marked
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
  return type;
}
export function updateEditButtons() { // disabled = "this can't do anything right now"
  const locked = lockedAnnoSong(); // notes locked: Copy/Paste carry annotations only, so lassoed notes don't enable them
  const sel = S.song && !locked ? selEditItems().length : 0;
  const annos = S.song && S.lassoAnno ? lassoedAnnos().length : 0;
  const piece = !!(S.song && S.selClip && selClipObj()); // a selected audio piece splits too
  // #lockclip: the locked song's Undo/Redo/Copy/Paste, out in the footer only
  // while there is something for them to do (Lasso on, or annotations copied) —
  // the captures keep their bare footer otherwise (no edit row there, 2026-08-15)
  const clipOut = locked && (S.lassoMode || S.annoClipboard.length > 0);
  const st = [!S.editUndo.length, !S.editRedo.length, !sel, locked ? !S.annoClipboard.length : !clipboardHas(), !(sel || annos), !(sel || piece), clipOut];
  const key = st.join("|");
  if (key === S.editBtnCache) return;
  S.editBtnCache = key;
  const lc = document.getElementById("lockclip");
  if (lc && lc.classList) lc.classList.toggle("on", clipOut);
  const set = (id, off) => { const b = document.getElementById(id); if (b) b.disabled = off; };
  set("undobtn", st[0]); set("emUndo", st[0]); set("nmUndo", st[0]); // nm* = the hold-still note menu (DAW F2), same states
  set("redobtn", st[1]); set("emRedo", st[1]); set("nmRedo", st[1]);
  set("splitbtn", st[5]); set("emSplit", st[5]); set("nmSplit", st[5]);
  for (const id of ["joinbtn", "emJoin", "movebtn", "emMove",
                    "divbtn", "emDivide", "trbtn", "emTranspose", "shapebtn", "emShape",
                    "quantbtn", "emQuantize", "nmQuant", "nmDup"]) set(id, st[2]);
  for (const id of ["copybtn", "emDup", "cutbtn", "emCut", "delbtn", "emDelete", "nmCopy", "nmCut", "nmDelete"]) set(id, st[4]); // these also act on lasso'd annotations, notes or not
  set("pastebtn", st[3]); set("emPaste", st[3]); set("emPasteTo", st[3]); set("nmPaste", st[3]);
}
updateEditButtons = prof("updateEditButtons", updateEditButtons); // ?perf=1 attribution (docs/split-plan.md §2.4) — see state.js's prof()

export function setAnchorBQImpl(n, tick) { // start anchor from a tick
  const bt = barTicks(), qt = beatTicks(), t = Math.max(0, tick);
  n.b1 = Math.floor(t / bt) + 1;
  n.q1 = snapBeat((t % bt) / qt + 1);
}
export function lassoedAnnosImpl() { return S.lassoAnno ? visibleNotes().filter(n => annoInLasso(n, S.lassoAnno)) : []; } // visibleNotes: the lasso acts only on what is shown (Learning hides ✦ AI estimates)

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
    const o = {ti, ni, t: n.t, d: n.d, p: n.p, v: n.v};
    if (u.items.some(x => "env" in x)) Object.assign(o, shapeSnap(n)); // a shape edit's redo restores the shape too
    return o;
  })};
  if (u.kind === "addBatch") return {kind: "eraseBatch", items: u.items};
  if (u.kind === "eraseBatch") return {kind: "addBatch", items: u.items};
  if (u.kind === "anno") return Object.assign({}, u, {json: annoSnapshot()}); // current state, like mod — its what/at label rides along
  return {ti: u.ti, ni: u.ni, kind: u.kind === "add" ? "erase" : "add"};
}
export function editRedoPop() {
  const r = S.editRedo.pop();
  if (!r || !S.song) return;
  S.editUndo.push(invertEdit(r)); // plain push: redo must not clear its own stack
  applyEditEntry(r);
  revealEdit(r, "redid");
  if (r.kind === "anno") editorAfterUndo();
}
export function editUndoPop() {
  const u = S.editUndo.pop();
  if (!u || !S.song) return;
  S.editRedo.push(invertEdit(u));
  applyEditEntry(u);
  revealEdit(u, "undid");
  if (u.kind === "anno") editorAfterUndo();
}
// An annotation undo step names what it holds and where (Josh, Terminal #247:
// undoing "a few times" must never silently take a text note he can't see).
export function annoLabel(n) {
  const bars = n.songnote ? "" : " · bar " + n.b1 + (n.b2 && n.b2 !== n.b1 ? "–" + n.b2 : "");
  const word = n.songnote ? "song note \u201c" + n.songnote.title + "\u201d"
    : n.chord ? "chord " + n.text : n.section ? "section " + n.text
    : n.keydir !== undefined || n.keypartial || n.tsdir || n.tempodir !== undefined || n.chopdir || /^loop:/.test(n.text || "") ? n.text
    : "note \u201c" + String(n.text || "").split("\n")[0].slice(0, 30) + "\u201d";
  return word + bars;
}
export function annoUndoEntry(before, n, how) { // how: saved | edited | deleted | resized
  const e = {kind: "anno", json: before};
  if (!n) return e;
  e.what = how === "deleted" ? "deleted " + annoLabel(n) : annoLabel(n) + " (" + how + ")";
  if (!n.songnote && typeof n.start === "number") e.at = {a: n.start, b: typeof n.end === "number" && n.end > n.start ? n.end : n.start + beatTicks()};
  return e;
}
// after an undo/redo: the status line says what changed, an off-screen
// change scrolls into view, and an annotation's span flashes in the ruler
export function revealEdit(e, verb) {
  if (!e || !S.song) return;
  setInfo(verb + ": " + askUndoDescribe(e, verb === "redid"));
  let at = e.kind === "anno" ? e.at || null : null;
  if (!at && e.kind !== "anno") {
    const ticks = [], walk = v => {
      if (!v) return;
      if (v.kind === "group") { (v.entries || []).forEach(walk); return; }
      for (const it of v.items || [v]) { const nn = S.song.tracks[it.ti] && S.song.tracks[it.ti].notes[it.ni]; if (nn) ticks.push(nn.t); }
    };
    walk(e);
    if (ticks.length) at = {a: Math.min(...ticks), b: Math.max(...ticks)};
  }
  if (!at) return;
  if (S.viewMode !== "score") {
    const x = at.a * pxPerTick(), W = ((canvas && canvas.clientWidth) || 800) - (S.RULER_W || 0);
    if (x < S.view.x || x > S.view.x + W) { S.view.x = Math.max(0, x - W * 0.3); S.followFree = true; clampView(); }
  }
  if (e.kind === "anno") {
    S.annoFlash = {a: at.a, b: at.b, until: Date.now() + 1200};
    setTimeout(() => { S.annoFlash = null; draw(); }, 1250);
  }
  draw();
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
        if ("env" in it) { shapeRestore(nn, it); if (rn) shapeRestore(rn, it); } // a shape edit's snapshot (src/model/noteshape.js)
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

// Save/Delete around their bodies: ONE undo step each, for every annotation
// type (R10, docs/plans/2026-10-07-docked-annotation-window.md). A refused
// Save (empty symbol, the re-bar warning's first tap) writes nothing — the
// annotation it had already lifted out for replacement goes back.
export function editorSaveRun(body) {
  if (S.rollnotesReadOnly) { body(); return null; } // the body says why
  const before = annoSnapshot(), retired = S.editingNote, idx = retired ? S.rollnotes.indexOf(retired) : -1, type = editorType();
  let made;
  S.edFollow.busy = true; // finalizeNotes runs mid-save: the follow hook must not read the half-written layer
  try { made = body(); } finally { S.edFollow.busy = false; }
  if (!made) {
    if (retired && idx >= 0 && !S.rollnotes.includes(retired)) { S.rollnotes.splice(Math.min(idx, S.rollnotes.length), 0, retired); pruneTombstones(); finalizeNotes(); saveLocalNotes(); }
    return null;
  }
  pushUndo(annoUndoEntry(before, made, retired ? "edited" : "saved"));
  S.editingNote = null;
  if (editorDocked()) { // R5: the window stays, the span stays, the next drag replaces it
    const f = S.edFollow, next = f.pending;
    f.lastSaved = type; f.prePick = null;
    const msg = "Saved " + editorShortLabel(made);
    f.sig = editorSelSig();
    if (next && next.kind === "close") { editorLoad({kind: "none"}, msg); wmCloseWindow(editor); }
    else editorLoad(next || {kind: "none"}, msg);
  } else {
    S.rangeSel = null;
    editor.classList.remove("on");
  }
  updateEditButtons();
  draw();
  return made;
}
export function editorDeleteRun(body) {
  if (S.rollnotesReadOnly) { body(); return null; }
  const before = annoSnapshot();
  let gone;
  S.edFollow.busy = true;
  try { gone = body(); } finally { S.edFollow.busy = false; }
  if (!gone) return null;
  pushUndo(annoUndoEntry(before, gone, "deleted"));
  S.editingNote = null;
  if (editorDocked()) { S.edFollow.sig = editorSelSig(); editorLoad({kind: "none"}, "Deleted " + editorShortLabel(gone)); } // R9
  else editor.classList.remove("on");
  updateEditButtons();
  draw();
  return gone;
}
// ---- docked follow mode (docs/plans/2026-10-07-docked-annotation-window.md).
// Docked, the window follows the ruler selection and band taps; floating, it
// stays the pop-up it always was. State lives on S.edFollow: mode is idle |
// new | editing | several | readonly; base/baseSpan are the fields as loaded
// (unsaved = they differ); sig is the selection last acted on; pending is the
// selection held behind the "Unsaved … Save · Discard" strip.
export const ED_FIELD_IDS = ["ntext", "nsectlabel", "nchordsym", "nchordbass", "nkeysel", "nkeymode", "ntempo",
  "ntsnum", "ntsden", "nlb", "nlq", "nls", "nchopmode", "nsongtitle"];
export const ED_SPAN_IDS = ["nb1", "nq1", "ns1", "nb2", "nq2", "ns2"];
export function editorDocked() { return !!(editor && editor.classList && editor.classList.contains("docked")); }
export function editorFollowing() {
  if (!editorDocked()) return false;
  if (editor.classList.contains("on")) return true;
  const w = wmWhereIs(S.wm, "noteeditor"); // a background tab of a side group follows unseen — a span tap never brings it forward
  return !!(w && w.dock !== "bottom" && S.wm[w.dock] && S.wm[w.dock].ids.length > 1);
}
export function editorFieldsKey(withType) {
  return JSON.stringify([withType ? editorType() : "", ED_FIELD_IDS.map(id => document.getElementById(id).value), editorSongKind(), chordSel]);
}
export function editorSpanKey() { return ED_SPAN_IDS.map(id => document.getElementById(id).value).join(","); }
export function editorMark() { S.edFollow.base = editorFieldsKey(S.edFollow.mode === "editing"); S.edFollow.baseSpan = editorSpanKey(); }
export function editorDirty() {
  const f = S.edFollow;
  if (f.mode !== "new" && f.mode !== "editing") return false;
  return editorFieldsKey(f.mode === "editing") !== f.base || editorSpanKey() !== f.baseSpan;
}
export function editorSelSig() {
  const r = S.rangeSel, L = S.lassoAnno;
  return (r ? r.a + "-" + r.b : "") + "|" + (L ? [L.t0, L.t1, L.y0, L.y1].join(",") : "");
}
// the type a NEW entry over a..b gets: a chip picked first, else the last
// type saved (a peek at a section doesn't flip a chord run); the #160
// "over two bars is a section" rule only when the last Save wasn't a chord
export function editorNewType(a, b) {
  const f = S.edFollow;
  if (f.prePick) return f.prePick;
  if (f.lastSaved !== "chord" && b - a > 2 * barTicks()) return "section";
  if (f.lastSaved === "chord" || f.lastSaved === "section") return f.lastSaved;
  return localStorage.getItem("ff1roll-dragtype") || "section";
}
export function editorShortLabel(n) { // "G7 · bar 13–14": a band's own text, anything else its full label
  return n.chord || n.section ? n.text + annoLabel(n).slice(annoLabel(n).lastIndexOf(" · bar")) : annoLabel(n);
}
export function editorDraftLabel() { // what the strip names: the draft as the fields hold it now
  const t = editorType(), v = id => document.getElementById(id).value.trim();
  const what = t === "chord" ? v("nchordsym") || "chord" : t === "section" ? v("nsectlabel") || "section"
    : t === "note" ? "note \u201c" + v("ntext").slice(0, 24) + "\u201d" : (NTYPE_CHIPS.find(c => c[0] === t) || [t, t])[1];
  const b1 = +document.getElementById("nb1").value || 1, b2 = +document.getElementById("nb2").value;
  const through = b2 ? (getBeatPair("nq2", "ns2") === 1 ? b2 - 1 : b2) : b1;
  return what + " (bar " + b1 + (through > b1 ? "–" + through : "") + ")";
}
// R1–R4: what the selection asks for. useLasso: the lasso is what moved.
export function editorSelTarget(useLasso) {
  if (useLasso) {
    if (!S.lassoAnno) return null; // a lasso cleared by tapping notes changes nothing (R14)
    const hits = lassoedAnnos().filter(n => !n.songnote).sort((x, y) => x.start - y.start);
    if (!hits.length) return null;
    return hits.length === 1 ? {kind: "anno", n: hits[0]} : {kind: "several", list: hits, a: null, b: null, type: null};
  }
  const r = S.rangeSel;
  if (!r || !(r.b > r.a)) return {kind: "none"};
  const type = editorNewType(r.a, r.b), q = beatTicks(), endOf = n => typeof n.end === "number" ? n.end : n.start;
  const hits = visibleNotes().filter(n => n[type] && n.start < r.b && endOf(n) > r.a).sort((x, y) => x.start - y.start); // visibleNotes: his own only in Learning
  if (!hits.length) return {kind: "empty", a: r.a, b: r.b, type};
  if (hits.length === 1) {
    const n = hits[0], e = endOf(n);
    if ((Math.abs(n.start - r.a) <= q && Math.abs(e - r.b) <= q) || (r.a >= n.start && r.b <= e)) return {kind: "anno", n};
  }
  return {kind: "several", list: hits, a: r.a, b: r.b, type};
}
// the one hook every selection writer reaches (endPointer, Esc, the Ruler
// highlight switch, Ask's select, undo/redo, a song's notes landing)
export function editorFollowSelection(force) {
  if (!S.song || !editorFollowing() || S.edFollow.busy) return;
  const f = S.edFollow, sig = editorSelSig(), was = f.sig === null ? null : f.sig.split("|");
  editorTrackEdited();
  if (!force && sig === f.sig) return;
  const now = sig.split("|"), rangeMoved = force || !was || was[0] !== now[0], lassoMoved = !was || was[1] !== now[1];
  f.sig = sig;
  // the lasso decides when it is what moved (a cleared lasso changes nothing);
  // otherwise the ruler span does
  const t = editorSelTarget(!rangeMoved || (lassoMoved && !!S.lassoAnno && !S.rangeSel));
  if (t) editorApply(t);
}
export function editorFollowBand(n) { // a single tap on a band loads it, highlight switch on or off (R1, R13)
  if (!editorFollowing()) return;
  S.edFollow.sig = editorSelSig();
  editorApply({kind: "anno", n});
}
export function editorApply(t) { // R6/R7: unsaved work is never dropped by a selection move
  const f = S.edFollow;
  if (editorDirty()) {
    if (t.kind === "none") return; // the span went away: the draft stays
    if (t.kind === "anno" && t.n === S.editingNote) return;
    if (f.mode === "new" && t.kind === "empty" && !f.pending) { editorSetSpan(t.a, t.b); f.baseSpan = editorSpanKey(); return; } // fixing a new entry's span: the draft follows it
    f.pending = t;
    editorRender();
    return;
  }
  editorLoad(t);
}
export function editorSetSpan(a, b) { // from/end rows from ticks, to the 16th
  const bt = barTicks(), qt = beatTicks();
  document.getElementById("nb1").value = String(Math.floor(a / bt) + 1);
  setBeatPair("nq1", "ns1", (a % bt) / qt + 1);
  if (b > a) { document.getElementById("nb2").value = String(Math.floor(b / bt) + 1); setBeatPair("nq2", "ns2", (b % bt) / qt + 1); }
}
export function editorTrackEdited() { // edge case 6: dragging the loaded band's edge moves its from/end live, no strip
  const f = S.edFollow, n = S.editingNote;
  if (f.mode !== "editing" || !n || !S.rollnotes.includes(n) || !(n.chord || n.section)) return;
  const k = n.start + ":" + n.end;
  if (k === f.noteSpan) return;
  f.noteSpan = k;
  const clean = !editorDirty();
  editorSetSpan(n.start, n.end);
  if (clean) f.baseSpan = editorSpanKey();
}
export function editorLoad(t, msg) {
  const f = S.edFollow, ro = !!(S.rollnotesReadOnly || LINK_SONGS);
  f.pending = null;
  micStop(true); // a late dictation result must not land in the next entry (edge case 11)
  if (t.kind === "anno" || (t.kind === "open" && t.note)) {
    const n = t.kind === "anno" ? t.n : t.note;
    editorFill(n, undefined, t.opts);
    f.mode = ro ? "readonly" : "editing";
    f.ident = noteIdentity(n);
    f.noteSpan = n.start + ":" + n.end;
  } else if (t.kind === "empty" || t.kind === "open") {
    editorFill(null, t.kind === "empty" ? t.type : t.presetType, t.opts);
    f.mode = ro ? "readonly" : "new";
    f.ident = null;
  } else { // none / several: blank fields, Save off
    editorFill(null, editorNewType(0, 0));
    S.editingNote = null;
    f.mode = t.kind === "several" ? "several" : "idle";
    f.ident = null;
  }
  f.list = t.kind === "several" ? t.list : [];
  f.listSpan = t.kind === "several" && t.a !== null ? {a: t.a, b: t.b, type: t.type} : null;
  f.msg = msg || "";
  f.songKey = S.songKey;
  editorMark();
  if (document.activeElement && editor.contains(document.activeElement) && typeof document.activeElement.blur === "function") document.activeElement.blur(); // R11: a keyboard up for the last entry goes down
  editorRender();
}
export function editorPick(n) { // a row of the Several list: load it, and the highlight moves to it
  if (showRulerHl()) S.rangeSel = {a: n.start, b: n.end};
  S.edFollow.sig = editorSelSig();
  editorLoad({kind: "anno", n});
  draw();
}
export function editorRender() {
  const f = S.edFollow, docked = editorDocked();
  setControl("ncancel", {label: docked ? "Clear" : "Cancel"});
  const box = document.getElementById("nfollow"), save = document.getElementById("nsave"), del = document.getElementById("ndelete");
  editor.classList.toggle("edidle", docked && (f.mode === "idle" || f.mode === "several"));
  editor.classList.toggle("edro", docked && f.mode === "readonly");
  if (!docked) { box.style.display = "none"; save.disabled = false; del.disabled = false; return; }
  box.style.display = "";
  save.disabled = !(f.mode === "new" || f.mode === "editing");
  del.disabled = f.mode === "readonly";
  const kinds = f.list.length && f.list.every(n => n.chord) ? "chords" : f.list.length && f.list.every(n => n.section) ? "sections" : "annotations";
  document.getElementById("nfollowmsg").textContent =
    f.mode === "idle" ? (f.msg ? f.msg + ". " : "") + "Select bars in the ruler, or tap a chord or section."
    : f.mode === "several" ? f.list.length + " " + kinds + " in this span — tap one in the ruler to edit it" // one row, never a line per band (Josh #257: "way too huge")
    : f.mode === "readonly" ? (LINK_SONGS ? "Someone else's song: annotations are theirs — open your own copy to write." : S.rollnotesLockReason || ROLLNOTES_LOCK_MSG)
    : f.msg;
  const list = document.getElementById("nseveral");
  list.textContent = "";
  list.style.display = f.mode === "several" ? "flex" : "none";
  if (f.mode === "several") {
    if (f.listSpan && !S.rollnotesReadOnly) { // R3: never automatic — saving it makes overlapping bands
      const b = document.createElement("button"), sp = f.listSpan;
      b.type = "button"; b.textContent = "New " + (NTYPE_CHIPS.find(c => c[0] === sp.type) || [sp.type, sp.type])[1].toLowerCase() + " here";
      b.addEventListener("click", () => editorLoad({kind: "empty", a: sp.a, b: sp.b, type: sp.type}));
      list.appendChild(b);
    }
  }
  document.getElementById("nunsaved").style.display = f.pending ? "" : "none";
  if (f.pending) document.getElementById("nunsavedtxt").textContent = "Unsaved " + editorDraftLabel();
}
export function editorStripDiscard() {
  const t = S.edFollow.pending || {kind: "none"};
  if (t.kind === "close") { editorLoad({kind: "none"}); wmCloseWindow(editor); return; }
  editorLoad(t);
}
export function editorClear() { // docked Cancel reads Clear (R8): drop the draft, back to what the selection says
  S.edFollow.sig = editorSelSig();
  editorLoad(editorSelTarget(false) || {kind: "none"});
}
export function editorDockedOpen(t) { // R18: + Note, a list row, a flag — into the docked window, never a second copy
  const f = S.edFollow, wasOn = editor.classList.contains("on");
  editor.classList.add("on");
  if (wasOn && editorDirty() && !(t.note && t.note === S.editingNote)) { f.pending = t; editorRender(); return; }
  f.sig = editorSelSig();
  editorLoad(t);
}
export function editorCloseGuard() { // S.wmCloseGuards.noteeditor: ✕ with unsaved changes asks first, inline (R8)
  if (!editorDocked() || !editorDirty()) return true;
  S.edFollow.pending = {kind: "close"};
  editorRender();
  return false;
}
export function editorAfterUndo() { // R10: after an undo/redo, a docked window re-reads the selection
  if (!editorFollowing() || editorDirty()) return;
  S.edFollow.sig = editorSelSig();
  const t = editorSelTarget(false);
  if (t) editorLoad(t);
}
export function editorBeforeSongChange() { // R16: a chord belongs to its song's bars — an unsaved one is dropped, and said so
  const f = S.edFollow;
  if (!editorFollowing()) return;
  f.dropped = editorDirty() ? "Unsaved " + editorDraftLabel() + " on " + songTitleOf(S.songKey) + " was dropped" : "";
  f.pending = null;
  f.mode = "idle";
  S.editingNote = null;
}
export function editorAfterNotesChange() { // finalizeNotes' tail
  const f = S.edFollow;
  if (f.busy || !S.song || !editorFollowing()) return;
  if (f.songKey !== S.songKey) { // a new song's notes have landed: read its restored span
    const msg = f.dropped;
    f.dropped = "";
    f.sig = editorSelSig();
    const t = editorSelTarget(false);
    editorLoad(t || {kind: "none"}, msg);
    return;
  }
  if (f.mode === "editing" && S.editingNote && !S.rollnotes.includes(S.editingNote)) { // undo/Ask replaced or removed it: never a ghost
    const again = f.ident && S.rollnotes.find(n => noteIdentity(n) === f.ident);
    if (again && editorDirty()) { S.editingNote = again; return; }
    f.sig = editorSelSig();
    editorLoad(again ? {kind: "anno", n: again} : editorSelTarget(false) || {kind: "none"});
    return;
  }
  editorTrackEdited();
}
export function editorDockChanged() { // wmLayoutAll's tail: docking or floating the window switches its mode in place
  const d = editorDocked(), f = S.edFollow;
  if (d === f.wasDocked) return;
  f.wasDocked = d;
  if (d) {
    f.pending = null;
    f.songKey = S.songKey;
    f.sig = editorSelSig();
    f.mode = !editor.classList.contains("on") ? "idle" : S.editingNote ? (S.rollnotesReadOnly ? "readonly" : "editing") : "new";
    if (S.editingNote) { f.ident = noteIdentity(S.editingNote); f.noteSpan = S.editingNote.start + ":" + S.editingNote.end; }
    editorMark();
  }
  editorRender();
}
export function editorRelaunchOpen() { // S.wmOpeners.noteeditor (R17): only a DOCKED one returns, Idle, nothing focused
  if (!wmWhereIs(S.wm, "noteeditor") || !wmAllowed(wmInnerWidth())) return;
  editor.classList.add("on");
  if (!editorDocked()) wmLayoutAll();
  if (!editorDocked()) { editor.classList.remove("on"); return; }
  S.edFollow.sig = null;
  editorLoad({kind: "none"});
  editorFollowSelection(true);
  // wmRestoreOpen runs once the song is in, which can be before its notes
  // are: read the restored span again when they land (unless he started)
  const ready = S.song && S.song.notesReady, key = S.songKey;
  if (ready && typeof ready.then === "function") ready.then(() => { if (S.songKey === key && !editorDirty()) editorFollowSelection(true); }, () => {});
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
  document.getElementById("nsongtitle").addEventListener("keydown", e => { // a title is one line: Enter moves on to the body
    if (e.key === "Enter") { e.preventDefault(); document.getElementById("ntext").focus(); }
  });
  document.getElementById("ntypechips").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) pickEditorType(b.dataset.v); });
  document.getElementById("nsongkinds").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) setEditorSongKind(b.dataset.v); });
  document.getElementById("ntext").addEventListener("input", () => { // a pause after typing, not every keystroke: "A" mid-word must not become a chord
    if (S.ntypePicked || editorType() !== "note") return;
    if (S.ntypeGuess) clearTimeout(S.ntypeGuess.timer);
    S.ntypeGuess = {timer: setTimeout(applyNoteTypeGuess, 900), from: null};
  });

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
  document.getElementById("ncancel").addEventListener("click", () => { micStop(true); if (editorDocked()) editorClear(); else editor.classList.remove("on"); });
  document.getElementById("nunsavedsave").addEventListener("click", () => document.getElementById("nsave").dispatchEvent(new Event("click")));
  document.getElementById("nunsaveddiscard").addEventListener("click", editorStripDiscard);
  editor.addEventListener("keydown", e => { // docked, Esc never closes the window: in a field it drops the keyboard (R8)
    if (e.key !== "Escape" || !editorDocked()) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") && typeof t.blur === "function") { t.blur(); e.preventDefault(); }
  });
  S.wmCloseGuards.noteeditor = editorCloseGuard;
   document.getElementById("ntext").addEventListener("keydown", e => {
    // sections are one-line labels: Enter = save. Text notes keep Enter = newline
    if (e.key === "Enter" && editorType() === "section") {
      e.preventDefault();
      document.getElementById("nsave").click();
    }
  });
  // the body returns the annotation it wrote (falsy = refused, nothing
  // written); editorSaveRun around it owns undo, close/stay and the readout
  const nsaveBody = () => {
    // P4 (docs/annotations-v2.md): closes P3's known gap — every manual
    // annotation edit refuses on a locked (newer-than-this-app) song, same
    // message as the Ask tool's add/edit_annotation, instead of landing
    // in-memory/localStorage with no way to ever publish it
    if (S.rollnotesReadOnly) { document.getElementById("nstatus").textContent = S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; return; }
    micStop(true); // the text is read now; a late result would land in a closed editor
    const type = editorType();
    const text = document.getElementById("ntext").value.trim();
    if (type === "note" && !text) { document.getElementById("nstatus").textContent = "Note text is empty."; return; }
    if (type === "song") { // no bar, no span: the title is its identity (putSongNote refuses a title another song note has)
      let made;
      try { made = putSongNote(S.editingNote, {title: document.getElementById("nsongtitle").value, text, kind: editorSongKind()}); }
      catch (err) { document.getElementById("nstatus").textContent = err && err.message ? err.message : String(err); return; }
      finalizeNotes();
      return made;
    }
    const b1 = Math.max(1, +document.getElementById("nb1").value || 1);
    const q1 = Math.max(1, getBeatPair("nq1", "ns1"));
    let b2raw = 0, q2raw = 0;
    if (document.getElementById("nb2").value !== "") { // "ends at" → the stored "through" (to: bar of the last tick, beats from that bar's start)
      const bt = barTicks(), qt = beatTicks();
      const endTick = (+document.getElementById("nb2").value - 1) * bt + (getBeatPair("nq2", "ns2") - 1) * qt;
      if (endTick <= (b1 - 1) * bt + (q1 - 1) * qt) { document.getElementById("nstatus").textContent = "The end has to come after the start."; return; }
      b2raw = Math.floor((endTick - 1) / bt) + 1;
      q2raw = Math.round((endTick - (b2raw - 1) * bt) / qt * 10000) / 10000;
    }
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
    const made = resolveNote(fresh);
    S.rollnotes.push(made);
    finalizeNotes();
    saveLocalNotes();
    buildScoreModel(); // annotations can change signatures/spelling
    clampView();
    S.lastSubtitle = undefined;
    updateSubtitle();
    return made;
  };
  document.getElementById("nsave").addEventListener("click", () => editorSaveRun(nsaveBody));
  const ndeleteBody = () => { // returns the annotation it removed; falsy = refused or waiting for the confirming second tap
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
    const gone = S.editingNote;
    tombstone(S.editingNote); // synced notes need the deletion to survive a reload
    S.rollnotes = S.rollnotes.filter(n => n !== S.editingNote);
    finalizeNotes();
    saveLocalNotes();
    buildScoreModel();
    clampView();
    S.lastSubtitle = undefined;
    updateSubtitle();
    return gone;
  };
  document.getElementById("ndelete").addEventListener("click", () => editorDeleteRun(ndeleteBody));
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
  document.getElementById("shapebtn").addEventListener("click", () => {
    if (!selEditItems().length) { setInfo("select notes first — then Shape sets the volume inside each one"); return; }
    if (!editableSong()) { setInfo("shapes work on your own songs — Edit a copy (File ▾) to shape a capture"); return; }
    const row = document.getElementById("shapechips");
    if (!row.children.length) {
      for (const [key, label] of Object.entries(SHAPE_PRESETS)) {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = "flex:1;min-height:44px;font-size:1.0625rem";
        b.addEventListener("click", () => {
          const room = {lowered: 0};
          const k = setSelectionShape(key, undefined, null, room);
          document.getElementById("shapesheet").classList.remove("on");
          setInfo(!k ? "those notes are too short to shape"
            : (key === "flat" ? "cleared the shape on " : label + " on ") + k + " note" + (k === 1 ? "" : "s") +
              (room.lowered ? " — " + room.lowered + " started too loud to rise, so " + (room.lowered === 1 ? "its" : "their") + " velocity dropped to " + SHAPE_ROOM_V + " to make room" : "") + " (one undo undoes)");
        });
        row.appendChild(b);
      }
    }
    document.getElementById("shapesheet").classList.add("on");
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
    if (!S.song) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (!editableSong()) { // locked notes: only the annotation clipboard and its undo (Josh, Terminal #235)
      const mk = (e.metaKey || e.ctrlKey) && lockedAnnoSong() ? e.key.toLowerCase() : "";
      if (mk === "c") { if (copySelection()) { setInfo("copied " + clipSummary() + " — ⌘V pastes at the playhead"); e.preventDefault(); } }
      else if (mk === "v") { if (clipboardHas()) { pasteClipboard(S.playCursor); e.preventDefault(); } }
      else if (mk === "z") { if (e.shiftKey) editRedoPop(); else editUndoPop(); e.preventDefault(); }
      else if (mk === "y") { editRedoPop(); e.preventDefault(); }
      return;
    }
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
