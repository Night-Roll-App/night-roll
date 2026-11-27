import { S } from "../state.js";
import { barTicks } from "../model/rollnotes.js";
import { effTs } from "../model/grid.js";
import { trackIsDrums } from "../model/grid.js";
import { sfDeclaredAtRaw } from "../model/song.js";
import { SHARP_SPELL } from "../theory/chords.js";
import { spellFor } from "../theory/chords.js";
import { buildScoreModelFor } from "../render/score.js";
import { scorePageLayout, engraveScorePages, scoreHtmlDocument, scoreAlbumLine } from "../render/score-print.js";
import { trackShown } from "../render/roll.js";
import { trackColor } from "../render/roll.js";
import { writeMidi } from "../midi/write.js";
import { musicXmlDocument } from "../export/musicxml.js";
import { asciiTab } from "../export/tab.js";
import { deliverFiles } from "../audio/bounce.js";
import { setInfoImpl as setInfo } from "../ui/chrome.js"; // layer 4 → the impls, not the hooks.js ports (check.mjs rule 10)
import { logErrImpl as logErr } from "../ui/chrome.js";
import { songTitleOfImpl as songTitleOf } from "../ask/context.js";
import { closeFileMenus } from "../ui/chrome.js";
import { countUsage } from "../platform/usage.js";

// ------------------------------------------- Export score / tab (phase 1)
// File ▾ → Export score / tab… (docs/plans/2026-11-27-score-tab-export.md §3,
// §5, §6 phase 1 as the review cut it): the open song, a part filter, four
// formats — pages (the printable HTML of SVGs Export score already made),
// MusicXML with a TAB staff, ASCII tab (one .txt per melodic part), MIDI —
// one share sheet for every file. Whole albums, the index page and the job
// are phase 2; TAB engraved under the staff on the pages is phase 2 too (no
// dead toggle here until then). Read-only: nothing here touches the song.
//
// Learning mode (plan §4): the pages are what the score view draws; MusicXML
// and tab take key only from sfDeclaredAtRaw (never sfAt's Normal-mode
// estimate, never the key dial's preview), meter digits only when
// S.declaredTs, no chord or section names at all.

export const EXPORT_PREFS_KEY = "ff1roll-export"; // device prefs: formats + split; paper keeps Export score's own key
export const EXPORT_FORMATS = ["pages", "musicxml", "tab", "midi"];
export const EXPORT_MIME = {pages: "text/html", musicxml: "application/vnd.recordare.musicxml+xml", tab: "text/plain", midi: "audio/midi"};

export function exportPrefs() { // {pages, musicxml, tab, midi, split, paper}
  let p = {};
  try { p = JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY) || "{}") || {}; } catch (err) { p = {}; }
  let paper = "letter";
  try { paper = localStorage.getItem("ff1roll-score-paper") || "letter"; } catch (err) { /* private mode */ }
  return {pages: p.pages !== false, musicxml: p.musicxml !== false, tab: p.tab !== false, midi: p.midi === true, // Q8: MIDI off by default
          split: p.split === "per_part" ? "per_part" : "together", paper: paper === "a4" ? "a4" : "letter"};
}
export function exportPrefsSave(patch) {
  const p = {...exportPrefs(), ...(patch || {})};
  try { localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify({pages: p.pages, musicxml: p.musicxml, tab: p.tab, midi: p.midi, split: p.split})); } catch (err) {}
  try { localStorage.setItem("ff1roll-score-paper", p.paper); } catch (err) {}
  return p;
}

