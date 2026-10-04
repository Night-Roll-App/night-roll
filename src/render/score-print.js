import { S } from "../state.js";
import { VF, STAVE_H, SCORE_TOP, SCORE_INTRO_W, engraveMeasure, buildScoreModelImpl } from "./score.js";
import { songTitleOf, setInfo, logErr } from "../hooks.js";
import { deliverAudioFile } from "../audio/bounce.js";

// ------------------------------------------------- Export score (DAW F6)
// File ▾ → Export score…: the score view's model, engraved by score.js's one
// engraver into paged SVG sheets inside a single self-contained HTML file,
// handed over the same way Download audio is (deliverAudioFile: the iPad's
// share sheet → Print / Save to Files as PDF; a browser downloads it). No
// window.print() — modal, and the WKWebView has no print dialog; no in-app
// PDF writer — the page's own print path makes the PDF. Learning mode needs
// no branch: the pages carry exactly what the score view draws (declared key
// and meter, shown tracks), nothing is added.

// CSS px at 96/in: 8.5×11 in and 210×297 mm. `css` is the @page size keyword.
export const PAPER = {
  letter: {label: "Letter", w: 816, h: 1056, css: "letter"},
  a4: {label: "A4", w: 794, h: 1123, css: "A4"},
};
export const PRINT_MARGIN = 48;        // all four sides
export const PRINT_HEADER_H = 96;      // page 1: title + album line
export const PRINT_HEADER_H_NEXT = 40; // later pages: running title + page number
export const PRINT_SYSTEM_GAP = 28;    // between systems, under the last stave
export const PRINT_PXQ_MIN = 36;       // px per quarter on paper, never denser than the view's own floor

// Measures → systems → pages, pure. A system is a run of whole measures (a
// bar is never split); the first page may hold fewer systems than the rest
// (its title block). nMeasures ≤ 0 → no pages.
export function paginateScore(nMeasures, perSystem, firstPageSystems, nextPageSystems = null) {
  const nextCap = nextPageSystems == null ? firstPageSystems : nextPageSystems;
  const pages = [];
  let mi = 0;
  while (mi < nMeasures) {
    const cap = pages.length ? nextCap : firstPageSystems;
    const systems = [];
    while (systems.length < cap && mi < nMeasures) {
      const to = Math.min(nMeasures, mi + perSystem);
      systems.push({from: mi, to});
      mi = to;
    }
    pages.push(systems);
  }
  return pages;
}

// Page geometry for a score model on a paper size, pure. How many bars fit
// a system comes from the view's proportional bar width (pxqMin, the densest
// bar's own floor, never under PRINT_PXQ_MIN); the bars are then justified
// to fill the line, as engraved systems are. A bar wider than the paper
// prints alone, shrunk.
export function scorePageLayout(model, ppq, paper) {
  const p = PAPER[paper] || PAPER.letter;
  const contentW = p.w - 2 * PRINT_MARGIN;
  const pxq = Math.max(PRINT_PXQ_MIN, model.pxqMin || 0);
  const lineW = contentW - SCORE_INTRO_W; // the clef column rides the first bar
  const measuresPerSystem = Math.max(1, Math.floor(lineW / Math.ceil(model.bt / ppq * pxq)));
  const measureW = Math.floor(lineW / measuresPerSystem);
  const systemH = SCORE_TOP + model.staves.length * STAVE_H + PRINT_SYSTEM_GAP;
  const bodyH = p.h - 2 * PRINT_MARGIN;
  const firstPageSystems = Math.max(1, Math.floor((bodyH - PRINT_HEADER_H) / systemH));
  const nextPageSystems = Math.max(1, Math.floor((bodyH - PRINT_HEADER_H_NEXT) / systemH));
  return {paper: paper in PAPER ? paper : "letter", contentW, pxq, measureW, measuresPerSystem, systemH,
          pages: paginateScore(model.nMeasures, measuresPerSystem, firstPageSystems, nextPageSystems)};
}

