import { S } from "../state.js";
import { analysisAvailable } from "../platform/mode.js";
import { LINK_SONGS } from "../platform/base.js";
import { cfg } from "../platform/storage.js";
import { barTicks } from "../model/rollnotes.js";
import { parseRollnotes } from "../model/rollnotes.js";
import { resolveNote } from "../model/rollnotes.js";
import { dropSupersededBy } from "../model/rollnotes.js";
import { ROLLNOTES_LOCK_MSG } from "../model/rollnotes.js";
import { beatTicks } from "../model/grid.js";
import { beatsPerBarDisp } from "../model/grid.js";
import { trackIsDrums } from "../model/grid.js";
import { annoSnapshot } from "../model/edits.js";
import { pushUndo } from "../model/edits.js";
import { saveLocalNotes } from "../model/edits.js";
import { tombstone } from "../model/edits.js";
import { factsDocFromState } from "../model/song.js";
import { JOB_KINDS } from "../model/jobs.js";
import { parseChordSym } from "../theory/chords.js";
import { keyNameToSf } from "../theory/key.js";
import { formFacts } from "../theory/facts/form.js";
import { bassFacts } from "../theory/facts/bass.js";
import { melodyFacts } from "../theory/facts/melody.js";
import { rhythmFacts } from "../theory/facts/rhythm.js";
import { formatFacts } from "../theory/facts/format.js";
import { askSpanNotesCompact } from "./context.js";
import { askBarRow } from "./context.js";
import { askBudget } from "./context.js";
import { askBarsCount } from "./tools.js";
import { askModelName } from "./bridge.js";
import { aiProvider } from "./backend.js";
import { aiUrl } from "./backend.js";
import { aiHostOk } from "./backend.js";
import { jobStart } from "../ui/sheets.js";
import { drawImpl as draw } from "../ui/chrome.js";
import { finalizeNotesImpl as finalizeNotes } from "../session/song.js";
import { buildScoreModelImpl as buildScoreModel } from "../render/score.js";
import { updateSubtitleImpl as updateSubtitle } from "../ui/chrome.js";
import { updateSongBtnImpl as updateSongBtn } from "../ui/chrome.js";
import { updateSyncBtnImpl as updateSyncBtn } from "../ui/chrome.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js";
import { appConfirmImpl as appConfirm } from "../ui/chrome.js";
import { songTitleOfImpl as songTitleOf } from "./context.js";

// ---- ✦ Annotate this song… (docs/plans/2026-10-04-annotate-song.md) ----
// Normal mode ONLY. In Learning the View ▾ item is absent (renderViewMenu,
// the same display:none mechanism as vwAnalyze), the runner refuses
// (annotateGate), and nothing here is reachable from the chat: there is no
// ASK tool for it — this job calls the backend itself with its own system
// prompt and `tools: []`, so ASK_TOOLS/askToolsNow/askSys/askContext are
// untouched by construction (tests/annotate.test.mjs holds them to that).
// Normal mode: the Run tap is the approval. Estimates land as ordinary
// annotations (song state: unsynced until Publish, like a typed one),
// each tagged `n.ai = {model, at}` (round-trips through noteToJSON/
// jsonToRawNote and the local store), never over the user's own — an
// estimate whose span overlaps a NON-ai annotation of the same kind is
// skipped and counted. One run = one undo step; Clear = one undo step.
// Nothing is written until EVERY window's reply parsed and validated —
// the write_notes discipline (one bad item, nothing lands).
export const ANNOTATE_SYS = `You annotate a piece of music for a piano-roll app, from its notes alone. Reply with ONE JSON object and nothing else — no prose, no markdown fences:
{"sections":[{"from_bar":1,"to_bar":8,"label":"A"}],"chords":[{"bar":1,"beat":1,"end_bar":1,"end_beat":4,"symbol":"Am"}],"keys":[{"bar":1,"name":"A minor"}]}

Rules:
- Give only the kinds the request asks for (an empty list for the rest), and only bars inside the stated range.
- Bars and beats are the user's ruler: bar numbers as given; beat 1 is the downbeat; beats are counted in the stated meter; fractions are allowed (2.5). end_beat is the LAST beat a chord still sounds on, inclusive — a chord filling one bar of 4 beats runs from beat 1 to end_beat 4.
- sections: contiguous and non-overlapping, with short labels (A, A', B, Intro, Bridge, Coda) of at most 40 characters.
- chords: one entry per harmonic change, in standard symbols the app reads: C, Am, G7, Dm7, F#dim, Bdim7, Caug, Csus4, Bb/D, Em7b5. A chord that keeps sounding is one span, never repeated beat by beat.
- keys: one entry where the key is established or changes — usually one at the first bar. Name it like "A minor", "F major", "D dorian".
- These are estimates read from the notes and from the FACTS block (repetition, bass motion, ranges, rhythm — computed from the notes, reliable). Prefer fewer, surer entries over many doubtful ones. Never invent notes that are not in the NOTES block.

NOTES format: "T<n> name" starts a track ("[drums]"/"[muted]" tags if either applies); each row is "<bar>|<beat><Pitch><octave>/<duration> …" — beat is the counted beat (1 = the downbeat), duration is how long the note was held in beats; octave and duration repeat from the previous note IN THAT ROW when omitted. A drum row gives the raw note number after "#" instead of a pitch.`;
export const ANNOTATE_LABEL_MAX = 40;
export const ANNOTATE_SYMBOL_MAX = 24;