// Which tracks a parts word means: "shown" = the score view's own set (H
// flag, hide-drums), "all" = every note track, or explicit indices. Audio
// clips never have a staff.
export function exportPartsOf(parts) {
  const all = S.song.tracks.map((tr, ti) => ti).filter(ti => S.song.tracks[ti].kind !== "audio");
  if (parts === "all") return all;
  if (Array.isArray(parts)) return all.filter(ti => parts.includes(ti));
  return all.filter(ti => trackShown(ti));
}
export function exportTabTracksOf(tabFor, parts) { // melodic = every chosen non-drum track; drums never get tab
  const melodic = parts.filter(ti => !trackIsDrums(ti));
  return Array.isArray(tabFor) ? melodic.filter(ti => tabFor.includes(ti)) : melodic;
}
export function exportSafeName(s) { // a title into a file name: fileNameFor only encodes / % |; Files tolerates the rest, a picked Windows folder doesn't
  return String(s == null ? "" : s).replace(/[\/\\:?"*<>|%]+/g, "-").replace(/\s+/g, " ").trim() || "part";
}
export function exportFileBase() { return S.songKey ? S.songKey.split("/").pop().replace(/\.midi?$/i, "") : "song"; }
export function exportTrackName(ti) { const tr = S.song.tracks[ti]; return (tr && tr.name) || "Track " + (ti + 1); }

// The files for a request, from S (the open song): [{name, mime, data}].
// req = {parts: "shown"|"all"|[ti…], split: "together"|"per_part",
// formats: {pages, musicxml, tab, midi}, tab_for: "melodic"|[ti…], paper}.
// `engrave` is the SVG step (VexFlow — absent in the vm harness, which hands
// in a stand-in); throws an Error whose message is the refusal line.
export function buildExportFiles(req, {engrave = engraveScorePages} = {}) {
  if (!S.song) throw new Error("open a song first");
  if (!S.song.tracks.some(tr => tr.notes && tr.notes.some(n => !n.gone))) throw new Error("nothing to export — the song has no notes yet");
  const formats = req.formats || {pages: true, musicxml: true, tab: true};
  if (!EXPORT_FORMATS.some(f => formats[f])) throw new Error("pick at least one format");
  const parts = exportPartsOf(req.parts || "shown");
  if (!parts.length) throw new Error("no parts chosen — the score view shows no track");
  const tabTracks = exportTabTracksOf(req.tab_for || "melodic", parts);
  const groups = req.split === "per_part" ? parts.map(ti => [ti]) : [parts];
  const title = S.songKey ? songTitleOf(S.songKey) : "Untitled";
  const album = scoreAlbumLine(S.songKey);
  const base = exportFileBase();
  const bt = barTicks(), ppq = S.song.ppq;
  const keyAt = tick => sfDeclaredAtRaw(tick); // committed declarations only — review blocker 3
  const spellAt = tick => { const sf = sfDeclaredAtRaw(tick); return sf === null ? SHARP_SPELL : spellFor(sf); }; // as engraveMeasure spells
  const tempoBpm = S.song.tempos && S.song.tempos.length ? Math.round(6e7 / S.song.tempos[0].usq) : null;
  const files = [];
  for (const group of groups) {
    const set = new Set(group);
    const model = buildScoreModelFor(set);
    if (!model.staves.length) continue;
    const suffix = req.split === "per_part" ? " — " + exportSafeName(exportTrackName(group[0])) : "";
    const trackNames = model.staves.map(st => exportTrackName(st.ti));
    if (formats.pages) {
      const layout = scorePageLayout(model, ppq, req.paper || "letter");
      const pages = engrave(layout, model);
      files.push({name: base + suffix + "-score.html", mime: EXPORT_MIME.pages,
                  data: scoreHtmlDocument({title, subtitle: album, paper: layout.paper, pages})});
    }
    if (formats.musicxml) {
      files.push({name: base + suffix + ".musicxml", mime: EXPORT_MIME.musicxml,
                  data: musicXmlDocument({title, album, ppq, bt, ts: effTs(), declaredTs: S.declaredTs, staves: model.staves, trackNames,
                                          tempos: S.song.tempos, keyAt, spellAt, tab: {tracks: new Set(tabTracks)}})});
    }
    if (formats.tab) {
      for (const st of model.staves) {
        if (st.drums || !tabTracks.includes(st.ti)) continue;
        files.push({name: base + "-" + exportSafeName(exportTrackName(st.ti)) + "-tab.txt", mime: EXPORT_MIME.tab,
                    data: asciiTab({title, track: exportTrackName(st.ti), measures: st.measures, bt, ppq, tempoBpm, declaredTs: S.declaredTs})});
      }
    }
    if (formats.midi) {
      files.push({name: base + suffix + ".mid", mime: EXPORT_MIME.midi,
                  data: writeMidi({...S.song, tracks: S.song.tracks.filter((tr, ti) => set.has(ti))})});
    }
  }
  if (!files.length) throw new Error("nothing to export — no staff for those parts");
  return files;
}

// The whole flow: build, one share sheet (or one download per file), the
// status line. Returns {files: [names]} or null after a refusal.
export async function runScoreExport(req, {engrave = engraveScorePages} = {}) {
  let files;
  try { files = buildExportFiles(req, {engrave}); }
  catch (err) { setInfo(err && err.message || String(err)); return null; }
  try { await deliverFiles(files); }
  catch (err) { logErr("Export score / tab: " + (err && err.message || err)); return null; }
  countUsage("export.score-tab");
  const names = files.map(f => f.name);
  setInfo("exported " + names.length + (names.length === 1 ? " file: " : " files: ") + names.join(", "));
  return {files: names};
}

// The Ask action's words → a request (the registry's `export`): lists may
// come as arrays or comma/space-separated strings; track names resolve
// through `findTrack` (askFindTrackIndex — an unknown name is its error).
export function exportReqFromWords(a, findTrack) {
  const words = v => Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : String(v).split(/[,;]+|\s+and\s+/).map(x => x.trim()).filter(Boolean);
  const given = v => v !== undefined && v !== null && v !== "";
  const what = given(a.what) ? String(a.what).trim().toLowerCase() : "song";
  if (what !== "song") throw new Error(what === "album" || what === "folder" ? "album export comes in the next build — say \"export\" for this song" : "what must be song (album and folder come in the next build)");
  const p = exportPrefs();
  const req = {parts: "shown", split: p.split, formats: {pages: p.pages, musicxml: p.musicxml, tab: p.tab, midi: p.midi}, tab_for: "melodic", paper: p.paper};
  if (given(a.formats)) {
    const fs = words(a.formats).map(w => w.toLowerCase().replace(/^music ?xml$/, "musicxml").replace(/^(score|sheet music|html)$/, "pages").replace(/^(mid|midi file)$/, "midi"));
    const bad = fs.filter(f => !EXPORT_FORMATS.includes(f));
    if (bad.length) throw new Error("formats must be from pages, musicxml, tab, midi — not " + bad.join(", "));
    req.formats = {pages: fs.includes("pages"), musicxml: fs.includes("musicxml"), tab: fs.includes("tab"), midi: fs.includes("midi")};
  }
  if (given(a.parts)) {
    const w = Array.isArray(a.parts) ? a.parts : String(a.parts).trim();
    const one = typeof w === "string" ? w.toLowerCase() : null;
    if (one === "shown" || one === "as shown") req.parts = "shown";
    else if (one === "all") req.parts = "all";
    else req.parts = words(w).map(findTrack);
  }
  if (given(a.split)) {
    const s = String(a.split).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!/^(together|per_part|each|separate|per_track)$/.test(s)) throw new Error("split must be together or per_part");
    req.split = s === "together" ? "together" : "per_part";
  }
  if (given(a.tab_for)) {
    const w = Array.isArray(a.tab_for) ? a.tab_for : String(a.tab_for).trim();
    req.tab_for = typeof w === "string" && /^(melodic|all)$/i.test(w) ? "melodic" : words(w).map(findTrack);
  }
  if (given(a.paper)) {
    const pp = String(a.paper).trim().toLowerCase();
    if (pp !== "letter" && pp !== "a4") throw new Error("paper must be letter or a4");
    req.paper = pp;
  }
  return req;
}

// ---- the sheet (#exportsheet, an .overlay like #stemssheet): six rows, the
// usual run is two taps — open, Export. Formats/split/paper are device prefs;
// parts and tab-for are per song (S.exportSheet), reset to "as shown" on open.
export function exportSheetOpen() {
  if (!S.song) { setInfo("open a song first"); return; }
  const p = exportPrefs();
  const parts = exportPartsOf("shown");
  S.exportSheet = {parts: new Set(parts), tab: new Set(exportTabTracksOf("melodic", parts)), split: p.split};
  document.getElementById("exTitle").textContent = (S.songKey ? songTitleOf(S.songKey) : "Untitled") + " — this song";
  document.getElementById("exFmtPages").checked = p.pages;
  document.getElementById("exFmtMusicxml").checked = p.musicxml;
  document.getElementById("exFmtTab").checked = p.tab;
  document.getElementById("exFmtMidi").checked = p.midi;
  document.getElementById("exPaper").value = p.paper;
  exportSheetRender();
  document.getElementById("exportsheet").classList.add("on");
}
export function exportSheetClose() { document.getElementById("exportsheet").classList.remove("on"); }
export function exportSheetRender() { // the chips: every note track; ticked = included; drums say kit; tab chips = the chosen melodic tracks
  const sh = S.exportSheet;
  if (!sh || !S.song) return;
  // built as elements (not one innerHTML string) so each chip owns its tap — the same shape the Mixer renders with
  const fill = (box, tis, set, cls, onTap, empty) => {
    box.innerHTML = "";
    if (!tis.length) { const s = document.createElement("span"); s.className = "lbl"; s.textContent = empty; box.appendChild(s); return; }
    for (const ti of tis) {
      const on = set.has(ti);
      const b = document.createElement("button");
      b.className = "chip " + cls + (on ? " selected" : " off");
      b.dataset.ti = String(ti);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.innerHTML = '<span class="dot" style="background:' + trackColor(ti) + '"></span>' + (on ? "✓ " : "") + exportTrackName(ti).replace(/&/g, "&amp;").replace(/</g, "&lt;") + (trackIsDrums(ti) ? " · kit" : "");
      b.addEventListener("click", () => onTap(ti));
      box.appendChild(b);
    }
  };
  const all = exportPartsOf("all");
  fill(document.getElementById("exParts"), all, sh.parts, "expart", ti => {
    if (sh.parts.has(ti)) { sh.parts.delete(ti); sh.tab.delete(ti); }
    else { sh.parts.add(ti); if (!trackIsDrums(ti)) sh.tab.add(ti); }
    exportSheetRender();
  }, "no note tracks");
  const melodic = all.filter(ti => sh.parts.has(ti) && !trackIsDrums(ti));
  fill(document.getElementById("exTab"), melodic, sh.tab, "extab", ti => {
    if (sh.tab.has(ti)) sh.tab.delete(ti); else sh.tab.add(ti);
    exportSheetRender();
  }, "no melodic part chosen");
  document.getElementById("exSplit").classList.toggle("on", sh.split === "per_part");
  document.getElementById("exSplit").setAttribute("aria-pressed", sh.split === "per_part" ? "true" : "false");
}
export function exportSheetRead() { // the request the sheet describes; saves the device prefs as it goes
  const sh = S.exportSheet || {parts: new Set(exportPartsOf("shown")), tab: new Set(), split: "together"};
  const p = exportPrefsSave({
    pages: document.getElementById("exFmtPages").checked, musicxml: document.getElementById("exFmtMusicxml").checked,
    tab: document.getElementById("exFmtTab").checked, midi: document.getElementById("exFmtMidi").checked,
    split: sh.split, paper: document.getElementById("exPaper").value === "a4" ? "a4" : "letter"});
  return {parts: [...sh.parts], split: sh.split, formats: {pages: p.pages, musicxml: p.musicxml, tab: p.tab, midi: p.midi}, tab_for: [...sh.tab], paper: p.paper};
}
export function initExport1() {
  document.getElementById("filedlscore").addEventListener("click", () => { closeFileMenus(); exportSheetOpen(); });
  document.getElementById("exShown").addEventListener("click", () => {
    if (!S.exportSheet) return;
    const parts = exportPartsOf("shown");
    S.exportSheet.parts = new Set(parts); S.exportSheet.tab = new Set(exportTabTracksOf("melodic", parts));
    exportSheetRender();
  });
  document.getElementById("exAll").addEventListener("click", () => {
    if (!S.exportSheet) return;
    const parts = exportPartsOf("all");
    S.exportSheet.parts = new Set(parts); S.exportSheet.tab = new Set(exportTabTracksOf("melodic", parts));
    exportSheetRender();
  });
  document.getElementById("exSplit").addEventListener("click", () => {
    if (!S.exportSheet) return;
    S.exportSheet.split = S.exportSheet.split === "per_part" ? "together" : "per_part";
    exportPrefsSave({split: S.exportSheet.split});
    exportSheetRender();
  });
  document.getElementById("exGo").addEventListener("click", async () => {
    const req = exportSheetRead();
    exportSheetClose();
    await runScoreExport(req);
  });
}
