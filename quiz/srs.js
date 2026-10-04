// quiz/srs.js — Leitner scheduling for the bank, pure. Five boxes; a box's
// interval is how long a question rests after a "got it" there. The grade
// vocabulary is the page's three buttons: got / shaky / missed — "shaky" is
// quizzes.md's `[~]` ("re-ask fresh"), so it lands in box 1, not 0.
//
// State is one plain object ({v, q: {id: entry}}) the page keeps under the
// device-local key ff1roll-quiz-srs; nothing here touches storage.

export const BOXES = 5;
export const BOX_DAYS = [0, 1, 3, 7, 21]; // box 0 = again this sitting
export const DAY = 86400000;

export function emptySrs() { return {v: 1, q: {}}; }

// a question's first box comes from its mark in the file: answered well
// before → box 2, shaky → box 1, never asked (or unmarked) → box 0
export function startBox(mark) { return mark === "good" ? 2 : mark === "shaky" ? 1 : 0; }

export function entry(srs, id, mark) {
  return srs.q[id] || {box: startBox(mark), due: 0, last: 0, seen: 0, streak: 0};
}

export function grade(srs, id, result, now, mark) {
  const e = {...entry(srs, id, mark)};
  if (result === "got") { e.box = Math.min(BOXES - 1, e.box + 1); e.streak += 1; }
  else if (result === "shaky") { e.box = 1; e.streak = 0; }
  else if (result === "missed") { e.box = 0; e.streak = 0; }
  else throw new Error("grade: unknown result " + result);
  e.last = now; e.seen += 1;
  e.due = now + BOX_DAYS[e.box] * DAY;
  srs.q[id] = e;
  return e;
}

export function isDue(e, now) { return !e.last || e.due <= now; }

export function dueCount(srs, questions, now) {
  return questions.filter(q => isDue(entry(srs, q.id, q.mark), now)).length;
}

// quizzes.md's pick order: lowest box first, then longest since last asked
// (never asked = longest of all); ties are broken at random so the same
// first question does not come up every visit. `exclude` holds the ids
// already shown this sitting. Returns null when nothing is due.
export function pickNext(srs, questions, now, rnd = Math.random, exclude = new Set()) {
  const due = questions.filter(q => !exclude.has(q.id) && isDue(entry(srs, q.id, q.mark), now));
  if (!due.length) return null;
  const keyed = due.map(q => ({q, e: entry(srs, q.id, q.mark), r: rnd()}));
  keyed.sort((a, b) => a.e.box - b.e.box || a.e.last - b.e.last || a.r - b.r);
  return keyed[0].q;
}

// per-box counts for the progress strip
export function boxHistogram(srs, questions) {
  const h = new Array(BOXES).fill(0);
  for (const q of questions) h[entry(srs, q.id, q.mark).box]++;
  return h;
}

// parse a stored blob defensively: anything that is not the shape above is
// discarded field by field, never thrown on — a bad blob must not brick the page
export function parseSrs(json) {
  const out = emptySrs();
  let o;
  try { o = JSON.parse(json); } catch (err) { return out; }
  if (!o || typeof o !== "object" || !o.q || typeof o.q !== "object") return out;
  for (const [id, e] of Object.entries(o.q)) {
    if (!/^q[0-9a-f]{8}$/.test(id) || !e || typeof e !== "object") continue;
    const box = Number.isInteger(e.box) && e.box >= 0 && e.box < BOXES ? e.box : 0;
    out.q[id] = {box, due: +e.due || 0, last: +e.last || 0, seen: +e.seen || 0, streak: +e.streak || 0};
  }
  return out;
}