export function annotateGate() { // the reason this song cannot be annotated right now, or null
  if (!analysisAvailable()) return "Normal mode only — Learning mode never writes analysis";
  if (!S.song) return "no song open";
  if (!S.songKey) return "open a saved song first — a local file has nowhere to keep annotations";
  if (LINK_SONGS) return "this song is being viewed from a link to another repo — read-only here";
  if (S.rollnotesReadOnly) return S.rollnotesLockReason || ROLLNOTES_LOCK_MSG; // version guard, docs/annotations-v2.md P3
  if (!S.song.tracks.some((tr, ti) => tr.kind !== "audio" && !trackIsDrums(ti) && tr.notes.some(n => !n.gone))) return "no pitched notes to read — an audio-only or drum-only song has nothing to annotate from";
  return null;
}
export function annotateKind(n) { // which estimate kind an existing annotation competes with (null: none — text, tempo, meter, track…)
  if (n.section) return "section";
  if (n.chord) return "chord";
  if (n.keydir !== undefined || n.keypartial || /^key:/i.test(n.text || "")) return "key";
  return null;
}
export function annotateSpanQ(bpb, b1, q1, b2, q2) { // [start, end) in absolute beats — the same arithmetic resolveNote does in ticks, kept in beats so the validator stays pure
  const start = (b1 - 1) * bpb + ((q1 || 1) - 1);
  const end = b2 ? (b2 - 1) * bpb + (q2 || bpb) : start + 1e-6;
  return [start, end];
}
// ---- the reply: JSON only, but a model may still wrap it in a fence or a
// sentence — take the outermost {…}; anything that will not parse is "no
// usable reply", not a guess.
export function annotateParse(text) {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no usable reply — the model did not answer with JSON");
  let obj;
  try { obj = JSON.parse(t.slice(a, b + 1)); } catch (err) { throw new Error("no usable reply — the model's JSON did not parse (" + err.message + ")"); }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("no usable reply — expected a JSON object");
  return obj;
}
// ---- validation (pure): every failure named, the caller writes nothing on
// any failure. Bars against the song's own count, beats against the meter,
// chord symbols through the app's own parser (parseChordSym — the lasso
// namer's vocabulary), key names through keyNameToSf (what a "key:"
// annotation derives its signature from), sections non-overlapping.
export function annotateValidate(obj, {nBars, bpb, kinds}) {
  const errors = [], items = [];
  const num = v => (typeof v === "number" && isFinite(v)) ? v : (typeof v === "string" && v.trim() !== "" && isFinite(+v)) ? +v : null;
  const bar = (v, what) => { const n = num(v); if (n === null || Math.round(n) !== n || n < 1 || n > nBars) { errors.push(what + ": bar " + JSON.stringify(v) + " is not a bar of this song (1–" + nBars + ")"); return null; } return n; };
  const list = (k) => Array.isArray(obj[k]) ? obj[k] : (obj[k] === undefined || obj[k] === null ? [] : (errors.push(k + " is not a list"), []));
  const want = Object.assign({sections: true, chords: true, keys: true}, kinds || {});
  if (want.sections) {
    const secs = [];
    list("sections").forEach((s, i) => {
      const what = "sections[" + i + "]";
      if (!s || typeof s !== "object") { errors.push(what + " is not an object"); return; }
      const from = bar(s.from_bar, what + ".from_bar"), to = bar(s.to_bar, what + ".to_bar");
      const label = String(s.label === undefined || s.label === null ? "" : s.label).trim();
      if (!label) errors.push(what + ": empty label");
      else if (label.length > ANNOTATE_LABEL_MAX) errors.push(what + ": label longer than " + ANNOTATE_LABEL_MAX + " characters");
      if (from === null || to === null || !label || label.length > ANNOTATE_LABEL_MAX) return;
      if (to < from) { errors.push(what + ": to_bar " + to + " is before from_bar " + from); return; }
      secs.push({kind: "section", bar: from, beat: 1, endBar: to, endBeat: null, text: label});
    });
    secs.sort((a, b) => a.bar - b.bar || a.endBar - b.endBar);
    for (let i = 1; i < secs.length; i++) {
      if (secs[i].bar <= secs[i - 1].endBar) errors.push("sections overlap: " + secs[i - 1].text + " (" + secs[i - 1].bar + "–" + secs[i - 1].endBar + ") and " + secs[i].text + " (" + secs[i].bar + "–" + secs[i].endBar + ")");
    }
    items.push(...secs);
  }
  if (want.chords) {
    list("chords").forEach((c, i) => {
      const what = "chords[" + i + "]";
      if (!c || typeof c !== "object") { errors.push(what + " is not an object"); return; }
      const b = bar(c.bar, what + ".bar");
      const beat = c.beat === undefined || c.beat === null ? 1 : num(c.beat);
      if (beat === null || beat < 1 || beat >= bpb + 1) errors.push(what + ": beat " + JSON.stringify(c.beat) + " is not a beat of a " + bpb + "-beat bar");
      const endBar = c.end_bar === undefined || c.end_bar === null ? b : bar(c.end_bar, what + ".end_bar");
      const endBeat = c.end_beat === undefined || c.end_beat === null ? null : num(c.end_beat);
      if (endBeat !== null && (endBeat < 1 || endBeat > bpb)) errors.push(what + ": end_beat " + JSON.stringify(c.end_beat) + " is not a beat of a " + bpb + "-beat bar");
      const symbol = String(c.symbol === undefined || c.symbol === null ? "" : c.symbol).trim();
      if (!symbol || symbol.length > ANNOTATE_SYMBOL_MAX || !parseChordSym(symbol)) errors.push(what + ": " + JSON.stringify(symbol) + " is not a chord symbol the app reads (C, Am, G7, F#dim, Bb/D …)");
      if (b === null || endBar === null || beat === null || beat < 1 || beat >= bpb + 1 || (endBeat !== null && (endBeat < 1 || endBeat > bpb)) || !symbol || symbol.length > ANNOTATE_SYMBOL_MAX || !parseChordSym(symbol)) return;
      const [s, e] = annotateSpanQ(bpb, b, beat, endBar, endBeat);
      if (e <= s) { errors.push(what + ": ends (" + endBar + "." + (endBeat || bpb) + ") before it starts (" + b + "." + beat + ")"); return; }
      items.push({kind: "chord", bar: b, beat, endBar, endBeat, text: symbol});
    });
  }
  if (want.keys) {
    list("keys").forEach((k, i) => {
      const what = "keys[" + i + "]";
      if (!k || typeof k !== "object") { errors.push(what + " is not an object"); return; }
      const b = bar(k.bar, what + ".bar");
      const name = String(k.name === undefined || k.name === null ? "" : k.name).trim();
      const ok = !!name && name.length <= ANNOTATE_SYMBOL_MAX && keyNameToSf(name) !== null && !/\?/.test(name);
      if (!ok) errors.push(what + ": " + JSON.stringify(name) + " is not a key name the app reads (A minor, F major, D dorian, Gm …)");
      if (b === null || !ok) return;
      items.push({kind: "key", bar: b, beat: 1, endBar: null, endBeat: null, text: name});
    });
  }
  if (errors.length) throw new Error(errors.join("; "));
  return items;
}
// ---- the user's own annotations win (CLAUDE.md: findings are his). An
// estimate whose span touches a NON-ai annotation of the same kind is
// skipped; `merged` drops an estimate that overlaps one already accepted in
// this run (a section straddling two windows, two chords on one span).
export function annotateOverlaps(items, existing, bpb) {
  const theirs = existing.filter(n => !n.ai).map(n => ({kind: annotateKind(n), bar: n.b1, span: annotateSpanQ(bpb, n.b1, n.q1, n.b2, n.q2)})).filter(x => x.kind);
  const hits = (a, b) => a[0] < b[1] && b[0] < a[1];
  const accepted = [], skipped = [], merged = [];
  for (const it of items) {
    const span = annotateSpanQ(bpb, it.bar, it.beat, it.endBar, it.endBeat);
    const clash = x => x.kind === it.kind && (it.kind === "key" ? x.bar === it.bar : hits(x.span, span));
    if (theirs.some(clash)) { skipped.push(it); continue; }
    if (accepted.some(a => clash({kind: a.kind, bar: a.bar, span: annotateSpanQ(bpb, a.bar, a.beat, a.endBar, a.endBeat)}))) { merged.push(it); continue; }
    accepted.push(it);
  }
  return {accepted, skipped, merged};
}
export function annotateHead(it) { return "[" + it.bar + "." + it.beat + (it.endBar ? " - " + it.endBar + (it.endBeat ? "." + it.endBeat : "") : "") + "]"; }
export function annotateRedraw() {
  finalizeNotes();
  saveLocalNotes();
  buildScoreModel();
  S.lastSubtitle = undefined;
  updateSubtitle();
  draw();
  updateSongBtn();
  updateSyncBtn();
}
// ---- write: the SAME text grammar the editor and askAddAnnotation use
// (parseRollnotes → resolveNote), every line parsed BEFORE the first push,
// one pushUndo for the batch (the adoptAllChords pattern). A re-run replaces
// an earlier AI estimate of the same kind on the same span instead of
// stacking a twin beside it.
export function annotateWrite(items, meta) {
  const fresh = items.map(it => {
    const parsed = parseRollnotes(annotateHead(it) + "\n" + it.kind + ": " + it.text);
    if (!parsed.length) throw new Error("could not write " + it.kind + " " + JSON.stringify(it.text) + " at " + annotateHead(it));
    return {it, n: parsed[0]};
  });
  if (!fresh.length) return 0;
  const before = annoSnapshot();
  const same = (n, it) => n.ai && annotateKind(n) === it.kind && n.b1 === it.bar && (n.q1 || 1) === it.beat && (n.b2 || null) === (it.endBar || null) && (n.q2 || null) === (it.endBeat || null);
  for (const {it} of fresh) S.rollnotes = S.rollnotes.filter(n => !same(n, it));
  for (const {n} of fresh) {
    n.added = true;
    n.ai = {model: meta.model, at: meta.at};
    dropSupersededBy(n);
    S.rollnotes.push(resolveNote(n));
  }
  pushUndo({kind: "anno", json: before}); // every estimate of this run is ONE undo step, not N
  annotateRedraw();
  return fresh.length;
}
export function annotateCount() { return S.song ? S.rollnotes.filter(n => n.ai).length : 0; }
export function annotateClear() { // every tagged note, through the editor's own delete path (tombstones for published ones), one undo
  const mine = S.rollnotes.filter(n => n.ai);
  if (!mine.length) return 0;
  if (S.rollnotesReadOnly) throw new Error(S.rollnotesLockReason || ROLLNOTES_LOCK_MSG);
  const before = annoSnapshot();
  for (const n of mine) tombstone(n); // a published AI note must stay deleted across a reload — same path the note editor's Delete uses
  S.rollnotes = S.rollnotes.filter(n => !n.ai);
  pushUndo({kind: "anno", json: before});
  annotateRedraw();
  return mine.length;
}
// ---- the request. Windowed for long songs: a 300-second capture does not
// fit the model's window, so bars are split into runs whose compact rows fit
// askBudget().span (the same cap the chat's context uses), each window asked
// on its own, every reply validated, then the accepted estimates written
// together. Per-bar cost comes from askBarRow — the ONE place the row format
// lives — so the split can't drift from what askSpanNotesCompact emits.
export function annotateBarCosts() {
  const bt = barTicks(), qt = beatTicks(), n = askBarsCount();
  const costs = new Array(n).fill(0);
  S.song.tracks.forEach((tr, ti) => {
    if (tr.kind === "audio") return;
    for (let b = 0; b < n; b++) { const row = askBarRow(tr, ti, b, bt, qt, null); if (row) costs[b] += row.length + 1; }
  });
  return costs;
}
export function annotateWindows(costs, cap) { // [from, to] (1-based, inclusive) runs of bars whose rows fit under cap chars; a lone bar always gets a window
  const out = [];
  let from = 1, size = 0;
  for (let b = 1; b <= costs.length; b++) {
    const c = costs[b - 1];
    if (size && size + c > cap) { out.push([from, b - 1]); from = b; size = 0; }
    size += c;
  }
  out.push([from, Math.max(from, costs.length)]);
  return out;
}
export function annotateWindowCap(budget) { return Math.max(400, budget.span - 24 * (S.song ? S.song.tracks.length : 0)); } // the track heads come off the top
export function annotateCut(text, cap) { return text.length > cap ? text.slice(0, cap).replace(/\n[^\n]*$/, "") + "\n  … (cut)" : text; }
export function annotateFacts(from, to, cap) { // the theory FACTS toolkit as grounding: deterministic, from the notes; a kind that cannot speak for this span is left out, never a failure
  const doc = factsDocFromState();
  const t0 = (from - 1) * doc.barTicks, t1 = to * doc.barTicks;
  const blocks = [["form", () => formFacts(doc, {from: t0, to: t1})], ["bass", () => bassFacts(doc, {from: t0, to: t1})],
                  ["melody", () => melodyFacts(doc, {from: t0, to: t1})], ["rhythm", () => rhythmFacts(doc, {from: t0, to: t1})]];
  const out = [];
  for (const [kind, fn] of blocks) {
    try { out.push("## " + kind + "\n" + annotateCut(formatFacts(kind, fn()).trim(), cap)); } catch (err) { /* e.g. no pitched track in this window */ }
  }
  return out.join("\n");
}
export function annotateTheirs(from, to, bpb) { // the user's own annotations in the window, so the model builds on them (and knows an overlapping estimate is discarded)
  const [w0, w1] = [(from - 1) * bpb, to * bpb];
  return S.rollnotes.filter(n => !n.ai && annotateKind(n)).filter(n => { const [s, e] = annotateSpanQ(bpb, n.b1, n.q1, n.b2, n.q2); return s < w1 && e > w0; })
    .sort((a, b) => a.start - b.start).map(n => annotateHead({bar: n.b1, beat: n.q1 || 1, endBar: n.b2, endBeat: n.q2}) + " " + annotateKind(n) + ": " + n.text);
}
export function annotateRequest({from, to, nBars, bpb, kinds, budget, title}) {
  const bt = barTicks();
  const asked = ["sections", "chords", "keys"].filter(k => kinds[k]);
  const L = ["song: " + title, "bars " + from + "–" + to + " of " + nBars + " · meter: " + bpb + " beats per bar", "wanted: " + asked.join(", ")];
  const theirs = annotateTheirs(from, to, bpb);
  if (theirs.length) L.push("", "the user's own annotations in these bars (fixed — build on them, never restate them; an estimate overlapping one is discarded):", ...theirs.slice(0, 60));
  const facts = annotateFacts(from, to, Math.max(300, Math.round(budget.span / 3)));
  if (facts) L.push("", "FACTS (computed from the notes):", facts);
  L.push("", "NOTES:", askSpanNotesCompact((from - 1) * bt, to * bt, budget.span + 400));
  return L.join("\n");
}
export function annotateSummary(r) {
  if (!r) return "";
  if (r.cancelled) return "stopped — nothing written";
  const by = {section: 0, chord: 0, key: 0};
  for (const it of r.items) by[it.kind]++;
  const parts = [by.chord + " chord" + (by.chord === 1 ? "" : "s"), by.section + " section" + (by.section === 1 ? "" : "s"), by.key + " key" + (by.key === 1 ? "" : "s")].filter(p => !/^0 /.test(p));
  return "wrote " + r.written + (parts.length ? " (" + parts.join(", ") + ")" : "") + (r.skipped ? " · skipped " + r.skipped + " (yours)" : "") + (r.merged ? " · merged " + r.merged : "")
    + (r.windows > 1 ? " · " + r.windows + " windows" : "") + " — one undo takes it back";
}
// ---- the run: a background job (footer ⏳, ✕ aborts), the model asked
// window by window with ANNOTATE_SYS and no tools, nothing written until
// every reply validated and the song is still the one that was asked about.
export async function annotateRun(opts = {}) {
  const kinds = Object.assign({sections: true, chords: true, keys: true}, opts.kinds || {});
  const gate = annotateGate();
  if (gate) throw new Error(gate);
  if (S.annotateBusy) throw new Error("an annotate run is already going — ✕ it in Jobs first");
  if (!kinds.sections && !kinds.chords && !kinds.keys) throw new Error("pick at least one of Sections, Chords, Key");
  if (cfg().aiBackend !== "browser" && !(await aiHostOk(aiUrl()))) throw new Error("not sent — the server was not approved");
  const say = opts.say || (() => {});
  const budget = askBudget();
  const nBars = askBarsCount(), bpb = beatsPerBarDisp();
  const windows = annotateWindows(annotateBarCosts(), annotateWindowCap(budget));
  const key = S.songKey, title = songTitleOf(key);
  const meta = {model: askModelName(), at: new Date().toISOString()};
  return new Promise((resolve, reject) => {
    jobStart("annotate", "✦ Annotate · " + title, [{label: title}], async api => {
      S.annotateBusy = true;
      const ctl = typeof AbortController === "function" ? new AbortController() : {abort() {}, signal: undefined};
      try {
        const replies = [];
        for (const [i, [from, to]] of windows.entries()) {
          if (api.aborted) break;
          api.update(0, {st: "running", pct: i / windows.length, msg: "bars " + from + "–" + to});
          say("asking about bars " + from + "–" + to + (windows.length > 1 ? " (" + (i + 1) + " of " + windows.length + ")" : "") + "…");
          const content = annotateRequest({from, to, nBars, bpb, kinds, budget, title});
          const out = await aiProvider().chat({system: ANNOTATE_SYS, messages: [{role: "user", content}], signal: ctl.signal, tools: [],
            onDelta: () => { if (api.aborted) ctl.abort(); }, onStatus: t => api.note(t)});
          replies.push({from, to, out});
        }
        if (api.aborted) { api.cancel(); S.annotateLast = {cancelled: true}; resolve(S.annotateLast); return; }
        if (S.songKey !== key) throw new Error("the song changed while the model was thinking — nothing written");
        let items = [];
        for (const r of replies) {
          try { items.push(...annotateValidate(annotateParse(r.out), {nBars, bpb, kinds})); }
          catch (err) { throw new Error((windows.length > 1 ? "bars " + r.from + "–" + r.to + ": " : "") + err.message); }
        }
        items = items.filter(it => it.bar >= 1 && it.bar <= nBars);
        const {accepted, skipped, merged} = annotateOverlaps(items, S.rollnotes, bpb);
        say("writing…");
        const written = annotateWrite(accepted, meta);
        S.annotateLast = {written, skipped: skipped.length, merged: merged.length, windows: windows.length, items: accepted, at: meta.at};
        api.update(0, {st: "done", pct: 1, msg: annotateSummary(S.annotateLast)});
        setInfo("✦ AI estimates: " + annotateSummary(S.annotateLast));
        resolve(S.annotateLast);
      } catch (err) {
        S.annotateLast = {error: err.message};
        reject(err);
        throw err; // the job shows ✗ with the same words
      } finally {
        S.annotateBusy = false;
      }
    });
  });
}
// ---- the sheet (#annotatesheet): checkboxes, Run, Clear, a status line.
// Nothing is written by opening it; the status names the gate reason when
// there is one (and Run is disabled), else how many tagged notes exist.
export function annotateRefresh() {
  const gate = annotateGate();
  const n = annotateCount();
  const clear = document.getElementById("annotateclear");
  clear.textContent = "Clear AI annotations" + (n ? " (" + n + ")" : "");
  clear.disabled = !n || !!S.annotateBusy;
  document.getElementById("annotaterun").disabled = !!gate || !!S.annotateBusy;
  const st = document.getElementById("annotatestatus");
  if (S.annotateBusy) st.textContent = "running — the footer ⏳ shows it; ✕ there stops it";
  else if (gate) st.textContent = "⚠ " + gate;
  else st.textContent = n ? n + " AI annotation" + (n === 1 ? "" : "s") + " on this song (marked ✦ AI in All notes)" : "nothing written yet — estimates land only when you tap Run";
}
export function openAnnotateSheet() {
  if (!analysisAvailable()) return; // Learning: the item is absent; a stray tap on the hidden button opens nothing
  annotateRefresh();
  document.getElementById("annotatesheet").classList.add("on");
}
export function annotateSay(t) { document.getElementById("annotatestatus").textContent = t; }
export async function annotateRunTap() {
  const kinds = {sections: !!document.getElementById("annotatesections").checked, chords: !!document.getElementById("annotatechords").checked, keys: !!document.getElementById("annotatekeys").checked};
  try {
    const p = annotateRun({kinds, say: annotateSay});
    annotateRefresh();
    const r = await p;
    annotateRefresh();
    annotateSay(r.cancelled ? "stopped — nothing written" : "✓ " + annotateSummary(r));
  } catch (err) {
    annotateRefresh();
    annotateSay("⚠ " + err.message);
  }
}
export async function annotateClearTap() {
  const n = annotateCount();
  if (!n) return;
  const ok = await appConfirm("Clear AI annotations?", "Removes all " + n + " annotation" + (n === 1 ? "" : "s") + " tagged ✦ AI from this song. Your own annotations stay. One undo brings them back.", "Clear", "Cancel");
  if (!ok) return;
  try {
    const removed = annotateClear();
    annotateRefresh();
    annotateSay("✓ removed " + removed + " AI annotation" + (removed === 1 ? "" : "s") + " — one undo brings them back");
    setInfo("✦ AI annotations cleared (" + removed + ") — undo brings them back");
  } catch (err) { annotateSay("⚠ " + err.message); }
}
export function initAnnotate1() {
  JOB_KINDS.annotate = {label: j => j.title};
  document.getElementById("vwAnnotate").addEventListener("click", () => { // Normal-only (the item is absent otherwise): closes View ▾ and opens the sheet — nothing written by looking
    document.getElementById("viewsheet").classList.remove("on");
    openAnnotateSheet();
  });
  document.getElementById("annotaterun").addEventListener("click", () => annotateRunTap());
  document.getElementById("annotateclear").addEventListener("click", () => annotateClearTap());
  document.getElementById("annotateclose").addEventListener("click", () => document.getElementById("annotatesheet").classList.remove("on"));
}