// One <svg> per page, as markup. VexFlow's SVG backend engraves into a host
// div parked off-screen (attached: a display:none or detached host makes
// getBBox() report zeros for any text it measures). Black ink; each page's
// first system labels its staves with the track names.
export function engraveScorePages(layout) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:hidden";
  if (document.body) document.body.appendChild(host);
  try {
    return layout.pages.map(systems => {
      const h = systems.length * layout.systemH;
      const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
      renderer.resize(layout.contentW, h);
      const ctx2 = renderer.getContext();
      ctx2.setFillStyle("#000");
      ctx2.setStrokeStyle("#000");
      systems.forEach((sys, k) => {
        const y0 = k * layout.systemH;
        let x = 0;
        for (let mi = sys.from; mi < sys.to; mi++) {
          const first = mi === sys.from;
          const mw = first ? layout.measureW + SCORE_INTRO_W : layout.measureW;
          engraveMeasure(ctx2, mi, x, y0, mw, {ink: "#000", intro: first ? {time: mi === 0} : null});
          x += mw;
        }
        if (k === 0) {
          ctx2.setFont("Helvetica, Arial, sans-serif", 9, "");
          S.scoreModel.staves.forEach((st, si) => {
            const tr = S.song.tracks[st.ti];
            // baseline 12 px into the stave's 40 px headroom: above the treble clef's reach
            ctx2.fillText((tr && tr.name) || "Track " + (st.ti + 1), 2, y0 + SCORE_TOP + si * STAVE_H + 12);
          });
        }
      });
      const svg = host.querySelector ? host.querySelector("svg") : host.firstChild;
      svg.setAttribute("viewBox", "0 0 " + layout.contentW + " " + h);
      svg.setAttribute("width", layout.contentW);
      svg.setAttribute("height", h);
      const markup = typeof XMLSerializer === "function" ? new XMLSerializer().serializeToString(svg) : svg.outerHTML;
      host.innerHTML = "";
      return markup;
    });
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The standalone document: one .page section per SVG, @page sized to the
// paper with the page's own margins (so Safari/Chrome print it 1:1), no
// external reference of any kind — it must print from Files with no network.
export function scoreHtmlDocument({title, subtitle, paper, pages}) {
  const p = PAPER[paper] || PAPER.letter;
  const n = pages.length;
  const t = escapeHtml(title || "Untitled");
  const sheets = pages.map((svg, i) => {
    const head = i === 0
      ? `<header class="first"><h1>${t}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</header>`
      : `<header><span>${t}</span><span>${i + 1} / ${n}</span></header>`;
    const foot = i === 0 && n > 1 ? `<footer>1 / ${n}</footer>` : "";
    return `<section class="page">${head}\n${svg}\n${foot}</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t} — score</title>
<style>
@page { size: ${p.css}; margin: 0; }
html, body { margin: 0; padding: 0; background: #9a9a9a; color: #000; font-family: Georgia, "Times New Roman", serif; }
.page { box-sizing: border-box; width: ${p.w}px; height: ${p.h}px; padding: ${PRINT_MARGIN}px; margin: 0 auto 16px; background: #fff; position: relative; overflow: hidden; break-after: page; page-break-after: always; }
.page:last-child { break-after: auto; page-break-after: auto; }
header.first { height: ${PRINT_HEADER_H}px; text-align: center; }
header.first h1 { margin: 0 0 6px; font-size: 20pt; font-weight: 600; }
header.first p { margin: 0; font-size: 11pt; color: #333; }
header:not(.first) { height: ${PRINT_HEADER_H_NEXT}px; display: flex; justify-content: space-between; font-size: 8.5pt; color: #333; }
.page svg { display: block; }
footer { position: absolute; left: 0; right: 0; bottom: ${PRINT_MARGIN / 2}px; text-align: center; font-size: 8.5pt; color: #333; }
@media print { html, body { background: #fff; } .page { margin: 0; } }
</style>
</head>
<body>
${sheets}
</body>
</html>
`;
}

// The album line under the title: the catalog group the song belongs to
// (S.CATALOG is {albumTitle: [[title, path], …]}); a local draft has none.
export function scoreAlbumLine(key) {
  const cat = S.CATALOG || {};
  for (const [album, songs] of Object.entries(cat)) if (songs.some(([, p]) => p === key)) return album;
  return "";
}

// The whole flow. `engrave` is the SVG step — the vm harness has no VexFlow
// (the same gap that leaves S.scoreModel null there), so its test hands in a
// stand-in and checks everything around it; the app never passes one.
export async function exportScore(paper, engrave = engraveScorePages) {
  if (!S.song) { setInfo("open a song first"); return null; }
  if (!S.song.tracks.some(tr => tr.notes && tr.notes.some(n => !n.gone))) { setInfo("nothing to print — the song has no notes yet"); return null; }
  if (!S.scoreModel) buildScoreModelImpl(); // same layer: the body, not the hooks.js port (check.mjs rule 10)
  const m = S.scoreModel;
  if (!m || !m.staves.length) { setInfo("nothing to print — the score view has no staves to show"); return null; }
  const layout = scorePageLayout(m, S.song.ppq, paper);
  let pages;
  try { pages = engrave(layout); }
  catch (err) { logErr("Export score: " + (err && err.message || err)); return null; }
  const base = S.songKey ? S.songKey.split("/").pop().replace(/\.midi?$/i, "") : "song";
  const name = base + "-score.html";
  const html = scoreHtmlDocument({title: S.songKey ? songTitleOf(S.songKey) : "Untitled",
                                  subtitle: scoreAlbumLine(S.songKey), paper: layout.paper, pages});
  try { await deliverAudioFile(new Blob([html], {type: "text/html"}), name); }
  catch (err) { logErr("Export score: " + (err && err.message || err)); return null; }
  setInfo("score exported: " + name + " (" + pages.length + (pages.length === 1 ? " page" : " pages") + ")");
  return {name, html, pages: pages.length};
}
