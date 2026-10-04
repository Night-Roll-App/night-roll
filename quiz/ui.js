// quiz/ui.js — the only quiz file that touches `document`. Three views
// (home, bank, drills) rendered into one <main>; every button is a tap
// target of 44 px or more; no native dialogs (CLAUDE.md). Grading rules,
// drill generation and audio live in srs.js / drills.js / tone.js — this
// file only wires them to elements.
//
// Learning mode: the bank never shows an answer (the file has none; a
// logged "Answered …" note is behind a tap, after the grade), and a drill
// never reveals its answer on a miss — the wrong choice dims and the
// learner keeps going until the right one, so every hit is retrieval, not
// recognition of a reveal. The streak counts first-try hits only.
import { pickNext, grade, entry, dueCount, boxHistogram, BOX_DAYS, BOXES, DAY } from "./srs.js";
import { DRILLS, genDrill, checkAnswer, levelFor, MAX_LEVEL } from "./drills.js";
import { pianoGeom, pianoIsWhite, pianoWhiteIndex, pianoWhiteName } from "../src/ui/piano.js";

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "onclick") el.addEventListener("click", v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid.nodeType ? kid : String(kid));
  return el;
};
const MARK_WORD = {new: "not yet asked", good: "answered well before", shaky: "shaky — re-ask", none: "unmarked"};
const restsFor = ms => ms < DAY ? "today" : ms < 2 * DAY ? "a day" : Math.round(ms / DAY) + " days";

