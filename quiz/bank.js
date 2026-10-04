// quiz/bank.js — quizzes.md → sections → questions. Pure: no DOM, no fetch
// of its own (fetchBank takes the fetch function), nothing imported from the
// app (docs/plans/2026-10-04-quiz.md, "Isolation").
//
// The bank file holds QUESTIONS ONLY, on purpose ("Answers aren't written
// here… they live in the analysis docs, and in Josh"). Nothing here invents
// one: the parser carries text through, and the page self-grades.
//
// Shape: a `##`/`###` heading opens a section; a `- ` list item opens a
// question, indented lines continue it, a blank line ends it. The leading
// `[ ]`/`[x]`/`[~]` mark is read and reported, never written back. The
// "## Protocol" section (and its ### children — the streak rule and ledger)
// is instructions for Claude, not questions; its list items are skipped.

export const MARKS = {" ": "new", "x": "good", "~": "shaky"};
// candidates in the order the page tries them: the tidy moves quizzes.md to
// docs/learning/ (docs/plans/2026-10-04-repo-tidy.md); either order of landing works
export const BANK_PATHS = ["../docs/learning/quizzes.md", "../quizzes.md"];

// FNV-1a over the normalized text: the id a question keeps across edits to
// the file's whitespace and across reorderings, so SRS state follows it
export function bankId(text) {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "q" + h.toString(16).padStart(8, "0");
}

// A trailing parenthetical with no question in it is a note ABOUT the item
// ("Answered 2026-08-06…", "Explained before Josh could generate it…"), not
// part of what is asked — the page keeps it behind a tap until after the
// grade, so a logged answer never pre-empts the retrieval moment. A trailing
// paren that itself asks something ("…; why?)") stays in the question.
export function splitNote(text) {
  const t = text.trim();
  if (!t.endsWith(")")) return {text: t, note: ""};
  let depth = 0, open = -1;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ")") depth++;
    else if (t[i] === "(") { depth--; if (depth === 0) { open = i; break; } }
  }
  if (open <= 0) return {text: t, note: ""};
  const inner = t.slice(open + 1, -1).trim();
  if (!/^[A-Z]/.test(inner) || inner.includes("?")) return {text: t, note: ""};
  return {text: t.slice(0, open).trim(), note: inner};
}

export function parseBank(md) {
  const sections = [];
  let sec = null, q = null, inProtocol = false;
  const close = () => {
    if (!q) return;
    const {text, note} = splitNote(q.raw.replace(/\s+/g, " "));
    q.text = text; q.note = note; q.id = bankId(text);
    delete q.raw;
    sec.questions.push(q);
    q = null;
  };
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{2,3}) (.*\S)\s*$/);
    if (h) {
      close();
      if (h[1].length === 2) inProtocol = /^protocol\b/i.test(h[2]);
      sec = {title: h[2], level: h[1].length, protocol: inProtocol, questions: []};
      sections.push(sec);
      continue;
    }
    if (!sec || inProtocol) continue;
    const item = line.match(/^- (?:\[([ x~])\] )?(.*)$/);
    if (item) {
      close();
      q = {mark: item[1] ? MARKS[item[1]] : "none", section: sec.title, raw: item[2]};
      continue;
    }
    if (q && /^\s{2,}\S/.test(line)) { q.raw += " " + line.trim(); continue; }
    if (q && !line.trim()) close();
  }
  close();
  const questions = sections.flatMap(s => s.questions);
  return {sections, questions, bankSections: sections.filter(s => !s.protocol)};
}

// first path that answers 2xx wins; a 404 or a network error falls through
// to the next. Throws only when every candidate failed.
export async function fetchBank(fetchFn, paths = BANK_PATHS) {
  const errors = [];
  for (const path of paths) {
    try {
      const r = await fetchFn(path, {cache: "no-cache"});
      if (r.ok) return {path, text: await r.text()};
      errors.push(path + ": " + r.status);
    } catch (err) { errors.push(path + ": " + (err && err.message || err)); }
  }
  throw new Error("quiz bank not found — " + errors.join("; "));
}