export function initQuizUi(o) {
  // o: {root, status, nav, bank, bankPath, bankError, srs, prefs, saveSrs, savePrefs, tone, VF, rnd, now, storageOk}
  const st = {view: o.prefs.view || "home", q: null, graded: null, shown: new Set(), drill: null, tried: new Set(), kind: o.prefs.kind || DRILLS[0].kind};
  const streaks = o.prefs.streaks || {};
  const questions = o.bank ? o.bank.questions : [];

  function setStatus(text) { o.status.textContent = text; }
  function go(view) {
    st.view = view; o.prefs.view = view; o.savePrefs();
    for (const b of o.nav.querySelectorAll("button")) b.classList.toggle("on", b.dataset.view === view);
    render();
  }
  for (const b of o.nav.querySelectorAll("button")) b.addEventListener("click", () => go(b.dataset.view));

  function render() {
    o.root.replaceChildren();
    if (st.view === "bank") renderBank();
    else if (st.view === "drills") renderDrills();
    else renderHome();
  }

  // ---- home ---------------------------------------------------------------
  function renderHome() {
    const due = dueCount(o.srs, questions, o.now());
    const hist = boxHistogram(o.srs, questions);
    const max = Math.max(1, ...hist);
    o.root.append(
      h("div", {class: "card"},
        h("h2", {}, "Bank", h("span", {class: "count"}, questions.length + " questions · " + due + " due")),
        o.bankError ? h("p", {class: "error"}, o.bankError)
          : h("p", {class: "dim"}, "quizzes.md's questions, one at a time, self-graded. Answers are not in the file and never on this page — that is the point."),
        questions.length ? h("div", {class: "boxes"}, hist.map((n, i) => h("div", {class: n ? "lit" : "", style: "height:" + Math.max(3, Math.round(40 * n / max)) + "px"}, h("span", {}, n)))) : null,
        questions.length ? h("div", {class: "boxlabels"}, BOX_DAYS.map((d, i) => h("span", {}, "box " + i + (d ? " · " + d + "d" : "")))) : null,
        h("div", {class: "row end"}, h("button", {class: "primary big", onclick: () => go("bank"), disabled: questions.length ? null : ""}, due ? "Start — " + due + " due" : "Nothing due · practice anyway")),
      ),
      h("div", {class: "card"},
        h("h2", {}, "Drills", h("span", {class: "count"}, "generated · never about a song")),
        h("p", {class: "dim"}, "Intervals by ear, on the staff and on the keys; chord qualities; scale degrees; key signatures; spelling in a key. Five first-try hits in a row open the next level."),
        h("div", {class: "chips", style: "margin-top:10px"}, DRILLS.map(d => h("button", {onclick: () => { st.kind = d.kind; o.prefs.kind = d.kind; o.savePrefs(); st.drill = null; go("drills"); }}, d.label + " · L" + levelFor(streaks[d.kind] || 0)))),
      ),
    );
    setStatus((o.bankPath ? "bank: " + o.bankPath.replace(/^\.\.\//, "") : "no bank loaded") + (o.storageOk ? " · progress kept on this device only" : " · storage blocked — progress will not be kept"));
  }

  // ---- bank ---------------------------------------------------------------
  function nextQuestion(force) {
    st.graded = null;
    st.q = pickNext(o.srs, questions, o.now(), o.rnd, st.shown);
    if (!st.q && force) { // practice past "due": lowest box first among what this sitting has not shown
      const rest = questions.filter(q => !st.shown.has(q.id));
      const pool = rest.length ? rest : questions;
      if (!rest.length) st.shown.clear();
      st.q = pool.map(q => ({q, e: entry(o.srs, q.id, q.mark), r: o.rnd()})).sort((a, b) => a.e.box - b.e.box || a.e.last - b.e.last || a.r - b.r)[0]?.q || null;
    }
    if (st.q) st.shown.add(st.q.id);
  }
  function renderBank() {
    if (!questions.length) { o.root.append(h("div", {class: "card"}, h("p", {class: "error"}, o.bankError || "The bank is empty."))); return; }
    if (!st.q) nextQuestion(false);
    if (!st.q) {
      o.root.append(h("div", {class: "card stack"},
        h("h2", {}, "Nothing due"),
        h("p", {class: "dim"}, "Every question is resting in its box. Come back when the next one is due, or practice anyway (grades still count)."),
        h("div", {class: "row end"}, h("button", {onclick: () => go("home")}, "Home"), h("button", {class: "primary", onclick: () => { nextQuestion(true); render(); }}, "Practice anyway")),
      ));
      setStatus(questions.length + " questions · 0 due");
      return;
    }
    const q = st.q, e = entry(o.srs, q.id, q.mark);
    const card = h("div", {class: "card"},
      h("div", {class: "meta"}, h("span", {class: "badge " + q.mark}, MARK_WORD[q.mark]), h("span", {}, "box " + e.box), h("span", {}, e.seen ? "asked " + e.seen + "×" : "first time"), h("span", {}, q.section)),
      h("p", {class: "question"}, q.text),
    );
    if (!st.graded) {
      card.append(
        h("p", {class: "dim", style: "margin-bottom:8px"}, "Answer out loud or on paper, then grade yourself:"),
        h("div", {class: "grades"},
          h("button", {class: "big right", onclick: () => doGrade("got")}, "Got it"),
          h("button", {class: "big gold", onclick: () => doGrade("shaky")}, "Shaky"),
          h("button", {class: "big wrong", style: "opacity:1", onclick: () => doGrade("missed")}, "Missed"),
        ),
        h("div", {class: "row end", style: "margin-top:10px"}, h("button", {onclick: () => { nextQuestion(true); render(); }}, "Skip")),
      );
    } else {
      const g = st.graded;
      card.append(
        h("p", {class: "feedback " + (g.result === "got" ? "ok" : g.result === "missed" ? "bad" : "")},
          (g.result === "got" ? "Got it" : g.result === "shaky" ? "Shaky" : "Missed") + " → box " + g.e.box + " · back in " + restsFor(g.e.due - o.now()) + (g.e.streak > 1 ? " · streak " + g.e.streak : "")),
        q.note ? h("div", {class: "row", style: "margin-top:10px"}, h("button", {onclick: ev => { ev.currentTarget.replaceWith(h("div", {class: "note"}, q.note)); }}, "Show the file's note")) : null,
        h("div", {class: "row end", style: "margin-top:12px"}, h("button", {onclick: () => go("home")}, "Home"), h("button", {class: "primary big", onclick: () => { nextQuestion(true); render(); }}, "Next")),
      );
    }
    o.root.append(card);
    setStatus(dueCount(o.srs, questions, o.now()) + " due of " + questions.length + " · " + st.shown.size + " shown this sitting");
  }
  function doGrade(result) {
    const e = grade(o.srs, st.q.id, result, o.now(), st.q.mark);
    o.saveSrs();
    st.graded = {result, e};
    render();
  }

  // ---- drills -------------------------------------------------------------
  const kindDef = () => DRILLS.find(d => d.kind === st.kind) || DRILLS[0];
  function newDrill() {
    st.drill = genDrill(st.kind, levelFor(streaks[st.kind] || 0), o.rnd);
    st.tried = new Set();
    st.solved = false;
  }
  function renderDrills() {
    const def = kindDef();
    if (!st.drill || st.drill.kind !== st.kind) newDrill();
    const d = st.drill, streak = streaks[st.kind] || 0, level = levelFor(streak);
    const chips = h("div", {class: "chips"}, DRILLS.map(x => h("button", {class: x.kind === st.kind ? "on" : "", onclick: () => { st.kind = x.kind; o.prefs.kind = x.kind; o.savePrefs(); newDrill(); render(); }}, x.label)));
    const card = h("div", {class: "card"},
      h("div", {class: "meta"}, h("span", {class: "badge"}, "level " + level + " / " + MAX_LEVEL), h("span", {}, "streak " + streak), h("span", {}, level < MAX_LEVEL ? (5 - streak % 5) + " more to level " + (level + 1) : "top level")),
      h("p", {class: "prompt"}, d.prompt),
    );
    if (def.ear) {
      const hear = h("button", {class: "primary big", style: "width:100%", onclick: () => playDrill(d)}, "▶ Hear it");
      card.append(hear);
      if (!o.tone.available()) card.append(h("p", {class: "error", style: "margin-top:8px"}, "This browser has no WebAudio — the ear drills are silent here."));
    } else if (def.sight === "staff") {
      const box = h("div", {class: "staff"});
      card.append(box);
      requestAnimationFrame(() => drawStaff(box, d.notes));
    } else if (def.sight === "keys") {
      const cv = h("canvas", {class: "keys", "aria-label": "two highlighted piano keys"});
      card.append(cv);
      requestAnimationFrame(() => drawKeys(cv, d.notes));
    }
    const choices = h("div", {class: "choices"}, d.choices.map(c => h("button", {
      class: st.solved && c.value === d.answer ? "right" : st.tried.has(c.value) ? "wrong" : "",
      disabled: st.solved || st.tried.has(c.value) ? "" : null,
      onclick: () => answer(c.value),
    }, c.label)));
    const fb = h("p", {class: "feedback " + (st.solved ? "ok" : st.tried.size ? "bad" : "")},
      st.solved ? "✓ " + d.choices.find(c => c.value === d.answer).label + (st.tried.size ? " — on try " + (st.tried.size + 1) : "")
        : st.tried.size ? "✗ not that one — keep going" : "");
    card.append(choices, fb);
    if (st.solved) card.append(h("div", {class: "row end"}, h("button", {class: "primary big", onclick: () => { newDrill(); render(); if (def.ear) playDrill(st.drill); }}, "Next")));
    o.root.append(chips, card);
    setStatus(def.label + " · level " + level + " · first-try streak " + streak);
  }
  function playDrill(d) {
    if (!o.tone.play(d.play)) setStatus("audio unavailable in this browser");
  }
  function answer(value) {
    const d = st.drill;
    if (checkAnswer(d, value)) {
      st.solved = true;
      streaks[st.kind] = st.tried.size ? 0 : (streaks[st.kind] || 0) + 1;
    } else {
      st.tried.add(value);
      streaks[st.kind] = 0;
    }
    o.prefs.streaks = streaks; o.savePrefs();
    render();
  }

  // VexFlow is the page's classic <script> global (vendor/vexflow.js); when it
  // is missing the drill says so instead of failing the page
  function drawStaff(box, notes) {
    const VF = o.VF;
    if (!VF) { box.append(h("p", {}, "Staff drawing needs vendor/vexflow.js, which did not load — try the keys or ear drills.")); return; }
    try {
      const W = Math.max(240, Math.min(box.clientWidth || 320, 480)), H = 150;
      const r = new VF.Renderer(box, VF.Renderer.Backends.SVG);
      r.resize(W, H);
      const ctx = r.getContext();
      const stave = new VF.Stave(8, 20, W - 16);
      stave.addClef("treble").setContext(ctx).draw();
      const NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"]; // no key → sharps, the app's own no-key convention
      const sn = notes.map(m => {
        const n = NAMES[m % 12], oct = Math.floor(m / 12) - 1;
        const note = new VF.StaveNote({keys: [n[0] + "/" + oct], duration: "h"});
        if (n[1]) note.addModifier(new VF.Accidental("#"), 0);
        return note;
      });
      VF.Formatter.FormatAndDraw(ctx, stave, sn);
    } catch (err) {
      box.replaceChildren(h("p", {}, "Staff drawing failed: " + (err && err.message || err)));
    }
  }
  // the app's own key geometry (src/ui/piano.js, DOM-free): a window of the
  // 88 keys scrolled so the lower note sits one white in from the left
  function drawKeys(cv, notes) {
    const dpr = globalThis.devicePixelRatio || 1;
    const W = cv.clientWidth || 320, H = 120;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext("2d");
    c.scale(dpr, dpr);
    const g = pianoGeom(W, H, Math.max(0, pianoWhiteIndex(notes[0]) - 1));
    const lit = p => p === notes[0] ? "#5B78E8" : p === notes[1] ? "#E4C36A" : null;
    for (const p of g.whites) {
      c.fillStyle = lit(p) || "#E8ECF5";
      c.fillRect(g.wx[p], 0, g.wW, H);
      c.strokeStyle = "#242C48"; c.strokeRect(g.wx[p] + 0.5, 0.5, g.wW - 1, H - 1);
      if (p % 12 === 0) { c.fillStyle = lit(p) ? "#fff" : "#6B77A0"; c.font = "11px ui-monospace, Menlo, monospace"; c.textAlign = "center"; c.fillText(pianoWhiteName(p), g.wx[p] + g.wW / 2, H - 8); }
    }
    for (let p = g.lo; p <= g.hi; p++) {
      if (pianoIsWhite(p)) continue;
      c.fillStyle = lit(p) || "#10131F";
      c.fillRect(g.keyX(p), 0, g.bw, g.bh);
    }
  }

  go(st.view);
  return {render, go};
}
